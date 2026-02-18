# AI Image Generation Prompt Preset Manager

## 프로젝트 개요
NAI(NovelAI) 4/4.5를 활용하여 캐릭터 이미지 세트를 효율적으로 생성하고 관리하는 개인용 웹 애플리케이션.
포즈/제스처별 프롬프트 프리셋을 관리하고, 대량 생성 후 즐겨찾기·토너먼트로 최종 이미지를 선별하는 워크플로우를 지원한다.

## 기술 스택

### 프레임워크
- **TanStack Start** v1.132.0 — 풀스택 React 프레임워크
  - TanStack Router (파일 기반, 타입 세이프 라우팅)
  - TanStack Query (서버 상태 관리, 캐싱, 비동기 데이터 페칭)
  - Vite 7 (빌드 도구)
  - Server Functions (타입 세이프 RPC)
  - TanStack Virtual (가상 스크롤)
- **React 19.2**

### DB / ORM
- **SQLite** (better-sqlite3) — 로컬 파일 DB (`data/studio.db`)
- **Drizzle ORM** 0.45.1 — 타입 세이프 ORM
  - drizzle-kit 0.31.9으로 마이그레이션 관리 (7개 마이그레이션 파일)
  - 스키마 파일에서 TypeScript 타입 자동 추론

### UI
- **shadcn/ui** (radix-maia 스타일)
- **Radix UI** (@base-ui/react)
- **Tailwind CSS** 4.0.6
- **Figtree** 폰트 (@fontsource-variable/figtree)
- **Hugeicons** 아이콘 (@hugeicons/core-free-icons, @hugeicons/react)
- **Sonner** (토스트 알림)

### 다국어 (i18n)
- 자체 구현 i18n 시스템 (`src/lib/i18n/`)
- **지원 언어**: English (`en`), 한국어 (`ko`)
- `I18nProvider` + `useTranslation()` 훅
- localStorage 저장 (`87studio-locale` 키), `<html lang>` 자동 설정
- dot-notation 키 경로, `{{param}}` 파라미터 보간 지원
- 기본 언어: English

### 프롬프트 에디터
- **CodeMirror 6** — 프롬프트 편집기
  - 단부루(Danbooru) 태그 자동완성 지원
  - `{{placeholder}}` 구문 하이라이팅
  - 가중치(weight) 구문 하이라이팅
  - 커스텀 다크 테마
  - React.lazy()로 지연 로딩 (`<Textarea>` 폴백)

### 이미지 저장
- 로컬 파일시스템 (`data/` 디렉토리)
  - 원본: `data/images/{projectId}/{jobId}_{seed}_{timestamp}.png`
  - 썸네일: `data/thumbnails/{projectId}/{동일 파일명}`
  - 다운로드 ZIP: `data/downloads/{downloadId}.zip` (5분 후 자동 삭제)
- 썸네일 자동 생성 (sharp 라이브러리, 장변 300px 기준, 원본 비율 유지)

### 로깅
- 구조화된 JSON 로깅 (`src/server/services/logger.ts`)
- **로그 로테이션**: 5MB/파일, 최대 5개 (app.log + app.1~4.log)
- 파일: debug 이상, 콘솔: info 이상
- 저장 경로: `data/logs/`

### 비동기 처리
- 이미지 생성 큐는 서버 사이드 **in-memory 큐**로 관리
- **동시 요청은 1개**만 (순차 처리)
- **생성 간 간격(딜레이)**: 기본 500ms, 사용자가 UI에서 조절 가능 (0~30초)
- 프론트엔드에서 TanStack Query의 polling으로 진행률 확인 (진행 중 2초 간격)
- **서버 재시작 시 큐 자동 복구** (`recoverJobs()`: running→pending 리셋 후 재큐잉)

### 스타일링
- Tailwind CSS 4 (Vite 플러그인)
- **다크 테마 기본** (단일 테마, `<html className="dark">`)
- **반응형 디자인**: 데스크톱 + 태블릿 + 모바일 대응

## 프로젝트 구조
```
src/
├── routes/                    # TanStack Router 파일 기반 라우팅
│   ├── __root.tsx             # 루트 레이아웃 (사이드바, 하단 네비게이션, I18nProvider)
│   ├── index.tsx              # 대시보드 (프로젝트 목록, 진행 상태)
│   ├── workspace/
│   │   └── $projectId/
│   │       ├── route.tsx      # 워크스페이스 레이아웃
│   │       ├── index.tsx      # 프로젝트 워크스페이스 (프롬프트 편집, 씬 관리, 생성)
│   │       └── scenes/
│   │           └── $sceneId.tsx  # 씬 상세 (플레이스홀더 편집)
│   ├── gallery/
│   │   ├── index.tsx          # 갤러리 (필터링, 즐겨찾기, 다운로드)
│   │   └── $imageId.tsx       # 이미지 상세
│   ├── metadata/
│   │   └── index.tsx          # 이미지 메타데이터 인스펙터 + 프로젝트 생성
│   └── settings/
│       └── index.tsx          # 설정 (NAI API 키, 생성 딜레이, 언어 등)
├── components/
│   ├── ui/                    # shadcn/ui 컴포넌트 (22개)
│   ├── common/                # 공통 컴포넌트 (confirm-dialog, page-header, download-dialog)
│   ├── layout/                # 레이아웃 (sidebar, bottom-nav)
│   ├── prompt-editor/         # CodeMirror 기반 프롬프트 에디터
│   │   ├── prompt-editor.tsx  # 메인 에디터 컴포넌트
│   │   ├── danbooru-completion.ts  # 단부루 태그 자동완성
│   │   ├── placeholder-highlight.ts  # {{placeholder}} 하이라이팅
│   │   ├── weight-highlight.ts  # 가중치 구문 하이라이팅
│   │   └── theme.ts           # 커스텀 다크 테마
│   └── workspace/             # 워크스페이스 컴포넌트 (17개)
│       ├── workspace-layout.tsx   # 메인 레이아웃
│       ├── workspace-header.tsx   # 헤더
│       ├── prompt-panel.tsx       # 프롬프트 편집 패널
│       ├── scene-panel.tsx        # 씬 관리 패널
│       ├── scene-list.tsx         # 씬 리스트 뷰
│       ├── scene-matrix.tsx       # 씬 그리드 매트릭스
│       ├── scene-detail.tsx       # 씬 상세 편집
│       ├── scene-placeholder-panel.tsx  # 플레이스홀더 편집
│       ├── placeholder-editor.tsx # 플레이스홀더 값 에디터
│       ├── scene-pack-dialog.tsx  # 씬 팩 선택 다이얼로그
│       ├── character-popover.tsx  # 캐릭터 선택
│       ├── parameter-popover.tsx  # 생성 파라미터 설정 (모델 선택 포함)
│       ├── bottom-toolbar.tsx     # 생성 컨트롤
│       ├── generation-progress.tsx  # 진행률 표시
│       ├── history-panel.tsx      # 생성 이력
│       ├── import-dialog.tsx      # SD Studio JSON 임포트
│       └── tournament-dialog.tsx  # 이상형 월드컵 (토너먼트)
├── server/
│   ├── db/
│   │   ├── schema.ts          # Drizzle 스키마 정의 (13개 테이블)
│   │   ├── index.ts           # DB 연결 (better-sqlite3)
│   │   └── migrations/        # drizzle-kit 마이그레이션 파일 (0000~0006)
│   ├── services/
│   │   ├── prompt.ts          # 프롬프트 합성 로직
│   │   ├── nai.ts             # NAI API 클라이언트 (모델 선택 지원)
│   │   ├── generation.ts      # 생성 큐 관리 (큐 복구 포함)
│   │   ├── image.ts           # 이미지 저장, 썸네일 생성, 스토리지 관리
│   │   ├── download.ts        # 다운로드 ZIP 생성, 파일명 템플릿
│   │   └── logger.ts          # 구조화된 JSON 로깅 (로테이션)
│   └── functions/             # Server Functions (14개)
│       ├── settings.ts        # API 키, 딜레이 설정
│       ├── projects.ts        # 프로젝트 CRUD
│       ├── characters.ts      # 캐릭터 관리
│       ├── scene-packs.ts     # 글로벌 씬 팩 관리
│       ├── scenes.ts          # 글로벌 씬 관리
│       ├── project-scenes.ts  # 프로젝트별 씬 스냅샷
│       ├── generation.ts      # 이미지 생성 큐
│       ├── gallery.ts         # 이미지 조회/필터링
│       ├── workspace.ts       # 워크스페이스 데이터 집계
│       ├── import.ts          # SD Studio JSON 임포트
│       ├── tournament.ts      # 토너먼트 랭킹 로직
│       ├── inspect.ts         # 이미지 메타데이터 → 프로젝트 생성
│       ├── download.ts        # 이미지 다운로드 (ZIP, 필터링, 템플릿 파일명)
│       └── storage.ts         # 스토리지 통계, 고아 파일 정리
├── lib/
│   ├── placeholder.ts         # {{placeholder}} 파싱/치환 유틸
│   ├── utils.ts               # 일반 유틸리티 (cn 등)
│   ├── sd-studio-import.ts    # SD Studio JSON 파서
│   ├── nai-metadata.ts        # NAI 이미지 메타데이터 파서 (PNG tEXt, Stealth Alpha)
│   └── i18n/                  # 다국어 시스템
│       ├── index.ts           # 공개 API (I18nProvider, useTranslation)
│       ├── context.tsx        # React Context 프로바이더
│       ├── t.ts               # 번역 함수 팩토리
│       ├── types.ts           # 타입 정의 (Locale, TranslationKeys)
│       ├── en.ts              # 영어 번역
│       └── ko.ts              # 한국어 번역
├── router.tsx                 # TanStack Router 설정
├── routeTree.gen.ts           # 자동 생성 라우트 트리
└── styles.css                 # Tailwind CSS 글로벌 스타일
data/
├── studio.db                  # SQLite DB 파일
├── images/                    # 생성된 이미지 원본
│   └── {projectId}/           # 프로젝트별 하위 폴더
├── thumbnails/                # 썸네일
│   └── {projectId}/
├── downloads/                 # 임시 다운로드 ZIP (5분 후 자동 삭제)
└── logs/                      # 서버 로그 (로테이션)
    └── app.log
public/
└── danbooru-tags.json         # 단부루 태그 데이터 (자동완성용)
```

## 핵심 개념

### Project (프로젝트)
- 하나의 이미지 생성 단위 (씬)
- general_prompt, negative_prompt, 생성 파라미터(steps, cfg, sampler, model 등)를 가짐
- 프롬프트에 `{{placeholder}}` 형식의 플레이스홀더를 배치하여 씬별 가변 값을 삽입
- 하나의 프로젝트에 여러 캐릭터(슬롯)가 존재할 수 있음 (한 이미지에 모두 포함되는 캐릭터들)
- 대표 썸네일 이미지 설정 가능 (thumbnailImageId)

### Character (캐릭터)
- 프로젝트 내 NAI 캐릭터 프롬프트 슬롯
- 각 캐릭터는 독립적인 char_prompt와 char_negative(캐릭터별 네거티브 프롬프트)를 가짐
- `{{placeholder}}` 사용 가능
- slot_index로 순서 관리

### Scene Pack (씬 팩)
- 포즈/제스처 프리셋의 묶음 (글로벌 템플릿)
- 예: "기본 감정 세트" = { 웃음, 슬픔, 안녕, 화남 }

### Scene (씬)
- 씬 팩 내 개별 포즈/제스처 정의
- 각 플레이스홀더에 들어갈 기본값을 JSON으로 보유
- 예: "웃음" → { "expression": "smiling, happy", "background": "warm gradient" }

### 스냅샷 시스템
- 글로벌 씬 팩을 프로젝트에 할당하면 해당 시점의 내용이 복사됨 (project_scene_packs → project_scenes)
- 스냅샷 이후 독립적으로 편집 가능
- 글로벌 씬 팩 원본이 변경되어도 기존 할당에 영향 없음
- 같은 글로벌 씬 팩을 다시 할당하면 **새로운 project_scene_pack + project_scenes**가 생성됨 (덮어쓰기가 아닌 추가)
- source_scene_id로 원본 추적 (글로벌 씬 삭제 시 SET NULL)
- 프로젝트 씬에 대표 썸네일 이미지 설정 가능 (thumbnailImageId)

### Character Scene Override (캐릭터별 씬 오버라이드)
- 같은 씬이라도 캐릭터마다 다른 플레이스홀더 값을 가질 수 있음
- project_scenes.placeholders → general_prompt용
- character_scene_overrides.placeholders → 해당 캐릭터의 char_prompt용

### 토너먼트 (이상형 월드컵)
- 같은 씬에서 생성된 이미지들을 1:1 비교하여 랭킹 매김
- 결과: left, right, both_win, both_lose
- 이미지별 tournament_wins / tournament_losses 집계
- tournament_matches 테이블에 대전 기록 저장

### SD Studio 임포트
- SD Studio 프리셋 JSON 파일을 파싱하여 프로젝트/씬으로 변환

### 이미지 메타데이터 인스펙터 (/metadata)
- NAI 생성 이미지를 드래그 앤 드롭으로 업로드
- PNG tEXt 청크 또는 Stealth Alpha 방식으로 메타데이터 파싱
- 추출된 프롬프트, 파라미터, V4 캐릭터 캡션 등을 표시
- 메타데이터에서 직접 새 프로젝트 생성 가능 (선택적 필드 임포트)

### 이미지 다운로드 시스템
- 필터 기반 이미지 일괄 다운로드 (ZIP 형식)
- **필터 조건**: 프로젝트, 씬, 즐겨찾기, 최소 별점, 최소 승률, 태그, 직접 이미지 선택
- **파일명 템플릿**: `{{project_name}}`, `{{scene_name}}`, `{{seed}}`, `{{index}}`, `{{date}}`, `{{rating}}`, `{{id}}`, `{{wins}}`, `{{win_rate}}`
- 기본 템플릿: `{{project_name}}_{{scene_name}}_{{seed}}`
- ZIP은 5분 후 자동 삭제

### 스토리지 관리
- 파일시스템 vs DB 정합성 통계 조회 (총 파일 수, 크기, 고아 파일 수)
- 고아 파일 정리 (DB에 없는 파일 삭제 + 빈 디렉토리 정리)

## 프롬프트 합성 규칙
1. project.general_prompt의 `{{placeholder}}`를 project_scenes.placeholders 값으로 치환
2. 각 character.char_prompt의 `{{placeholder}}`를 character_scene_overrides.placeholders 값으로 치환
3. 매칭되지 않는 플레이스홀더는 빈 문자열로 처리
4. 합성된 최종 프롬프트는 generation_jobs.resolved_prompts에 JSON으로 저장 (재현용)
5. **중첩 플레이스홀더 불가** (`{{outer_{{inner}}}}` 형태 미지원)
6. 프롬프트 템플릿에서 **플레이스홀더 목록을 자동 추출**하여 씬 편집 UI에 입력 필드로 표시

## 이미지 생성 (비동기)
- NAI API를 직접 호출하여 이미지를 생성
- **모델 선택 가능**: V4.5 Curated/Full, V4 Curated/Full, V3 Anime, Furry V3 (기본: `nai-diffusion-4-5-full`)
- 배치 생성 지원: "프로젝트A × 웃음 × 20장" 형태
- **여러 씬을 한번에 선택하여 배치 생성 가능** (예: 프로젝트A × [웃음, 슬픔, 화남] × 각 10장)
- 프로젝트 내 여러 캐릭터는 **한 이미지에 포함되는 캐릭터들**임 (캐릭터별 독립 생성이 아님)
- 생성 요청은 큐에 등록되고 백그라운드에서 순차 처리 (~7초/장)
- **동시 API 요청은 1개**, 생성 간 기본 딜레이 500ms (사용자 조절: 0~30초)
- 생성 중에도 사용자는 갤러리 탐색, 프리셋 편집 등 다른 작업 가능
- TanStack Query polling으로 진행률 실시간 확인 (2초 간격)
- **NAI API 호출 실패 시 해당 job 상태를 failed로 설정** (errorMessage에 원인 저장, 자동 재시도 없음)
- **작업 취소**: 현재 진행 중인 API 요청은 완료 대기, 큐 내 나머지 대기 작업만 취소
- **서버 재시작 복구**: running 상태 job을 pending으로 리셋, 대기 중인 모든 job 재큐잉
- 완료 시 알림

## 갤러리 및 즐겨찾기
- 생성된 이미지는 자동으로 프로젝트 + 씬 태그가 붙어 저장
- 필터링 축: 프로젝트별, 씬(포즈)별, 즐겨찾기, 태그별, 글로벌 씬 기준 크로스 프로젝트
- 즐겨찾기 토글, 별점(1~5), 메모 기능
- **태그**: 사용자가 직접 수동으로 이미지에 태그 부여
- 각 이미지에 생성 시 사용된 전체 프롬프트, 파라미터, 시드값 등 메타데이터 보존
- 이미지는 로컬 파일시스템에 저장, 썸네일 자동 생성
- **갤러리 레이아웃**: 무한 스크롤 그리드
- **이미지 상세**: 별도 라우트 (`/gallery/$imageId`)
- **일괄 다운로드**: 필터/선택 기반 ZIP 다운로드 (파일명 템플릿 지원)

## 프론트엔드 UI 세부사항

### 대시보드 (/)
- 프로젝트 목록
- 현재 진행 중인 Job 상태
- 최근 생성된 이미지 미리보기

### 워크스페이스 (/workspace/$projectId)
- 프롬프트 편집 패널 (general_prompt, negative_prompt, 캐릭터별 char_prompt/char_negative)
- 씬 관리 패널 (리스트 뷰, 매트릭스 뷰)
- 씬 상세 편집 (플레이스홀더, 캐릭터별 오버라이드)
- 생성 파라미터 설정 (parameter-popover, 모델 선택 포함)
- 이미지 생성 진행률 및 이력
- SD Studio JSON 임포트
- 이상형 월드컵 (토너먼트)

### 메타데이터 인스펙터 (/metadata)
- 이미지 드래그 앤 드롭 업로드
- NAI 메타데이터 추출 (PNG tEXt, Stealth Alpha)
- 프롬프트, 파라미터, V4 캐릭터 캡션 표시
- 메타데이터에서 프로젝트 직접 생성

### 설정 페이지 (/settings)
- NAI API 키 입력/저장
- 이미지 생성 간 딜레이 설정 (기본 500ms, 범위 0~30초)
- 언어 선택 (English / 한국어)
- 스토리지 관리 (통계 조회, 고아 파일 정리)

### 프롬프트 에디터 (CodeMirror 6)
- 단부루(Danbooru) 태그 자동완성 (`/danbooru-tags.json`)
- `{{placeholder}}` 구문 하이라이팅 (시각적으로 구분)
- 가중치 구문 하이라이팅
- general_prompt, negative_prompt, char_prompt, char_negative 모두에 적용

### 반응형 디자인
- **데스크톱**: 풀 레이아웃, 사이드바 네비게이션
- **태블릿**: 축소된 사이드바, 적응형 그리드
- **모바일**: 하단 네비게이션 바, 단일 컬럼 레이아웃, 터치 최적화

## NAI API 세부사항

### 엔드포인트
- 이미지 생성: `https://image.novelai.net/ai/generate-image`
- 이미지 생성 (스트림): `https://image.novelai.net/ai/generate-image-stream`

### 지원 모델
| 모델 ID | 이름 |
|---------|------|
| nai-diffusion-4-5-curated | NAI Diffusion V4.5 Curated |
| nai-diffusion-4-5-full | NAI Diffusion V4.5 Full (기본값) |
| nai-diffusion-4-curated-preview | NAI Diffusion V4 Curated |
| nai-diffusion-4-full | NAI Diffusion V4 Full |
| nai-diffusion-3 | NAI Diffusion V3 (Anime) |
| nai-diffusion-furry-3 | NAI Diffusion Furry V3 |

### 인증
- `Authorization: Bearer ${token}` 헤더
- **API 키는 UI 설정 화면에서 사용자가 입력**, 서버 DB에 저장

### 응답
- **ZIP 형식**으로 이미지 데이터 반환 (fflate로 압축 해제)
- ZIP 압축 해제 후 이미지 파일 추출하여 `data/images/{projectId}/`에 저장

## DB 스키마 (Drizzle ORM) — 13개 테이블

### projects
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| name | text (NOT NULL) | |
| description | text | |
| general_prompt | text (DEFAULT '') | 플레이스홀더 포함 |
| negative_prompt | text (DEFAULT '') | |
| parameters | text (DEFAULT '{}') | JSON. model, steps, cfg, sampler, width, height 등 |
| thumbnail_image_id | integer | 대표 썸네일 이미지 ID |
| created_at | text (DEFAULT datetime('now')) | |
| updated_at | text (DEFAULT datetime('now')) | |

### characters
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| project_id | integer (FK → projects, CASCADE) | |
| slot_index | integer (DEFAULT 0) | UNIQUE(project_id, slot_index) |
| name | text (NOT NULL) | |
| char_prompt | text (NOT NULL, DEFAULT '') | 플레이스홀더 포함 |
| char_negative | text (NOT NULL, DEFAULT '') | 캐릭터별 네거티브 프롬프트 |
| created_at | text | |
| updated_at | text | |

### scene_packs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| name | text (NOT NULL) | |
| description | text | |
| created_at | text | |
| updated_at | text | |

### scenes
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| scene_pack_id | integer (FK → scene_packs, CASCADE) | |
| name | text (NOT NULL) | UNIQUE(scene_pack_id, name) |
| description | text | |
| placeholders | text (DEFAULT '{}') | JSON. 플레이스홀더 기본값 |
| sort_order | integer (DEFAULT 0) | |
| created_at | text | |
| updated_at | text | |

### project_scene_packs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| project_id | integer (FK → projects, CASCADE) | |
| scene_pack_id | integer (FK → scene_packs, SET NULL) | 원본 추적용 |
| name | text (NOT NULL) | |
| created_at | text | |

### project_scenes
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| project_scene_pack_id | integer (FK → project_scene_packs, CASCADE) | |
| source_scene_id | integer (FK → scenes, SET NULL) | 원본 추적용 |
| name | text (NOT NULL) | UNIQUE(project_scene_pack_id, name) |
| placeholders | text (DEFAULT '{}') | JSON. general_prompt용. 스냅샷, 편집 가능 |
| thumbnail_image_id | integer | 대표 썸네일 이미지 ID |
| sort_order | integer (DEFAULT 0) | |
| created_at | text | |
| updated_at | text | |

### character_scene_overrides
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| project_scene_id | integer (FK → project_scenes, CASCADE) | |
| character_id | integer (FK → characters, CASCADE) | |
| placeholders | text (DEFAULT '{}') | JSON. char_prompt용 플레이스홀더 |
| UNIQUE(project_scene_id, character_id) | | |

### generation_jobs
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| project_id | integer (FK → projects, CASCADE) | |
| project_scene_id | integer (FK → project_scenes, CASCADE) | |
| source_scene_id | integer (FK → scenes, SET NULL) | |
| resolved_prompts | text (NOT NULL) | JSON. 최종 합성 프롬프트 전체 |
| resolved_parameters | text (NOT NULL) | JSON |
| total_count | integer (DEFAULT 1) | |
| completed_count | integer (DEFAULT 0) | |
| status | text (DEFAULT 'pending') | pending, running, completed, failed, cancelled |
| error_message | text | 실패 시 에러 메시지 |
| created_at | text | |
| updated_at | text | |

### generated_images
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| job_id | integer (FK → generation_jobs, CASCADE) | |
| project_id | integer (FK → projects, CASCADE) | |
| project_scene_id | integer (FK → project_scenes, CASCADE) | |
| source_scene_id | integer (FK → scenes, SET NULL) | 글로벌 씬 기준 크로스 프로젝트 조회용 |
| file_path | text (NOT NULL) | 로컬 저장 경로 |
| thumbnail_path | text | |
| seed | integer | |
| metadata | text (DEFAULT '{}') | JSON |
| is_favorite | integer (DEFAULT 0) | 0 or 1 |
| rating | integer | 1~5 |
| memo | text | |
| tournament_wins | integer (DEFAULT 0) | 토너먼트 승수 |
| tournament_losses | integer (DEFAULT 0) | 토너먼트 패수 |
| created_at | text | |

### tags
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| name | text (NOT NULL, UNIQUE) | |

### image_tags
| 컬럼 | 타입 | 설명 |
|------|------|------|
| image_id | integer (FK → generated_images, CASCADE) | 복합 PK |
| tag_id | integer (FK → tags, CASCADE) | 복합 PK |

- 태그는 **사용자가 직접 수동으로** 이미지에 부여

### tournament_matches
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| project_scene_id | integer (FK → project_scenes, CASCADE) | |
| image1_id | integer (FK → generated_images, CASCADE) | |
| image2_id | integer (FK → generated_images, CASCADE) | |
| result | text (NOT NULL) | 'left', 'right', 'both_win', 'both_lose' |
| created_at | text | |

### settings (앱 설정 저장용)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| key | text (PK) | 설정 키 (예: 'nai_api_key', 'generation_delay') |
| value | text (NOT NULL) | 설정 값 |
| updated_at | text | |

## 인덱스
- characters: (project_id)
- scenes: (scene_pack_id)
- project_scene_packs: (project_id)
- project_scenes: (project_scene_pack_id)
- character_scene_overrides: (project_scene_id), (character_id)
- generation_jobs: (status), (project_id), (project_scene_id)
- generated_images: (project_id), (project_scene_id), (source_scene_id), (is_favorite), (job_id), (project_id, created_at), (is_favorite, created_at)
- image_tags: (tag_id)
- tournament_matches: (project_scene_id), (image1_id), (image2_id)

## 프로젝트 삭제 정책
- 프로젝트 삭제 시 **생성된 이미지 파일은 보존** (DB 레코드만 CASCADE 삭제, 파일 유지)

## 주요 사용 플로우
1. 설정 페이지에서 NAI API 키 입력
2. 씬 팩 생성 → 씬(포즈/제스처) 추가 (또는 SD Studio JSON 임포트)
3. 프로젝트 생성 → 캐릭터 슬롯 추가 → 프롬프트 템플릿 작성 (CodeMirror, 단부루 자동완성)
   - 또는 메타데이터 인스펙터에서 기존 NAI 이미지로부터 프로젝트 생성
4. 프로젝트에 씬 팩 할당 (스냅샷) → 캐릭터별 오버라이드 편집
5. 씬 선택 (다중 가능) → 배치 생성 (비동기)
6. 갤러리에서 결과 확인 → 즐겨찾기/별점/태그 선별
7. 이상형 월드컵으로 이미지 랭킹 → 최종 이미지 세트 완성
8. 갤러리에서 필터/선택 기반 일괄 다운로드

## 개발 명령어
```bash
pnpm install                    # 의존성 설치
pnpm dev                        # 개발 서버 실행 (포트 3000)
pnpm build                      # 프로덕션 빌드
pnpm start                      # 프로덕션 서버 실행
pnpm db:generate                # 마이그레이션 생성
pnpm db:migrate                 # 마이그레이션 적용
pnpm db:studio                  # Drizzle Studio (DB 브라우저)
```
