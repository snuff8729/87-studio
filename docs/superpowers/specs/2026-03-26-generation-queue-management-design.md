# Generation Queue Management System

## Overview

현재 이미지 생성 큐는 한 번에 하나의 생성 요청만 예약할 수 있고, 여러 프로젝트/Quick Generate에서 순차적으로 큐에 추가하거나 대기열을 관리하는 기능이 없다. 이 설계는 다중 소스(프로젝트, Quick Generate)에서 큐에 자유롭게 예약을 추가하고, 전용 UI에서 대기열을 드래그 앤 드롭으로 관리할 수 있는 시스템을 구현한다.

## Goals

1. **다중 소스 예약**: 프로젝트 워크스페이스, Quick Generate 등 어디서든 큐에 예약 추가 가능
2. **배치 그룹핑**: 한 번의 Generate로 생성된 Job들을 배치(Batch)로 묶어 관리
3. **드래그 앤 드롭 순서 관리**: 배치 간, 배치 내 Job 간 순서 변경
4. **배치/Job 단위 취소**: 묶음 취소 및 개별 Job 취소
5. **글로벌 큐 상태 표시**: 모든 페이지에서 큐 진행 상황 확인
6. **서버 재시작 시 순서 보존**: DB 기반 큐 순서로 영속성 확보

## Non-Goals

- 동시 API 요청 (여전히 1개씩 순차 처리)
- Job 간 우선순위 레벨 (높음/보통/낮음 같은 개념 없음, 순서만)
- 예약 시간 스케줄링 (특정 시각에 시작 등)

---

## 1. DB Schema Changes

### 1.1 New Table: `generation_batches`

한 번의 Generate 액션으로 생성된 Job 묶음.

| Column        | Type                              | Description                                    |
| ------------- | --------------------------------- | ---------------------------------------------- |
| `id`          | integer (PK, autoincrement)       |                                                |
| `project_id`  | integer (FK → projects, SET NULL) | null = Quick Generate                          |
| `label`       | text (NOT NULL)                   | UI 표시명. 예: "프로젝트A — 웃음, 슬픔, 화남"  |
| `queue_order` | integer (NOT NULL)                | 배치 간 순서 (낮을수록 먼저 실행)              |
| `status`      | text (DEFAULT 'pending')          | pending, running, completed, failed, cancelled |
| `created_at`  | text (DEFAULT datetime('now'))    |                                                |

**Indexes:**

- `(status, queue_order)` — 활성 배치 순서 조회

### 1.2 Alter Table: `generation_jobs`

| Change          | Type                                       | Description                      |
| --------------- | ------------------------------------------ | -------------------------------- |
| + `batch_id`    | integer (FK → generation_batches, CASCADE) | null for legacy jobs             |
| + `queue_order` | integer (DEFAULT 0)                        | 배치 내 Job 순서 (낮을수록 먼저) |

**Indexes:**

- `(batch_id, queue_order)` — 배치 내 Job 순서 조회

### 1.3 Migration Strategy

- 기존 pending/running 상태의 Job이 있으면, 마이그레이션에서 자동으로 batch를 생성하여 연결
- 완료/실패/취소된 기존 Job의 batch_id는 null로 유지 (레거시)

---

## 2. Queue Engine Changes (`src/server/services/generation.ts`)

### 2.1 In-Memory Array Removal

**Before:**

```ts
const queue: number[] = [] // job IDs in memory
```

**After:**

```ts
// queue 배열 제거
// DB에서 다음 작업을 조회하는 함수로 대체
```

### 2.2 `getNextJob()` — DB 기반 다음 작업 조회

```ts
function getNextJob(): { jobId: number; batchId: number } | null {
  // 1. status IN ('pending', 'running')인 batch 중 queue_order 가장 낮은 batch
  // 2. 그 batch 내 status='pending'인 job 중 queue_order 가장 낮은 job
  // → SELECT ... FROM generation_jobs j
  //   JOIN generation_batches b ON j.batch_id = b.id
  //   WHERE j.status = 'pending'
  //   ORDER BY b.queue_order ASC, j.queue_order ASC
  //   LIMIT 1
}
```

### 2.3 `processQueue()` Flow

```
processQueue():
  if (processing) return
  processing = true

  while (true):
    if (queueStopped) break

    next = getNextJob()
    if (!next) break  // 큐 비었음

    // batch status → running (아직 아니면)
    updateBatchStatus(next.batchId, 'running')

    processJob(next.jobId)

    // batch 내 모든 job 완료 여부 체크 → batch status 갱신
    updateBatchStatusIfComplete(next.batchId)

  processing = false
```

### 2.4 `processJob()` Changes

기존 로직 대부분 유지. 변경점:

- 매 이미지 생성 완료 후 `queueStopped` 체크는 그대로
- Job이 cancelled로 변경됐는지 DB 체크도 그대로
- **추가**: 현재 job의 batch가 cancelled 됐는지도 체크

### 2.5 `enqueueJob()` → `enqueueBatch()`

```ts
// 기존 enqueueJob(jobId)는 내부용으로 유지 (processQueue 트리거)
// 새로운 진입점:
export function enqueueBatch(batchId: number) {
  // processQueue가 멈춰있으면 시작
  if (!processing) processQueue()
}
```

### 2.6 Reorder APIs

```ts
// 배치 순서 변경 — 전체 순서 배열 전달
export function reorderBatches(batchIds: number[]) {
  // batchIds[i] → queue_order = i
  // running 상태인 batch는 현재 이미지 완료 후 다음부터 적용
}

// 배치 내 Job 순서 변경
export function reorderJobsInBatch(batchId: number, jobIds: number[]) {
  // jobIds[i] → queue_order = i
  // pending 상태 job만 대상
}
```

### 2.7 Cancel APIs

```ts
// 기존 cancelPendingJobs(jobIds) 유지

// 배치 단위 취소 추가
export function cancelBatch(batchId: number) {
  // batch 내 모든 pending job → cancelled
  // running job → 현재 이미지 완료 후 cancelled (기존 패턴: DB status를 cancelled로 설정, processJob의 루프에서 체크)
  // batch status → cancelled
}
```

### 2.8 Batch Timing

```ts
// 글로벌 타이밍 (전체 큐)
export function getGlobalQueueStats(): {
  totalPendingImages: number // 모든 pending+running job의 남은 이미지 수
  completedImages: number // 현재 세션에서 완료된 이미지 수
  avgImageDurationMs: number | null
  etaMs: number | null
}

// 배치별 타이밍은 DB 집계로 계산
// batch 내 jobs의 SUM(completedCount) / SUM(totalCount)
```

### 2.9 `recoverJobs()` Changes

```ts
export function recoverJobs() {
  // 기존: running job → pending 리셋
  // 추가: running batch → pending 리셋 (batch 내에 pending job이 있으면)
  //       batch 내 모든 job이 completed면 batch도 completed로
  // 큐 순서는 DB queue_order에 이미 저장되어 있으므로 별도 재큐잉 불필요
}
```

---

## 3. Server Functions (`src/server/functions/`)

### 3.1 `generation.ts` Changes

**Modified:**

- `createGenerationJob` → batch 생성 후 job들을 batch에 연결
- `fetchQueueStatus` → 글로벌 큐 요약 정보 포함 (배치 수, 전체 남은 이미지 수, ETA)

**New:**

- `listQueueBatches()` — 활성 큐 배치 목록 (pending/running, queue_order 순)
- `listRecentBatches()` — 최근 완료/실패/취소 배치 (최근 20개)
- `getBatchDetail(batchId)` — 배치 내 Job 목록
- `reorderQueueBatches({ batchIds })` — 배치 순서 변경
- `reorderBatchJobs({ batchId, jobIds })` — 배치 내 Job 순서 변경
- `cancelBatch(batchId)` — 배치 취소
- `retryBatch(batchId)` — 실패 배치 재시도 (새 batch 생성)

### 3.2 `quick-generation.ts` Changes

- `createQuickGenerationJob` → batch 생성 포함

---

## 4. Queue Page UI (`/queue`)

### 4.1 Route

- `src/routes/queue/index.tsx`
- 사이드바에 메뉴 항목 추가 (갤러리와 설정 사이)

### 4.2 Layout

```
┌─────────────────────────────────────────────────────┐
│ Queue                            [⏸ Pause] [▶ Resume]│
│ 3 batches · 147 images remaining · ~17m ETA          │
├──────────────────────────────────────────────────────┤
│                                                      │
│ ≡ 🟢 프로젝트A — 웃음, 슬픔, 화남     12/60   [취소] │
│   ├ 🔵 웃음   5/20  (running)                        │
│   ├ ○ 슬픔   0/20                          [취소]    │
│   └ ○ 화남   0/20                          [취소]    │
│                                                      │
│ ≡ ○ Quick Generate                  0/3    [취소]     │
│                                                      │
│ ≡ ○ 프로젝트B — 기쁨, 분노           0/84   [취소]    │
│   ├ ○ 기쁨   0/42                          [취소]    │
│   └ ○ 분노   0/42                          [취소]    │
│                                                      │
├────────────────── 완료 / 실패 ────────────────────────┤
│ ✅ 프로젝트A — 미소              20/20      2분 전    │
│ ❌ Quick Generate (실패)          3/5       5분 전    │
└──────────────────────────────────────────────────────┘
```

### 4.3 Components

| Component            | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `QueuePage`          | 메인 페이지. 상단 요약 + 활성 큐 + 완료 이력                 |
| `QueueHeader`        | 글로벌 통계 (배치 수, 남은 이미지, ETA) + 일시정지/재개 버튼 |
| `BatchList`          | 드래그 앤 드롭 가능한 배치 리스트 (`@dnd-kit/sortable`)      |
| `BatchItem`          | 단일 배치 행. 펼침/접기 토글, 진행률, 취소 버튼              |
| `JobList`            | 배치 내 Job 리스트 (펼쳤을 때). 드래그 앤 드롭 가능          |
| `JobItem`            | 단일 Job 행. 진행률, 취소 버튼                               |
| `CompletedBatchList` | 최근 완료/실패/취소 배치 목록                                |

### 4.4 Interactions

| Action                  | Mechanism                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| 배치 순서 변경          | ≡ 핸들 드래그 앤 드롭. drop 시 `reorderQueueBatches` 호출                                    |
| 배치 내 Job 순서 변경   | 배치 펼친 상태에서 Job 드래그 앤 드롭. drop 시 `reorderBatchJobs` 호출                       |
| 배치 취소               | 배치 행의 취소 버튼 → confirm dialog → `cancelBatch` 호출                                    |
| 개별 Job 취소           | Job 행의 취소 버튼 → `cancelJobs` 호출                                                       |
| 진행 중 Job 뒤로 보내기 | running job에 "뒤로 보내기" 버튼 → job을 pending으로 변경, queue_order를 batch 내 마지막으로 |
| 전체 일시정지/재개      | 상단 버튼 → 기존 `pauseGeneration`/`resumeGeneration` 호출                                   |
| 실패 배치 재시도        | 완료 이력의 재시도 버튼 → `retryBatch` 호출                                                  |
| 갤러리 이동             | 완료된 배치 클릭 → 갤러리 해당 프로젝트 필터로 이동                                          |

### 4.5 Empty State

큐가 비어있을 때: "대기 중인 작업이 없습니다. 워크스페이스나 Quick Generate에서 이미지를 생성해보세요." + 워크스페이스/Quick Generate 바로가기 링크.

### 4.6 Data Fetching

- `listQueueBatches` + `listRecentBatches`: TanStack Query, 큐 활성 시 2초 polling
- `getBatchDetail`: 배치 펼칠 때 on-demand fetch
- Optimistic updates: 드래그 앤 드롭 시 UI 즉시 반영, 서버 응답 후 확정

---

## 5. Global Queue Status Widget

### 5.1 Location

- **Desktop**: 사이드바 하단 (네비게이션 메뉴 아래)
- **Mobile**: 하단 네비게이션 바 위 또는 큐 아이콘에 배지

### 5.2 Display

```
[■■■■□□□□□□] 43/147 · ~12m
```

- 프로그레스 바 + 완료/전체 수 + ETA
- 에러: 빨간색 바 + "Error" 텍스트
- 일시정지: 노란색 바 + "Paused" 텍스트
- 큐 비어있으면 위젯 숨김
- 클릭 시 `/queue`로 이동

### 5.3 Component

- `QueueStatusWidget` — 사이드바/하단 네비에 삽입
- `fetchQueueStatus`의 확장된 응답 사용

---

## 6. Existing Code Integration

### 6.1 Workspace (`createGenerationJob`)

```
Before:
  for each sceneId:
    INSERT generation_jobs → enqueueJob(job.id)

After:
  1. INSERT generation_batches (label, project_id, queue_order = MAX+1)
  2. for each sceneId:
       INSERT generation_jobs (batch_id, queue_order = index)
  3. enqueueBatch(batch.id)
```

### 6.2 Quick Generate (`createQuickGenerationJob`)

```
Before:
  INSERT generation_jobs → enqueueJob(job.id)

After:
  1. INSERT generation_batches (label = "Quick Generate", project_id = null, queue_order = MAX+1)
  2. INSERT generation_jobs (batch_id)
  3. enqueueBatch(batch.id)
```

### 6.3 Workspace GenerationProgress

- 유지. 현재 프로젝트의 활성 Job만 필터링하여 표시.
- 추가: "큐 전체 보기" 링크 → `/queue`로 이동

### 6.4 Dashboard

- 기존 진행 중 Job 상태 표시를 배치 기반으로 변경
- "큐 관리" 링크 추가

### 6.5 Sidebar / Bottom Navigation

- 큐 메뉴 항목 추가 (아이콘: TimeQuarter02Icon 또는 유사)
- QueueStatusWidget 삽입

---

## 7. Dependencies

| Package              | Purpose             |
| -------------------- | ------------------- |
| `@dnd-kit/core`      | 드래그 앤 드롭 코어 |
| `@dnd-kit/sortable`  | 정렬 가능한 리스트  |
| `@dnd-kit/utilities` | CSS 유틸리티        |

---

## 8. i18n Keys

`queue.*` 네임스페이스 추가 (en.ts, ko.ts):

- `queue.title`, `queue.empty`, `queue.batchesCount`, `queue.imagesRemaining`
- `queue.cancel`, `queue.cancelBatch`, `queue.retry`, `queue.retryBatch`
- `queue.pause`, `queue.resume`, `queue.paused`, `queue.error`
- `queue.completed`, `queue.failed`, `queue.cancelled`
- `queue.moveToBack`, `queue.recentHistory`
- `queue.emptyDescription`

---

## 9. Testing Strategy

- **Unit tests**: `reorderBatches`, `getNextJob` 로직 (DB 모킹 또는 in-memory SQLite)
- **Integration**: 배치 생성 → 큐잉 → 순서 변경 → 취소 플로우
- 기존 generation 관련 테스트가 없으므로(DB 의존), 이번에도 서비스 레벨 테스트는 스코프 외. 순수 함수 위주로 테스트.
