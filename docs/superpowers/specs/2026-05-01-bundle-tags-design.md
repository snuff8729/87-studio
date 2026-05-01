# Bundle Tag System

## Overview

Bundle(프롬프트 스니펫)에 태그를 부여하여 분류하고, Bundles 페이지 검색바에서 `#` prefix로 태그 기반 필터링 + 자동완성을 지원한다.

## DB Schema

### `bundle_tags` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| name | text (NOT NULL, UNIQUE) | 태그 이름 |

### `bundle_tag_assignments` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| bundle_id | integer (FK → promptBundles, CASCADE) | 복합 PK |
| tag_id | integer (FK → bundle_tags, CASCADE) | 복합 PK |

인덱스: `bundle_tag_assignments(tag_id)`

기존 이미지용 `tags`/`imageTags` 테이블과 완전히 분리된 독립 테이블이다.

### 미사용 태그 정리

어떤 Bundle에도 연결되지 않은 태그는 `setBundleTags` 호출 시 자동 삭제한다.

## Server Functions

### 신규

- **`listBundleTags()`** — 전체 Bundle 태그 목록 반환 (자동완성용). `Array<{ id: number; name: string }>`.
- **`setBundleTags(bundleId: number, tagNames: string[])`** — Bundle의 태그를 통째로 교체. 존재하지 않는 태그명은 자동 생성. 교체 후 미사용 태그 정리.

### 기존 변경

- **`listBundles()`** — 반환값에 각 Bundle의 태그 목록 (`tags: Array<{ id: number; name: string }>`)을 포함하도록 확장.

## UI: Bundle 편집 패널 — 태그 입력

Bundle 상세 편집 영역(오른쪽 패널)에 태그 입력 필드를 추가한다.

- 현재 태그를 chip 형태로 표시, 각 chip에 `×` 버튼으로 제거
- 텍스트 입력 시 기존 태그 자동완성 드롭다운 표시
- 드롭다운에 없는 새 태그도 Enter/콤마로 자유 생성 가능
- 변경 시 debounced 저장 (기존 Bundle name/content 편집과 동일한 800ms debounce 패턴)

## UI: 검색바 — `#` Prefix 태그 필터

기존 Bundles 페이지 검색바를 확장한다.

### 동작

1. `#` 입력 시 태그 자동완성 드롭다운 표시
2. 드롭다운에서 태그 선택(또는 Enter) 시 검색바 안에 태그 chip으로 표시
3. chip 삽입 후 입력 커서 유지 — 추가 태그 또는 텍스트 검색 계속 가능
4. 태그 chip의 `×`로 제거 가능

### 필터 로직

- **여러 태그 chip**: OR 조건 (선택한 태그 중 하나라도 가진 Bundle 표시)
- **태그 chip + 일반 텍스트**: AND 조합 (태그 OR 필터를 통과한 Bundle 중 이름에 텍스트가 포함된 것)

## 영향 범위

- `src/server/db/schema.ts` — 테이블 2개 추가
- `src/server/functions/bundles.ts` — 함수 2개 추가, `listBundles` 수정
- `src/routes/bundles/index.tsx` — 검색바 확장, 태그 입력 필드 추가
- `src/lib/i18n/en.ts`, `src/lib/i18n/ko.ts` — Bundle 태그 관련 번역 키 추가
- DB 마이그레이션 파일 1개 추가
