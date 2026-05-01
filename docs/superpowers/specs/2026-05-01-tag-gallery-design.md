# Danbooru Tag Gallery

## Overview

Danbooru 태그를 북마크하여 썸네일, 메모, 분류 태그와 함께 개인 레퍼런스로 관리하는 시스템. 독립 페이지(`/tags`)와 워크스페이스 사이드 패널 두 가지 진입점을 제공한다.

## 목적

1. **태그 탐색** — "포즈 뭐 있지?", "머리 종류 뭐가 있지?" → 분류 태그로 필터링하여 빠르게 브라우징
2. **태그 레퍼런스** — 썸네일 + 메모로 태그의 시각적 결과를 기록하고 나중에 참고

## DB 스키마 (`studio.db`)

### `tag_bookmarks` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| name | text (NOT NULL, UNIQUE) | 태그 이름 (danbooru name 또는 커스텀) |
| memo | text | 사용자 메모 |
| thumbnail_image_id | integer (FK → tag_bookmark_images) | 대표 썸네일 |
| created_at | text (DEFAULT datetime('now')) | |
| updated_at | text (DEFAULT datetime('now')) | |

### `tag_bookmark_images` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| bookmark_id | integer (FK → tag_bookmarks, CASCADE) | |
| source | text (NOT NULL) | `'gallery'` 또는 `'upload'` |
| gallery_image_id | integer | generated_images 참조 (source=gallery) |
| file_path | text (NOT NULL) | 이미지 파일 경로 |
| thumbnail_path | text | 썸네일 경로 |
| sort_order | integer (DEFAULT 0) | |
| created_at | text (DEFAULT datetime('now')) | |

인덱스: `tag_bookmark_images(bookmark_id)`

### `tag_bookmark_tags` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | integer (PK, autoincrement) | |
| name | text (NOT NULL, UNIQUE) | 분류 태그 이름 |

### `tag_bookmark_tag_assignments` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| bookmark_id | integer (FK → tag_bookmarks, CASCADE) | 복합 PK |
| tag_id | integer (FK → tag_bookmark_tags, CASCADE) | 복합 PK |

인덱스: `tag_bookmark_tag_assignments(tag_id)`

### 미사용 태그 정리

어떤 북마크에도 연결되지 않은 분류 태그는 `setBookmarkTags` 호출 시 자동 삭제.

## Server Functions

### 북마크 CRUD

- **`listTagBookmarks(filters?)`** — 북마크 목록 조회. 필터: 분류 태그(OR), 텍스트 검색(이름). 반환값에 대표 썸네일 경로, 분류 태그 목록, danbooru 정보(post_count, category) 포함.
- **`getTagBookmark(id)`** — 단일 북마크 상세. 이미지 목록, 분류 태그, 메모, danbooru 정보 포함.
- **`createTagBookmark(data: { name, memo? })`** — 북마크 생성. 이름 중복 시 에러.
- **`updateTagBookmark(data: { id, memo? })`** — 메모 수정. debounced.
- **`deleteTagBookmark(id)`** — 북마크 삭제. 업로드 이미지 파일도 정리.

### 이미지 관리

- **`addBookmarkImageFromGallery(bookmarkId, galleryImageId)`** — 갤러리 이미지를 북마크에 연결. generated_images의 file_path/thumbnail_path를 참조.
- **`addBookmarkImageUpload(bookmarkId, file)`** — 외부 이미지 업로드. `data/tag-images/{bookmarkId}/` 에 저장, 썸네일 자동 생성.
- **`removeBookmarkImage(imageId)`** — 이미지 제거. upload 소스면 파일도 삭제.
- **`setBookmarkThumbnail(bookmarkId, imageId)`** — 대표 썸네일 설정.

### 분류 태그

- **`listBookmarkTags()`** — 전체 분류 태그 목록 (자동완성용).
- **`setBookmarkTags(bookmarkId, tagNames[])`** — 북마크의 분류 태그 통째로 교체. 없는 태그 자동 생성. 미사용 태그 정리.

### Danbooru 검색

- 기존 `searchDanbooruTags(query)` 재활용 — 북마크 추가 시 danbooru 태그 검색용.

## UI: 독립 페이지 (`/tags`)

Bundles 페이지와 유사한 split-panel 레이아웃.

### 좌측 패널 — 북마크 목록

- 썸네일 카드 그리드 (대표 썸네일 또는 placeholder)
- 카드에 태그 이름, danbooru 카테고리 컬러, 분류 태그 chip 표시
- 검색바: `#` prefix로 분류 태그 필터 + 일반 텍스트로 이름 검색 (Bundles 페이지와 동일 UX)
- 추가 버튼: danbooru 검색 다이얼로그 또는 커스텀 이름 입력

### 우측 패널 — 북마크 상세

- 태그 이름 (danbooru 카테고리 뱃지)
- danbooru 정보: post count, 카테고리
- 메모 편집 (textarea, debounced 저장)
- 분류 태그 chip 입력 (Bundle Tag와 동일 UX)
- 이미지 갤러리 그리드:
  - 갤러리에서 추가 버튼
  - 외부 이미지 업로드 버튼 (드래그 앤 드롭)
  - 클릭으로 대표 썸네일 설정
  - 삭제 버튼
- 삭제 버튼 (ConfirmDialog)

### 북마크 추가 플로우

1. "추가" 버튼 클릭
2. danbooru 태그 검색 입력 (FTS5) — 결과에서 선택하면 해당 이름으로 북마크 생성
3. 또는 "커스텀" 토글 → 자유 이름 입력

## UI: 워크스페이스 사이드 패널

프롬프트 편집 중 열 수 있는 간이 참조 패널.

- 워크스페이스 헤더 또는 프롬프트 패널에 토글 버튼
- 패널 내용:
  - 북마크 그리드 (소형 썸네일)
  - 분류 태그 필터
  - 텍스트 검색
  - 태그 이름 클릭 → 현재 프롬프트 에디터에 태그 텍스트 삽입
  - 상세보기 링크 → `/tags` 페이지로 이동

## 이미지 저장 구조

```
data/
└── tag-images/
    └── {bookmarkId}/
        ├── {uuid}.png          # 업로드 원본
        └── {uuid}_thumb.png    # 썸네일 (300px)
```

갤러리 이미지 소스의 경우 파일 복사 없이 기존 경로 참조.

## i18n

`en.ts`, `ko.ts`에 `tagGallery` 섹션 추가:
- 페이지 제목/설명
- CRUD 토스트 메시지
- 검색, 필터, 메모 관련 라벨
- 워크스페이스 패널 라벨

## 영향 범위

- `src/server/db/schema.ts` — 테이블 4개 추가
- `src/server/functions/tag-bookmarks.ts` — 신규
- `src/routes/tags/index.tsx` — 신규 페이지
- `src/components/workspace/tag-gallery-panel.tsx` — 신규 사이드 패널
- `src/components/workspace/workspace-layout.tsx` — 패널 토글 연결
- `src/lib/i18n/en.ts`, `ko.ts` — 번역 키 추가
- `src/routes/__root.tsx` — 네비게이션에 Tags 링크 추가
- DB 마이그레이션 1개
