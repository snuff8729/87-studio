# AI Image Generation Prompt Preset Manager

## 프로젝트 개요

NAI(NovelAI) 4/4.5를 활용하여 캐릭터 이미지 세트를 효율적으로 생성하고 관리하는 개인용 웹 애플리케이션.
포즈/제스처별 프롬프트 프리셋을 관리하고, 대량 생성 후 즐겨찾기·토너먼트로 최종 이미지를 선별하는 워크플로우를 지원한다.

## 라이선스

- **PolyForm Noncommercial License 1.0.0** (`LICENSE` 파일)

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
  - drizzle-kit 0.31.9으로 마이그레이션 관리 (14개 마이그레이션 파일)
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
  - `@{slot:name}` 구문 하이라이팅
  - `@{bundle:name}` 번들 참조 하이라이팅 및 자동완성
  - 존재하지 않는 번들 참조 경고 하이라이팅
  - 번들 참조 호버 툴팁 (내용 미리보기)
  - 가중치(weight) 구문 하이라이팅
  - 우클릭 컨텍스트 메뉴 (태그 정보 조회, 복사, 삭제, Danbooru 페이지 열기)
  - 에디터 헤더 (퀵 액션 툴)
  - 전체 화면 확장 편집 다이얼로그
  - 커스텀 다크 테마
  - React.lazy()로 지연 로딩 (`<Textarea>` 폴백)

### 이미지 저장 및 서빙

- 로컬 파일시스템 (`data/` 디렉토리)
  - 원본: `data/images/{projectId}/{jobId}_{seed}_{timestamp}.png`
  - 썸네일: `data/thumbnails/{projectId}/{동일 파일명}`
  - 다운로드 ZIP: `data/downloads/{downloadId}.zip` (5분 후 자동 삭제)
- 썸네일 자동 생성 (sharp 라이브러리, 장변 300px 기준, 원본 비율 유지)
- **이미지 서빙**: Vite 커스텀 플러그인 (`serveDataFiles()` in `vite.config.ts`)
  - `/api/images/`, `/api/thumbnails/`, `/api/downloads/`, `/api/references/` 경로 매핑
  - 프로덕션은 Nitro가 정적 파일 서빙 처리

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
│   │   ├── route.tsx          # 갤러리 레이아웃
│   │   ├── index.tsx          # 갤러리 (필터링, 즐겨찾기, 다운로드)
│   │   └── $imageId.tsx       # 이미지 상세
│   ├── bundles/
│   │   └── index.tsx          # 프롬프트 번들 관리
│   ├── generate/
│   │   └── index.tsx          # 빠른 생성 (프로젝트 없이 직접 생성)
│   ├── queue/
│   │   └── index.tsx          # 생성 큐 상태 시각화
│   ├── tags/
│   │   └── index.tsx          # 태그 갤러리, 검색, 북마크
│   ├── metadata/
│   │   └── index.tsx          # 이미지 메타데이터 인스펙터 + 프로젝트 생성
│   └── settings/
│       └── index.tsx          # 설정 (NAI API 키, 생성 딜레이, 언어 등)
├── components/
│   ├── ui/                    # shadcn/ui 컴포넌트 (23개)
│   ├── common/                # 공통 컴포넌트
│   │   ├── confirm-dialog.tsx     # 확인 다이얼로그
│   │   ├── page-header.tsx        # 페이지 헤더
│   │   ├── download-dialog.tsx    # 다운로드 다이얼로그
│   │   ├── grid-size-toggle.tsx   # 그리드 크기 토글
│   │   ├── expanded-textarea-dialog.tsx  # 전체 화면 텍스트 편집
│   │   └── image-detail-overlay.tsx     # 이미지 상세 오버레이
│   ├── layout/                # 레이아웃 (sidebar, bottom-nav)
│   ├── onboarding/            # 온보딩 시스템
│   │   ├── welcome-dialog.tsx     # 환영 다이얼로그
│   │   ├── onboarding-overlay.tsx # 메인 오버레이 컨트롤러
│   │   ├── instruction-tooltip.tsx # 단계별 안내 툴팁
│   │   ├── spotlight-backdrop.tsx # 포커스 영역 하이라이트
│   │   └── completion-dialog.tsx  # 완료 다이얼로그
│   ├── prompt-editor/         # CodeMirror 기반 프롬프트 에디터 (12개)
│   │   ├── prompt-editor.tsx      # 메인 에디터 컴포넌트
│   │   ├── prompt-editor-header.tsx  # 에디터 헤더 (퀵 액션)
│   │   ├── danbooru-completion.ts # 단부루 태그 자동완성
│   │   ├── bundle-completion.ts   # 번들 참조 자동완성
│   │   ├── bundle-highlight.ts    # @{bundle:name} 하이라이팅
│   │   ├── bundle-tooltip.ts      # 번들 참조 호버 툴팁
│   │   ├── invalid-ref-highlight.ts  # 존재하지 않는 참조 경고
│   │   ├── placeholder-highlight.ts  # @{slot:name} 하이라이팅
│   │   ├── weight-highlight.ts    # 가중치 구문 하이라이팅
│   │   ├── editor-context-menu.tsx   # 우클릭 컨텍스트 메뉴
│   │   ├── expanded-editor-dialog.tsx  # 전체 화면 편집 다이얼로그
│   │   └── theme.ts               # 커스텀 다크 테마
│   ├── tag-gallery/           # 태그 갤러리 컴포넌트
│   │   ├── tag-gallery-content.tsx  # 태그 갤러리 콘텐츠
│   │   └── tag-gallery-dialog.tsx   # 태그 갤러리 다이얼로그
│   ├── queue/                 # 큐 컴포넌트
│   │   └── queue-status-widget.tsx  # 큐 상태 위젯
│   └── workspace/             # 워크스페이스 컴포넌트 (18개)
│       ├── workspace-layout.tsx   # 메인 레이아웃
│       ├── workspace-header.tsx   # 헤더
│       ├── prompt-panel.tsx       # 프롬프트 편집 패널
│       ├── scene-panel.tsx        # 씬 관리 패널
│       ├── scene-matrix.tsx       # 씬 그리드 매트릭스
│       ├── scene-detail.tsx       # 씬 상세 편집
│       ├── scene-placeholder-panel.tsx  # 플레이스홀더 편집
│       ├── placeholder-editor.tsx # 플레이스홀더 값 에디터
│       ├── scene-pack-dialog.tsx  # 씬 팩 선택 다이얼로그
│       ├── compare-dialog.tsx     # 이미지 비교 다이얼로그
│       ├── convert-to-template-dialog.tsx  # 프로젝트 씬 → 글로벌 씬 팩 변환
│       ├── parameter-popover.tsx  # 생성 파라미터 설정 (모델 선택 포함)
│       ├── reference-panel.tsx    # 참조 이미지 관리 (Vibe Transfer, Precise Control)
│       ├── bottom-toolbar.tsx     # 생성 컨트롤
│       ├── generation-progress.tsx  # 진행률 표시
│       ├── history-panel.tsx      # 생성 이력
│       ├── import-dialog.tsx      # SD Studio JSON 임포트
│       └── tournament-dialog.tsx  # 이상형 월드컵 (토너먼트)
├── server/
│   ├── db/
│   │   ├── schema.ts          # Drizzle 스키마 정의 (23개 테이블)
│   │   ├── index.ts           # DB 연결 (better-sqlite3)
│   │   └── migrations/        # drizzle-kit 마이그레이션 파일 (0000~0013)
│   ├── services/
│   │   ├── prompt.ts          # 프롬프트 합성 로직
│   │   ├── nai.ts             # NAI API 클라이언트 (모델 선택 지원)
│   │   ├── generation.ts      # 생성 큐 관리 (큐 복구 포함)
│   │   ├── image.ts           # 이미지 저장, 썸네일 생성, 스토리지 관리
│   │   ├── download.ts        # 다운로드 ZIP 생성, 파일명 템플릿
│   │   ├── reference.ts       # 참조 이미지 처리 (Vibe 인코딩, Precise 리사이즈/레터박싱)
│   │   └── logger.ts          # 구조화된 JSON 로깅 (로테이션)
│   └── functions/             # Server Functions (20개)
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
│       ├── storage.ts         # 스토리지 통계, 고아 파일 정리
│       ├── bundles.ts         # 프롬프트 번들 CRUD, 번들 태그 관리
│       ├── danbooru.ts        # Danbooru API 연동 (태그 조회, 검색)
│       ├── quick-generation.ts  # 빠른 생성 워크플로우
│       ├── queue.ts           # 큐 상태 조회 및 관리
│       ├── references.ts      # 참조 이미지 관리 (업로드, 삭제, 파라미터 업데이트)
│       └── tag-bookmarks.ts   # 태그 북마크 CRUD 및 이미지 연결
├── lib/
│   ├── placeholder.ts         # @{slot:name} 파싱/치환 유틸
│   ├── bundle.ts              # @{bundle:name} 참조 추출/치환 유틸
│   ├── use-bundles.ts         # 번들 데이터 React Query 훅
│   ├── utils.ts               # 일반 유틸리티 (cn 등)
│   ├── sd-studio-import.ts    # SD Studio JSON 파서
│   ├── nai-metadata.ts        # NAI 이미지 메타데이터 파서 (PNG tEXt, Stealth Alpha)
│   ├── use-image-grid-size.ts # 갤러리 그리드 크기 훅 (sm/md/lg)
│   ├── theme/                 # 테마 시스템
│   │   ├── index.ts           # 공개 API
│   │   ├── context.tsx        # React Context 프로바이더
│   │   └── types.ts           # 타입 정의
│   ├── onboarding/            # 온보딩 시스템
│   │   ├── index.ts           # 공개 API
│   │   ├── context.tsx        # React Context 프로바이더
│   │   ├── steps.ts           # 온보딩 단계 정의 (9단계)
│   │   └── types.ts           # 타입 정의
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
├── references/                # 참조 이미지 (Vibe Transfer, Precise Control)
│   └── {projectId}/
├── downloads/                 # 임시 다운로드 ZIP (5분 후 자동 삭제)
└── logs/                      # 서버 로그 (로테이션)
    └── app.log
public/
└── danbooru-tags.json         # 단부루 태그 데이터 (자동완성용)
start.sh                       # Linux/macOS 간편 실행 스크립트 (Node.js 자동 다운로드)
start.bat                      # Windows 간편 실행 스크립트
LICENSE                        # PolyForm Noncommercial 1.0.0
```

## 핵심 개념

### Project (프로젝트)

- 하나의 이미지 생성 단위 (씬)
- general_prompt, negative_prompt, 생성 파라미터(steps, cfg, sampler, model 등)를 가짐
- 프롬프트에 `@{slot:name}` 형식의 플레이스홀더를 배치하여 씬별 가변 값을 삽입
- 하나의 프로젝트에 여러 캐릭터(슬롯)가 존재할 수 있음 (한 이미지에 모두 포함되는 캐릭터들)
- 대표 썸네일 이미지 설정 가능 (thumbnailImageId)

### Character (캐릭터)

- 프로젝트 내 NAI 캐릭터 프롬프트 슬롯
- 각 캐릭터는 독립적인 char_prompt와 char_negative(캐릭터별 네거티브 프롬프트)를 가짐
- `@{slot:name}` 사용 가능
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

### Prompt Bundle (프롬프트 번들)

- 재사용 가능한 프롬프트 스니펫 라이브러리
- `@{bundle:name}` 구문으로 프롬프트 내에서 참조
- 번들 태그로 분류/정리 가능
- 생성된 이미지와 연결 (image_bundles 테이블)
- 에디터에서 자동완성, 하이라이팅, 호버 툴팁 지원
- 대표 썸네일 이미지 설정 가능

### Reference Image (참조 이미지)

- **Vibe Transfer**: 참조 이미지의 스타일/분위기를 생성에 반영
  - 이미지를 NAI API로 인코딩하여 .bin 파일로 저장
  - strength, information_extracted 파라미터 조절
  - 인코딩에 사용한 모델 추적 (모델 변경 시 재인코딩 필요)
- **Precise Control**: 참조 이미지의 구도/포즈를 정밀하게 반영
  - 이미지를 생성 해상도에 맞게 리사이즈+레터박싱
  - strength, fidelity, referenceMode(character/style/character&style) 파라미터
- 프로젝트별 여러 참조 이미지 등록 가능, 개별 활성화/비활성화
- Quick Generate에서도 참조 이미지 사용 가능 (projectId = null)

### Generation Batch (생성 배치)

- 여러 생성 Job을 하나의 배치로 묶어 관리
- 배치별 큐 순서(queueOrder) 제어
- 배치 단위 상태 추적 (pending, running, completed, failed, cancelled)

### Tag Bookmark (태그 북마크)

- Danbooru 태그를 컬렉션으로 관리
- 북마크별 메모, 참고 이미지 저장 (갤러리 이미지 또는 업로드)
- 북마크 태그로 분류/정리 가능

### Quick Generate (빠른 생성)

- 프로젝트/씬 설정 없이 직접 이미지 생성하는 간소화 워크플로우
- 참조 이미지 지원
- 프로젝트 기반 플로우의 대안

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

### 온보딩 시스템

- 처음 사용자를 위한 단계별 가이드 튜토리얼 (9단계: 환영 → API 키 설정 → 프로젝트 생성 → 워크스페이스 진입 → 프롬프트 작성 → 씬 추가 → 씬 편집 → 플레이스홀더 입력 → 이미지 생성)
- Spotlight 하이라이트 + 안내 툴팁으로 UI 요소 강조
- 이벤트/라우트/조건 기반 자동 진행, 수동 진행, 건너뛰기 지원
- localStorage에 진행 상태 저장

### 이미지 비교

- 같은 씬에서 생성된 이미지들을 나란히 비교 (`compare-dialog.tsx`)
- 4장씩 페이지네이션, 시드/즐겨찾기/별점/승률 정보 표시

### 씬 팩 변환 (프로젝트 씬 → 글로벌 템플릿)

- 프로젝트의 커스텀 씬을 글로벌 씬 팩으로 역변환 (`convert-to-template-dialog.tsx`)
- 선택한 씬들의 플레이스홀더를 글로벌 씬 팩 템플릿으로 저장

## 프롬프트 합성 규칙

1. `@{bundle:name}` 번들 참조를 해당 번들의 content로 치환
2. project.general_prompt의 `@{slot:name}`를 project_scenes.placeholders 값으로 치환
3. 각 character.char_prompt의 `@{slot:name}`를 character_scene_overrides.placeholders 값으로 치환
4. 매칭되지 않는 플레이스홀더는 빈 문자열로 처리
5. 합성된 최종 프롬프트는 generation_jobs.resolved_prompts에 JSON으로 저장 (재현용)
6. **중첩 플레이스홀더 불가** (`@{slot:}` 구문 내 중첩 미지원)
7. 프롬프트 템플릿에서 **플레이스홀더 목록을 자동 추출**하여 씬 편집 UI에 입력 필드로 표시

## 이미지 생성 (비동기)

- NAI API를 직접 호출하여 이미지를 생성
- **모델 선택 가능**: V4.5 Curated/Full, V4 Curated/Full, V3 Anime, Furry V3 (기본: `nai-diffusion-4-5-full`)
- 배치 생성 지원: "프로젝트A × 웃음 × 20장" 형태
- **여러 씬을 한번에 선택하여 배치 생성 가능** (예: 프로젝트A × [웃음, 슬픔, 화남] × 각 10장)
- 프로젝트 내 여러 캐릭터는 **한 이미지에 포함되는 캐릭터들**임 (캐릭터별 독립 생성이 아님)
- **참조 이미지 지원**: Vibe Transfer (스타일 반영), Precise Control (구도/포즈 반영)
- 생성 요청은 배치(batch) 단위로 큐에 등록되고 백그라운드에서 순차 처리 (~7초/장)
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
- 씬 관리 패널 (매트릭스 뷰)
- 씬 상세 편집 (플레이스홀더, 캐릭터별 오버라이드)
- 참조 이미지 관리 패널 (Vibe Transfer, Precise Control)
- 생성 파라미터 설정 (parameter-popover, 모델 선택 포함)
- 이미지 생성 진행률 및 이력
- 이미지 비교 (같은 씬 이미지 나란히 비교)
- 씬 팩 변환 (프로젝트 씬 → 글로벌 템플릿)
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

### 프롬프트 번들 (/bundles)

- 프롬프트 스니펫 라이브러리 관리
- 번들 CRUD, 태그 분류
- 번들 갤러리 이미지 연결

### 빠른 생성 (/generate)

- 프로젝트/씬 설정 없이 직접 이미지 생성
- 참조 이미지 지원

### 큐 (/queue)

- 생성 큐 실시간 상태 시각화
- 배치별 진행 현황

### 태그 갤러리 (/tags)

- Danbooru 태그 검색 및 상세 정보 조회
- 태그 북마크 컬렉션 관리
- 북마크별 참고 이미지 갤러리

### 프롬프트 에디터 (CodeMirror 6)

- 단부루(Danbooru) 태그 자동완성 (`/danbooru-tags.json`)
- `@{slot:name}` 구문 하이라이팅 (시각적으로 구분)
- `@{bundle:name}` 번들 참조 하이라이팅, 자동완성, 호버 툴팁
- 존재하지 않는 참조 경고 하이라이팅
- 가중치 구문 하이라이팅
- 우클릭 컨텍스트 메뉴 (태그 정보, 복사, 삭제, Danbooru 페이지)
- 전체 화면 확장 편집
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

| 모델 ID                         | 이름                             |
| ------------------------------- | -------------------------------- |
| nai-diffusion-4-5-curated       | NAI Diffusion V4.5 Curated       |
| nai-diffusion-4-5-full          | NAI Diffusion V4.5 Full (기본값) |
| nai-diffusion-4-curated-preview | NAI Diffusion V4 Curated         |
| nai-diffusion-4-full            | NAI Diffusion V4 Full            |
| nai-diffusion-3                 | NAI Diffusion V3 (Anime)         |
| nai-diffusion-furry-3           | NAI Diffusion Furry V3           |

### 인증

- `Authorization: Bearer ${token}` 헤더
- **API 키는 UI 설정 화면에서 사용자가 입력**, 서버 DB에 저장

### 응답

- **ZIP 형식**으로 이미지 데이터 반환 (fflate로 압축 해제)
- ZIP 압축 해제 후 이미지 파일 추출하여 `data/images/{projectId}/`에 저장

## DB 스키마 (Drizzle ORM) — 23개 테이블

### projects

| 컬럼               | 타입                           | 설명                                               |
| ------------------ | ------------------------------ | -------------------------------------------------- |
| id                 | integer (PK, autoincrement)    |                                                    |
| name               | text (NOT NULL)                |                                                    |
| description        | text                           |                                                    |
| general_prompt     | text (DEFAULT '')              | 플레이스홀더 포함                                  |
| negative_prompt    | text (DEFAULT '')              |                                                    |
| parameters         | text (DEFAULT '{}')            | JSON. model, steps, cfg, sampler, width, height 등 |
| thumbnail_image_id | integer                        | 대표 썸네일 이미지 ID                              |
| created_at         | text (DEFAULT datetime('now')) |                                                    |
| updated_at         | text (DEFAULT datetime('now')) |                                                    |

### characters

| 컬럼          | 타입                             | 설명                           |
| ------------- | -------------------------------- | ------------------------------ |
| id            | integer (PK, autoincrement)      |                                |
| project_id    | integer (FK → projects, CASCADE) |                                |
| slot_index    | integer (DEFAULT 0)              | UNIQUE(project_id, slot_index) |
| name          | text (NOT NULL)                  |                                |
| char_prompt   | text (NOT NULL, DEFAULT '')      | 플레이스홀더 포함              |
| char_negative | text (NOT NULL, DEFAULT '')      | 캐릭터별 네거티브 프롬프트     |
| created_at    | text                             |                                |
| updated_at    | text                             |                                |

### scene_packs

| 컬럼        | 타입                        | 설명 |
| ----------- | --------------------------- | ---- |
| id          | integer (PK, autoincrement) |      |
| name        | text (NOT NULL)             |      |
| description | text                        |      |
| created_at  | text                        |      |
| updated_at  | text                        |      |

### scenes

| 컬럼          | 타입                                | 설명                        |
| ------------- | ----------------------------------- | --------------------------- |
| id            | integer (PK, autoincrement)         |                             |
| scene_pack_id | integer (FK → scene_packs, CASCADE) |                             |
| name          | text (NOT NULL)                     | UNIQUE(scene_pack_id, name) |
| description   | text                                |                             |
| placeholders  | text (DEFAULT '{}')                 | JSON. 플레이스홀더 기본값   |
| sort_order    | integer (DEFAULT 0)                 |                             |
| created_at    | text                                |                             |
| updated_at    | text                                |                             |

### project_scene_packs

| 컬럼          | 타입                                 | 설명        |
| ------------- | ------------------------------------ | ----------- |
| id            | integer (PK, autoincrement)          |             |
| project_id    | integer (FK → projects, CASCADE)     |             |
| scene_pack_id | integer (FK → scene_packs, SET NULL) | 원본 추적용 |
| name          | text (NOT NULL)                      |             |
| created_at    | text                                 |             |

### project_scenes

| 컬럼                  | 타입                                        | 설명                                      |
| --------------------- | ------------------------------------------- | ----------------------------------------- |
| id                    | integer (PK, autoincrement)                 |                                           |
| project_scene_pack_id | integer (FK → project_scene_packs, CASCADE) |                                           |
| source_scene_id       | integer (FK → scenes, SET NULL)             | 원본 추적용                               |
| name                  | text (NOT NULL)                             | UNIQUE(project_scene_pack_id, name)       |
| placeholders          | text (DEFAULT '{}')                         | JSON. general_prompt용. 스냅샷, 편집 가능 |
| thumbnail_image_id    | integer                                     | 대표 썸네일 이미지 ID                     |
| sort_order            | integer (DEFAULT 0)                         |                                           |
| created_at            | text                                        |                                           |
| updated_at            | text                                        |                                           |

### character_scene_overrides

| 컬럼                                   | 타입                                   | 설명                             |
| -------------------------------------- | -------------------------------------- | -------------------------------- |
| id                                     | integer (PK, autoincrement)            |                                  |
| project_scene_id                       | integer (FK → project_scenes, CASCADE) |                                  |
| character_id                           | integer (FK → characters, CASCADE)     |                                  |
| placeholders                           | text (DEFAULT '{}')                    | JSON. char_prompt용 플레이스홀더 |
| UNIQUE(project_scene_id, character_id) |                                        |                                  |

### generation_batches

| 컬럼        | 타입                                    | 설명                                           |
| ----------- | --------------------------------------- | ---------------------------------------------- |
| id          | integer (PK, autoincrement)             |                                                |
| project_id  | integer (FK → projects, SET NULL)       |                                                |
| label       | text (NOT NULL)                         | 배치 라벨                                      |
| queue_order | integer (NOT NULL)                      | 큐 내 순서                                     |
| status      | text (DEFAULT 'pending')                | pending, running, completed, failed, cancelled |
| created_at  | text                                    |                                                |

### generation_jobs

| 컬럼                | 타입                                        | 설명                                           |
| ------------------- | ------------------------------------------- | ---------------------------------------------- |
| id                  | integer (PK, autoincrement)                 |                                                |
| project_id          | integer (FK → projects, CASCADE)            |                                                |
| project_scene_id    | integer (FK → project_scenes, CASCADE)      |                                                |
| source_scene_id     | integer (FK → scenes, SET NULL)             |                                                |
| batch_id            | integer (FK → generation_batches, CASCADE)  | 소속 배치                                      |
| queue_order         | integer (DEFAULT 0)                         | 배치 내 순서                                   |
| resolved_prompts    | text (NOT NULL)                             | JSON. 최종 합성 프롬프트 전체                  |
| resolved_parameters | text (NOT NULL)                             | JSON                                           |
| total_count         | integer (DEFAULT 1)                         |                                                |
| completed_count     | integer (DEFAULT 0)                         |                                                |
| status              | text (DEFAULT 'pending')                    | pending, running, completed, failed, cancelled |
| error_message       | text                                        | 실패 시 에러 메시지                            |
| created_at          | text                                        |                                                |
| updated_at          | text                                        |                                                |

### generated_images

| 컬럼              | 타입                                    | 설명                                  |
| ----------------- | --------------------------------------- | ------------------------------------- |
| id                | integer (PK, autoincrement)             |                                       |
| job_id            | integer (FK → generation_jobs, CASCADE) |                                       |
| project_id        | integer (FK → projects, CASCADE)        |                                       |
| project_scene_id  | integer (FK → project_scenes, CASCADE)  |                                       |
| source_scene_id   | integer (FK → scenes, SET NULL)         | 글로벌 씬 기준 크로스 프로젝트 조회용 |
| file_path         | text (NOT NULL)                         | 로컬 저장 경로                        |
| thumbnail_path    | text                                    |                                       |
| seed              | integer                                 |                                       |
| metadata          | text (DEFAULT '{}')                     | JSON                                  |
| is_favorite       | integer (DEFAULT 0)                     | 0 or 1                                |
| rating            | integer                                 | 1~5                                   |
| memo              | text                                    |                                       |
| tournament_wins   | integer (DEFAULT 0)                     | 토너먼트 승수                         |
| tournament_losses | integer (DEFAULT 0)                     | 토너먼트 패수                         |
| created_at        | text                                    |                                       |

### tags

| 컬럼 | 타입                        | 설명 |
| ---- | --------------------------- | ---- |
| id   | integer (PK, autoincrement) |      |
| name | text (NOT NULL, UNIQUE)     |      |

### image_tags

| 컬럼     | 타입                                     | 설명    |
| -------- | ---------------------------------------- | ------- |
| image_id | integer (FK → generated_images, CASCADE) | 복합 PK |
| tag_id   | integer (FK → tags, CASCADE)             | 복합 PK |

- 태그는 **사용자가 직접 수동으로** 이미지에 부여

### tournament_matches

| 컬럼             | 타입                                     | 설명                                     |
| ---------------- | ---------------------------------------- | ---------------------------------------- |
| id               | integer (PK, autoincrement)              |                                          |
| project_scene_id | integer (FK → project_scenes, CASCADE)   |                                          |
| image1_id        | integer (FK → generated_images, CASCADE) |                                          |
| image2_id        | integer (FK → generated_images, CASCADE) |                                          |
| result           | text (NOT NULL)                          | 'left', 'right', 'both_win', 'both_lose' |
| created_at       | text                                     |                                          |

### prompt_bundles

| 컬럼               | 타입                        | 설명              |
| ------------------ | --------------------------- | ----------------- |
| id                 | integer (PK, autoincrement) |                   |
| name               | text (NOT NULL, UNIQUE)     |                   |
| description        | text                        |                   |
| content            | text (NOT NULL, DEFAULT '') | 번들 프롬프트     |
| thumbnail_image_id | integer                     | 대표 썸네일       |
| created_at         | text                        |                   |
| updated_at         | text                        |                   |

### bundle_tags

| 컬럼 | 타입                        | 설명 |
| ---- | --------------------------- | ---- |
| id   | integer (PK, autoincrement) |      |
| name | text (NOT NULL, UNIQUE)     |      |

### bundle_tag_assignments

| 컬럼      | 타입                                     | 설명    |
| --------- | ---------------------------------------- | ------- |
| bundle_id | integer (FK → prompt_bundles, CASCADE)   | 복합 PK |
| tag_id    | integer (FK → bundle_tags, CASCADE)      | 복합 PK |

### tag_bookmarks

| 컬럼               | 타입                        | 설명         |
| ------------------ | --------------------------- | ------------ |
| id                 | integer (PK, autoincrement) |              |
| name               | text (NOT NULL, UNIQUE)     |              |
| memo               | text                        |              |
| thumbnail_image_id | integer                     | 대표 썸네일  |
| created_at         | text                        |              |
| updated_at         | text                        |              |

### tag_bookmark_images

| 컬럼             | 타입                                   | 설명                    |
| ---------------- | -------------------------------------- | ----------------------- |
| id               | integer (PK, autoincrement)            |                         |
| bookmark_id      | integer (FK → tag_bookmarks, CASCADE)  |                         |
| source           | text (NOT NULL)                        | 'gallery' or 'upload'   |
| gallery_image_id | integer                                | 갤러리 이미지 참조      |
| file_path        | text (NOT NULL)                        |                         |
| thumbnail_path   | text                                   |                         |
| sort_order       | integer (DEFAULT 0)                    |                         |
| created_at       | text                                   |                         |

### tag_bookmark_tags

| 컬럼 | 타입                        | 설명 |
| ---- | --------------------------- | ---- |
| id   | integer (PK, autoincrement) |      |
| name | text (NOT NULL, UNIQUE)     |      |

### tag_bookmark_tag_assignments

| 컬럼        | 타입                                      | 설명    |
| ----------- | ----------------------------------------- | ------- |
| bookmark_id | integer (FK → tag_bookmarks, CASCADE)     | 복합 PK |
| tag_id      | integer (FK → tag_bookmark_tags, CASCADE) | 복합 PK |

### image_bundles

| 컬럼      | 타입                                     | 설명    |
| --------- | ---------------------------------------- | ------- |
| image_id  | integer (FK → generated_images, CASCADE) | 복합 PK |
| bundle_id | integer (FK → prompt_bundles, CASCADE)   | 복합 PK |

### reference_images

| 컬럼                   | 타입                                | 설명                                           |
| ---------------------- | ----------------------------------- | ---------------------------------------------- |
| id                     | integer (PK, autoincrement)         |                                                |
| project_id             | integer (FK → projects, CASCADE)    | null = Quick Generate                          |
| type                   | text (NOT NULL)                     | 'vibe' or 'precise'                            |
| file_path              | text (NOT NULL)                     | 원본 이미지 경로                               |
| thumbnail_path         | text                                |                                                |
| processed_path         | text                                | precise: 리사이즈+레터박싱 이미지              |
| encoded_vibe_path      | text                                | vibe: 인코딩된 .bin 파일 경로                  |
| encoded_model          | text                                | vibe: 인코딩에 사용한 모델                     |
| strength               | real (NOT NULL, DEFAULT 0.6)        |                                                |
| information_extracted   | real (NOT NULL, DEFAULT 1.0)        | vibe only                                      |
| fidelity               | real (NOT NULL, DEFAULT 1.0)        | precise only                                   |
| reference_mode         | text (NOT NULL, DEFAULT 'character&style') | precise: character/style/character&style |
| sort_order             | integer (NOT NULL, DEFAULT 0)       |                                                |
| enabled                | integer (NOT NULL, DEFAULT 1)       |                                                |
| created_at             | text                                |                                                |
| updated_at             | text                                |                                                |

### settings (앱 설정 저장용)

| 컬럼       | 타입            | 설명                                            |
| ---------- | --------------- | ----------------------------------------------- |
| key        | text (PK)       | 설정 키 (예: 'nai_api_key', 'generation_delay') |
| value      | text (NOT NULL) | 설정 값                                         |
| updated_at | text            |                                                 |

## 인덱스

- characters: (project_id)
- scenes: (scene_pack_id)
- project_scene_packs: (project_id)
- project_scenes: (project_scene_pack_id)
- character_scene_overrides: (project_scene_id), (character_id)
- generation_batches: (status, queue_order)
- generation_jobs: (status), (project_id), (project_scene_id), (batch_id, queue_order)
- generated_images: (project_id), (project_scene_id), (source_scene_id), (is_favorite), (job_id), (project_id, created_at), (is_favorite, created_at)
- image_tags: (tag_id)
- tournament_matches: (project_scene_id), (image1_id), (image2_id)
- bundle_tag_assignments: (tag_id)
- tag_bookmark_images: (bookmark_id)
- tag_bookmark_tag_assignments: (tag_id)
- image_bundles: (bundle_id)
- reference_images: (project_id), (project_id, type)

## 프로젝트 삭제 정책

- 프로젝트 삭제 시 **생성된 이미지 파일은 보존** (DB 레코드만 CASCADE 삭제, 파일 유지)

## 주요 사용 플로우

### 프로젝트 기반 (정석)

1. 설정 페이지에서 NAI API 키 입력
2. (선택) 프롬프트 번들 생성 → 자주 쓰는 프롬프트 스니펫 등록
3. 씬 팩 생성 → 씬(포즈/제스처) 추가 (또는 SD Studio JSON 임포트)
4. 프로젝트 생성 → 캐릭터 슬롯 추가 → 프롬프트 템플릿 작성 (CodeMirror, 단부루 자동완성)
   - 또는 메타데이터 인스펙터에서 기존 NAI 이미지로부터 프로젝트 생성
5. (선택) 참조 이미지 등록 (Vibe Transfer / Precise Control)
6. 프로젝트에 씬 팩 할당 (스냅샷) → 캐릭터별 오버라이드 편집
7. 씬 선택 (다중 가능) → 배치 생성 (비동기)
8. 갤러리에서 결과 확인 → 즐겨찾기/별점/태그 선별
9. 이상형 월드컵으로 이미지 랭킹 → 최종 이미지 세트 완성
10. 갤러리에서 필터/선택 기반 일괄 다운로드

### 빠른 생성

1. /generate에서 프롬프트 직접 입력 → 참조 이미지 설정 → 즉시 생성

## 배포 / 실행

- **간편 실행**: `start.sh` (Linux/macOS) / `start.bat` (Windows)
  - Node.js v22.12.0 자동 다운로드 (`./runtime/node/`), 의존성 설치, DB 마이그레이션, 빌드, 서버 실행, 브라우저 오픈
  - Node.js가 설치되지 않은 환경에서도 사용 가능

## 개발 명령어

```bash
pnpm install                    # 의존성 설치
pnpm dev                        # 개발 서버 실행 (포트 3000)
pnpm build                      # 프로덕션 빌드
pnpm start                      # 프로덕션 서버 실행
pnpm test                       # 테스트 실행 (vitest)
pnpm lint                       # ESLint
pnpm format                     # Prettier
pnpm check                      # Prettier + ESLint 자동 수정
pnpm db:generate                # 마이그레이션 생성
pnpm db:migrate                 # 마이그레이션 적용
pnpm db:studio                  # Drizzle Studio (DB 브라우저)
```

## 테스트

### 구성

- **Vitest** v3 — 테스트 프레임워크 (`vitest.config.ts`에서 별도 설정)
- **환경**: Node (서버 유틸리티 대상, 브라우저 API 불필요)
- **경로 별칭**: `@/*` → `./src/*` (vite-tsconfig-paths 플러그인)
- **실행**: `pnpm test` (one-shot), `pnpm test -- --watch` (워치 모드)

### 테스트 파일 구조

테스트 파일은 대상 모듈과 같은 디렉토리의 `__tests__/` 하위에 배치:

```
src/
├── lib/
│   └── __tests__/
│       ├── placeholder.test.ts      # 플레이스홀더 추출/치환
│       ├── bundle.test.ts           # 번들 참조 추출/치환
│       ├── sd-studio-import.test.ts # SD Studio JSON 파싱
│       └── nai-metadata.test.ts     # NAI 메타데이터 파싱 (PNG tEXt, A1111)
└── server/
    └── services/
        └── __tests__/
            └── download.test.ts     # 파일명 템플릿 치환
```

### 테스트 대상 모듈

| 모듈                              | 테스트 항목                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/lib/placeholder.ts`          | `extractPlaceholders`, `resolvePlaceholders` — 정규식 기반 플레이스홀더 추출/치환, 엣지 케이스                        |
| `src/lib/bundle.ts`               | `extractBundleReferences`, `resolveBundles` — `@{bundle:name}` 구문 추출/치환                                         |
| `src/lib/sd-studio-import.ts`     | `parseSdStudioFile` — 입력 검증, 카테시안 곱, 라이브러리 참조, 이름 중복 처리, 프롬프트 정리                          |
| `src/lib/nai-metadata.ts`         | `parseNAIMetadata`, `getUcPresetLabel` — PNG 바이너리 tEXt 청크 파싱, NAI/A1111 형식 변환, V4 프롬프트, Vibe Transfer |
| `src/server/services/download.ts` | `resolveFilenameTemplate` — 변수 치환, 금지 문자 제거, 빈 결과 폴백                                                   |

### 테스트 작성 규칙

- `import { describe, it, expect } from 'vitest'` 명시적 임포트
- DB 의존성이 있는 서비스(`prompt.ts`, `generation.ts`)는 현재 테스트 제외 (별도 모킹 필요)
- `nai-metadata.test.ts`에서 PNG 바이너리를 직접 생성하여 tEXt 청크 파싱 테스트 (Stealth Alpha는 브라우저 API 의존으로 제외)
