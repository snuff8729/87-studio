# AI Image Generation Prompt Preset Manager

## 프로젝트 개요

NAI(NovelAI) 4/4.5를 활용하여 캐릭터 이미지 세트를 효율적으로 생성하고 관리하는 개인용 웹 애플리케이션.
포즈/제스처별 프롬프트 프리셋을 관리하고, 대량 생성 후 즐겨찾기·토너먼트로 최종 이미지를 선별하는 워크플로우를 지원한다.

## 라이선스

- **GPL-3.0-only** (`LICENSE` 파일, package.json `license`). NAIA2.0(DNT-LAB, GPL-3.0)의 한국어 태그 데이터를 변환·수정해 사용하므로 재라이선스됨 — 출처·사용한 커밋·변환 내용은 `THIRD_PARTY_NOTICES.md`

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
  - drizzle-kit 0.31.9으로 마이그레이션 관리 (17개 마이그레이션 파일)
  - 스키마 파일에서 TypeScript 타입 자동 추론

### UI

- **shadcn/ui** (radix-maia 스타일)
  - 앱 셸: `Sidebar` (collapsible="icon"), `Breadcrumb`, `Sheet`, `ScrollArea`
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
- 기본 언어: 저장된 선택이 없으면 브라우저/OS 언어를 따르며(`navigator.languages`), 지원하지 않는 언어면 English로 폴백

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
- **데이터 디렉토리** (`STUDIO_DATA_DIR`, 기본 `./data`): DB·로그·이미지·썸네일·참조·다운로드·tag-images 위치
  - DB에는 항상 논리 경로(`data/images/...`)가 저장되고, 디스크 접근 시 `src/server/data-dir.ts`(`dataPath()`)와 `src/server/data-fs.ts`(node:fs 래퍼)가 `STUDIO_DATA_DIR`로 매핑. 환경변수가 없으면 경로를 그대로 사용(동작 변화 없음)
  - drizzle.config.ts(`db:migrate`)도 `STUDIO_DATA_DIR`를 따름. 데모/테스트 서버를 실제 `./data`와 분리하는 용도 (vite dev의 cwd는 레포 루트여야 하므로 cwd 방식 대신 사용)

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
- **다크 전용** (라이트 모드/테마 토글 없음, `<html className="dark">`, `:root`에 다크 값 정의)
  - 뉴트럴 그래파이트 베이스 (`--background: #111113`, `--card: #18181b`, `--sidebar: #0c0c0e`) + Rose→Coral 그라디언트 액센트 (`--primary: #ff6b8b`)
  - 브랜드 토큰: `--brand-from: #ff4d7d`, `--brand-to: #ff8a5c`, `--brand-gradient`, `--brand-glow`
  - 유틸리티 클래스: `.bg-brand-gradient`, `.shadow-brand-glow`
  - `<Button variant="brand">`는 화면당 단일 주 액션(Generate)에만 사용, 그 외는 `default`(solid `--primary`)
  - UI 스케일 설정은 유지
- **반응형 디자인**: 데스크톱 + 태블릿 + 모바일 대응

## 프로젝트 구조

```
src/
├── routes/                    # TanStack Router 파일 기반 라우팅
│   ├── __root.tsx             # 루트 레이아웃 (SidebarProvider 앱 셸, 브레드크럼 헤더, I18nProvider)
│   ├── index.tsx              # 대시보드 (프로젝트 목록, 진행 상태)
│   ├── workspace/
│   │   └── $projectId/
│   │       ├── route.tsx      # 워크스페이스 레이아웃
│   │       ├── index.tsx      # 프로젝트 워크스페이스 (EditorShell: 씬 탭 + 선택 씬 뷰 + 히스토리, ?scene=)
│   │       └── scenes/
│   │           └── $sceneId.tsx  # 레거시 URL → /workspace/$projectId?scene=$sceneId 리다이렉트
│   ├── gallery/
│   │   ├── route.tsx          # 갤러리 레이아웃
│   │   ├── index.tsx          # 갤러리 (필터링, 즐겨찾기, 다운로드)
│   │   └── $imageId.tsx       # 이미지 상세
│   ├── characters/
│   │   └── index.tsx          # 캐릭터 파츠 라이브러리 (?tab=characters|outfits|presets|axes&id=&projectId=)
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
│   ├── ui/                    # shadcn/ui 컴포넌트 (29개, resizable·command(cmdk) 포함)
│   ├── editor-shell/          # 에디터 공용 레이아웃 (빠른 생성, 워크스페이스)
│   │   ├── editor-shell.tsx       # 좌(탭+고정 Generate 푸터)/중앙/우 리사이즈·접기 패널, 모바일 Edit/Result/History 전환
│   │   ├── editor-header.tsx      # 에디터 헤더 (SidebarTrigger, 타이틀, 액션, 패널 토글)
│   │   ├── editor-left-panel.tsx  # 탭 헤더(배지) + 스크롤 본문 + 푸터 (fill 탭은 자체 스크롤)
│   │   ├── history-columns.ts     # 히스토리 폭 → 열 수 계산
│   │   ├── use-generate-shortcut.ts  # Ctrl/Cmd+Enter → Generate (에디터 입력 중에도, 다이얼로그 열림/비활성 시 무시)
│   │   └── use-editor-persist.ts  # 레이아웃/탭 localStorage 저장 (87studio-editor-layout:*, 87studio-editor-tab:*)
│   ├── quick-generate/        # 빠른 생성 컴포넌트 (프롬프트/캐릭터 탭, ImageViewer, HistoryStrip, 메타데이터 임포트)
│   ├── common/                # 공통 컴포넌트
│   │   ├── confirm-dialog.tsx     # 확인 다이얼로그
│   │   ├── master-detail.tsx      # 목록/상세 프레임 (리사이즈·접기, 폭 localStorage 87studio-master-detail:<id>, 모바일 목록→상세 + 뒤로가기)
│   │   ├── selection-bar.tsx      # 선택 모드 헤더 (✕·전체 선택·"n selected"·액션 슬롯) — 헤더 액션 영역에 렌더
│   │   ├── download-dialog.tsx    # 다운로드 다이얼로그
│   │   ├── expanded-textarea-dialog.tsx  # 전체 화면 텍스트 편집
│   │   └── image-detail-overlay.tsx     # 이미지 상세 오버레이
│   ├── gallery/               # 갤러리 컴포넌트
│   │   └── gallery-toolbar.tsx    # 필터 칩 툴바 (칩·＋ Filter·정렬·카드 크기 슬라이더)
│   ├── layout/                # 레이아웃 (앱 셸)
│   │   ├── app-sidebar.tsx        # 글로벌 사이드바 (collapsible icon, Create/Library 그룹, 큐 배지)
│   │   ├── app-header.tsx         # 상단 헤더 (SidebarTrigger + 브레드크럼)
│   │   ├── breadcrumb-context.tsx # BreadcrumbProvider, usePageHeader({items,count}), useBreadcrumb(), <HeaderActions selecting?> (헤더 우측 포털)
│   │   ├── sidebar-route-sync.tsx # 에디터 라우트 진입 시 사이드바 자동 접힘, 모바일 시트 닫기
│   │   └── nav-items.ts           # 네비게이션 항목, getActiveNavItem, isEditorRoute, shouldAutoCollapse
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
│   │   ├── expanded-editor-dialog.tsx  # 전체 화면 편집 다이얼로그 (에디터가 본문 높이를 채움, 빈 영역 클릭 → 포커스, 헤더에 태그 갤러리 버튼)
│   │   └── theme.ts               # 커스텀 다크 테마
│   ├── tag-gallery/           # 태그 갤러리 컴포넌트
│   │   ├── tag-gallery-content.tsx  # 태그 갤러리 콘텐츠
│   │   ├── tag-gallery-dialog.tsx   # 태그 갤러리 다이얼로그 (container 지정 시 Radix 다이얼로그 내부에 렌더)
│   │   └── use-tag-gallery.tsx      # useTagGallery() 훅 + appendTag (모든 프롬프트 입력의 태그 버튼 공용)
│   ├── queue/                 # 큐 컴포넌트
│   │   └── queue-status-widget.tsx  # 큐 상태 위젯
│   └── workspace/             # 워크스페이스 컴포넌트
│       ├── workspace-title.tsx    # 헤더 타이틀 (썸네일, 이름 변경, 저장 상태)
│       ├── prompt-panel.tsx       # 프로젝트 프롬프트 편집 (general/negative)
│       ├── characters-panel.tsx   # Chars 탭: 로컬 draft + 디바운스 저장 + pending-saves 등록 (공용 CharactersEditor 사용)
│       ├── scene-rail.tsx         # SceneRail (중앙 좌측 씬 목록: 216px/56px, 검색+필터, 팩 그룹, 가상 스크롤) + useRailCompact/useCollapsedPacks. 선택 상태는 라우트가 소유
│       ├── scene-rail-prefs.ts    # 레일 너비 수동 토글(87studio-scene-rail:<id>, 기본 expanded), 접힌 그룹(87studio-scene-groups-collapsed:<id>)
│       ├── scene-search-filter.tsx # 검색 입력 + 입력 안 필터 버튼/칩/드롭다운 (레일·보드 공용)
│       ├── add-scene-popover.tsx  # ＋ 씬 추가 Popover (이름, 팩, 현재 씬 값 복사) — 레일/보드/빈 상태/모바일 시트 공용
│       ├── scene-add.ts           # defaultAddPackId, isDuplicateSceneName
│       ├── scene-selection.ts     # setChecked, visibleChecked, selectAllState (순수)
│       ├── scene-selection-header.tsx # 선택 헤더(✕·전체선택·n selected·장수/내보내기/⋯) + CompactSelectionHeader
│       ├── scene-filters.ts       # filterScenes/countByFilter (All·Reserved·No images), sortScenes
│       ├── scene-palette.tsx      # Ctrl/Cmd+K 씬 팔레트 (cmdk)
│       ├── scene-palette-shortcut.ts  # Ctrl/Cmd+K 단축키 (macOS는 Cmd만, 다이얼로그 열림 시 무시)
│       ├── scene-board-prefs.ts   # 보드 카드 크기 (87studio-scene-board-size:<id>)
│       ├── scene-card.tsx         # SceneCard, ReserveStepper, SceneMenuItems/SceneMenuButton (레일·보드 공용)
│       ├── project-pack-provider.tsx  # ProjectPackProvider(팩 컨텍스트 + 새 팩/팩 삭제 다이얼로그), PackMenuItems, MoveToPackSub, SceneMoveMenuItems, PackRenameInput (레일·보드·모바일 시트·선택 헤더 공용)
│       ├── reserve-summary.ts     # 예약 합계 (씬 수, 이미지 수)
│       ├── scene-view.tsx         # SceneView (선택 씬) + SceneBoard (보드 모드 / 씬 모드 선택 그리드, 팩 그룹) + SceneEmptyState
│       ├── scene-detail.tsx       # 씬 이미지 그리드 (정렬, 선택 모드, 일괄 작업)
│       ├── placeholder-editor.tsx # 플레이스홀더 값 에디터 (800ms 디바운스, 씬 전환 시 flush)
│       ├── placeholder-save-plan.ts  # 로컬 편집 → 저장 JSON 계산
│       ├── scene-pack-dialog.tsx  # 씬 템플릿 다이얼로그 셸 (3패널 Packs/Scenes/Editor + 고정 Apply 푸터, 모바일 스택). 상태·서버 호출·autosave flush 조정
│       ├── scene-templates/       # 씬 템플릿 다이얼로그 부품: packs-pane, scenes-pane(검색·체크박스·↑/↓), scene-editor(키별 CodeMirror, 800ms 자동저장, 전환/닫기 시 flush), row-menu(⋯ + 우클릭 공용 항목), text-prompt-dialog
│       ├── compare-dialog.tsx     # 이미지 비교 다이얼로그
│       ├── convert-to-template-dialog.tsx  # 프로젝트 씬 → 글로벌 씬 팩 변환
│       ├── parameter-popover.tsx  # 생성 파라미터 설정 (모델 선택 포함)
│       ├── reference-panel.tsx    # 참조 이미지 관리 (Vibe Transfer, Precise Control)
│       ├── generation-progress.tsx  # 진행률 표시
│       ├── import-dialog.tsx      # SD Studio JSON 임포트
│       └── tournament-dialog.tsx  # 이상형 월드컵 (토너먼트)
├── server/
│   ├── db/
│   │   ├── schema.ts          # Drizzle 스키마 정의 (32개 테이블)
│   │   ├── index.ts           # DB 연결 (better-sqlite3)
│   │   └── migrations/        # drizzle-kit 마이그레이션 파일 (0000~0021)
│   ├── services/
│   │   ├── prompt.ts          # 프롬프트 합성 로직
│   │   ├── nai.ts             # NAI API 클라이언트 (모델 선택 지원)
│   │   ├── generation.ts      # 생성 큐 관리 (큐 복구 포함)
│   │   ├── image.ts           # 이미지 저장, 썸네일 생성, 스토리지 관리
│   │   ├── download.ts        # 다운로드 ZIP 생성, 파일명 템플릿
│   │   ├── reference.ts       # 참조 이미지 처리 (Vibe 인코딩, Precise 리사이즈/레터박싱)
│   │   └── logger.ts          # 구조화된 JSON 로깅 (로테이션)
│   └── functions/             # Server Functions (21개)
│       ├── settings.ts        # API 키, 딜레이 설정
│       ├── projects.ts        # 프로젝트 CRUD
│       ├── characters.ts      # 캐릭터 관리 (생성/수정/삭제/복제/순서 이동)
│       ├── scene-packs.ts     # 글로벌 씬 팩 관리 (listScenePacks는 sceneCount 포함, duplicateScenePack)
│       ├── scenes.ts          # 글로벌 씬 관리 (duplicateScene, reorderScenes)
│       ├── project-scenes.ts  # 프로젝트별 씬 스냅샷
│       ├── project-scene-packs.ts  # 프로젝트 씬 팩 관리 (생성/이름 변경/순서 변경/씬 이동·순서, 모두 트랜잭션 + 프로젝트 소유 검증)
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
├── hooks/
│   └── use-mobile.ts          # 모바일(<768px) 감지 훅 (shadcn sidebar)
├── lib/
│   ├── placeholder.ts         # @{slot:name} 파싱/치환 유틸
│   ├── project-packs.ts       # 프로젝트 팩 순수 헬퍼 (이름 중복, " (2)" 접미사, 순서 교환)
│   ├── scene-templates.ts     # 씬 템플릿 다이얼로그 순수 로직 (복제 이름, 이동, 키 추천/이름 변경, 레이아웃 파싱)
│   ├── bundle.ts              # @{bundle:name} 참조 추출/치환 유틸
│   ├── wildcard.ts            # 와일드카드 번들 순수 로직 (참조·모드·고정 옵션 파싱, 이미지별 선택, 마커 치환, 미리보기; 테스트)
│   ├── use-bundles.ts         # 번들 데이터 React Query 훅
│   ├── utils.ts               # 일반 유틸리티 (cn 등)
│   ├── sd-studio-import.ts    # SD Studio JSON 파서
│   ├── nai-metadata.ts        # NAI 이미지 메타데이터 파서 (PNG tEXt, Stealth Alpha)
│   ├── character-positions.ts # 캐릭터 위치 스펙/해석 (순수, 테스트)
│   ├── nai-model-detect.ts    # NAI Source/Comment → 모델 ID 감지 (Full 추정 시 assumed 표시)
│   ├── nai-import.ts          # 메타데이터 → 프롬프트/파라미터 단일 매핑 (naiMetadataToParams, buildImport, mergeImportedParameters)
│   ├── prompt-tags.ts         # 프롬프트 태그 토큰 매칭 (promptTag 필터, 북마크 이미지)
│   ├── use-image-grid-size.ts # 갤러리 그리드 크기 훅 (sm/md/lg)
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
scripts/smoke/workspace.mjs    # 워크스페이스 브라우저 스모크 (playwright-core, 128 씬 목업, 쓰기 차단; 씬 템플릿 다이얼로그 1440/390 포함)
scripts/smoke/templates.mjs    # 씬 템플릿 다이얼로그 스모크 (NAI_MOCK 서버 전용, 실제 쓰기: 팩/씬/키 CRUD·복제·이동·자동저장·선택 적용, DB 읽기전용 교차검증)
scripts/smoke/scene-characters.mjs  # 씬별 등장 캐릭터 스모크 (NAI_MOCK 서버 전용, 실제 쓰기: 등장 기본값·씬 Default/On/Off/Replace·일괄 대화상자·생성 resolved_prompts/metadata 검증·390 스크린샷, DB 읽기전용 교차검증)
scripts/smoke/positions.mjs    # 캐릭터 위치 스모크 (NAI_MOCK 서버 전용, 실제 쓰기: 기본/씬 오버라이드/일괄/터치 드래그/생성 metadata 검증, DB 읽기전용 교차검증)
scripts/smoke/browse.mjs       # 브라우즈 페이지 스모크 (대시보드/갤러리/번들/태그/큐/설정/메타데이터, 갤러리 승률 필터·일괄 태그·북마크 추가, server fn 응답 목업, 1440·390, 쓰기 차단)
scripts/smoke/quick-parts.mjs  # Quick Generate 파츠 스모크 (NAI_MOCK 서버 전용, 새 seed 필요: 라이브러리 데이터는 DB에 직접 삽입, 연결·의상·글로벌 축·미리보기·Empty 배지·생성 resolved_prompts·image_axis_values/links·라이브러리 Images(N)·새로고침 유지·연결 끊김·일반 캐릭터)
scripts/smoke/parts.mjs        # 캐릭터 파츠 스모크 (중첩 부위·조각 부위·변수·코디 이미지 포함; NAI_MOCK 서버 전용, 새로 seed한 DB 필요: 라이브러리 CRUD·조건·미리보기·Chars 탭 연결·씬 Parts·일괄 축·생성 resolved_prompts·분리)
scripts/smoke/queue.mjs        # 생성 큐 스모크 (NAI_MOCK 서버 전용, 실제 쓰기: 배치 생성·진행 카드·일시정지·드래그 재정렬·취소·실패/재시도·결과 이미지 검증, DB 읽기전용 교차검증)
scripts/smoke/wildcard.mjs     # 와일드카드 번들 스모크 (NAI_MOCK 서버 전용, 실제 쓰기: 번들 에디터(스위치·모드·개수·배지·Add bundle)·워크스페이스 순차 4장·Quick :random/:seq/고정 옵션/번들 참조 줄·갤러리 promptTag, DB 읽기전용 교차검증)
scripts/demo/                  # 데모 데이터: seed.mjs(가짜 데이터 생성, `--out demo*` 지정 가능), start-demo.bat(빌드 결과를 ./demo 데이터로 :3001에 NAI_MOCK=1로 실행). `npm run demo`, `npm run demo:seed`
LICENSE                        # GPL-3.0
THIRD_PARTY_NOTICES.md         # NAIA2.0 (DNT-LAB, GPL-3.0) 출처·커밋 SHA·변환 내용
scripts/build-ko-tags.mjs      # 메인테이너용: NAIA2.0 KR_tags.parquet + overrides + 그룹 매핑 → naia-ko-v<N>.db (hyparquet, `--src`/`--danbooru`/`--out`). HF 데이터셋에 업로드 후 `data-manifest.json` 갱신(선택 데이터 절)
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
- **프로젝트 씬 팩 관리** (워크스페이스): 새 팩 만들기(레일 ⋯ / 씬 추가 팝오버의 "New pack…"), 팩 헤더 메뉴(⋯ 호버·우클릭, 터치는 항상 표시)에서 이름 변경(인라인)·위/아래 이동·템플릿으로 저장·삭제(씬/이미지 수 확인 + "디스크에서 이미지 파일도 삭제" 체크박스 기본 해제), 씬 메뉴 "Move to pack ▸"(선택 헤더 ⋯에도 일괄 이동) — 대상 팩 끝에 추가, 이름 충돌은 " (2)" 접미사 + 토스트에 변경 수 표시, 씬 위/아래 이동(정렬이 Default일 때만). 빈 팩도 그룹으로 표시("Add scene" 행). 마지막 씬을 삭제/이동해도 팩은 유지됨. 팩 순서가 레일/보드/팔레트/생성 순서를 결정
- 글로벌 씬 팩 원본이 변경되어도 기존 할당에 영향 없음
- 같은 글로벌 씬 팩을 다시 할당하면 **새로운 project_scene_pack + project_scenes**가 생성됨 (덮어쓰기가 아닌 추가)
- source_scene_id로 원본 추적 (글로벌 씬 삭제 시 SET NULL)
- 프로젝트 씬에 대표 썸네일 이미지 설정 가능 (thumbnailImageId)

### Character Scene Override (캐릭터별 씬 오버라이드)

- 같은 씬이라도 캐릭터마다 다른 플레이스홀더 값을 가질 수 있음
- project_scenes.placeholders → general_prompt용
- character_scene_overrides.placeholders → 해당 캐릭터의 char_prompt용
- character_scene_overrides.position → 해당 씬에서 캐릭터 위치 오버라이드 (아래 "캐릭터 위치")
- **씬별 등장 캐릭터** (마이그레이션 0022): `characters.appearance`(`'all'` 기본 = 모든 씬 / `'selected'` = 씬에서 켠 곳만) + `character_scene_overrides.presence`(NULL = 기본 따름 | `'on'` | `'off'` | `'replace'`), `replace_prompt`, `replace_negative`. 순수 로직 `src/lib/scene-characters.ts`(`effectivePresence`, `countAppearances`, `applyBulkPresence`, 테스트 있음)
  - **Off**(또는 기본이 Off) = 캐릭터를 이미지에서 완전히 뺌(캡션·위치 계산 모두 제외). 등장 캐릭터가 0명인 씬도 유효(general 프롬프트만)
  - **Replace** = 이 씬에서만 캐릭터 프롬프트/네거티브/파츠(연결 캐릭터·의상·`@{char}`) 대신 `replace_prompt`/`replace_negative`를 사용. 번들·`@{slot:…}`(그 캐릭터의 씬 오버라이드 값)는 일반 프롬프트처럼 치환, 위치 설정(기본+씬 오버라이드)은 그대로 적용, 라이브러리 링크는 기록 안 함
  - `synthesizePrompts`가 Off 캐릭터를 `characterPrompts`에서 제외하고 Replace는 위 규칙으로 합성 → 생성/큐/메타데이터/갤러리 링크는 변경 없이 그 결과를 따름
  - UI: Chars 탭 "Appears in"(All scenes / Only selected scenes + "N개 씬에 등장" 힌트), SceneView "Characters in this scene"(`scene-characters-section.tsx`: 캐릭터별 Default·On·Off·Replace, Default는 "Default · On/Off" 표시, Replace는 프롬프트 에디터 + 접이식 네거티브, 800ms 디바운스 저장 + pending-saves flush), Off 캐릭터는 플레이스홀더/위치 섹션에서 숨김·Replace는 Parts 숨김, 선택 헤더 ⋯ "Characters…"(`bulk-characters-dialog.tsx`: 변경 없음/기본/On/Off, 한 트랜잭션 `bulkSetCharacterPresence`). 씬 복제/씬 추가 "현재 씬 값 복사"/캐릭터 복제/프로젝트 복제는 새 컬럼도 복사

### 캐릭터 위치 (Character Positions)

- 스펙: `{ mode: 'ai'|'random'|'fixed', x?, y? }` (x/y 0–1 정규화, 좌상단 원점, 소수 3자리). 씬 오버라이드는 `inherit` 추가 (= 캐릭터 기본값 사용). 기본 = `ai` (기존 동작과 동일)
- 저장: `characters.position`(기본값, NULL=ai), `character_scene_overrides.position`(NULL=inherit). Quick Generate는 로컬 상태(`87studio-quick-generate`)의 `characters[].position`
- 순수 모듈 `src/lib/character-positions.ts` (`resolveCharacterPositions`, `applyOverride`, `positionCanvas` 등, 테스트 있음)
  - 전부 ai → `use_coords:false`, centers 모두 0.5/0.5 (기존 페이로드와 동일)
  - 그 외 → `use_coords:true`: fixed는 x/y 그대로, random은 [0.1,0.9] 균등 + 기존 점과 거리 ≥0.2 (최대 5회 재시도), ai는 중앙→좌→우→상→하→모서리 링에서 첫 빈 자리
- 합성: `synthesizePrompts`가 기본값+씬 오버라이드를 합쳐 `characterPrompts[].position`에 저장 (job의 resolved_prompts). 생성 루프(`generation.ts`)가 **이미지마다** 해석하여 `generateImage(..., positions)`에 전달 → `nai-characters.ts`가 `use_coords`(최상위 + `v4_prompt`), `char_captions[].centers`(positive/negative 동일), `characterPrompts[].center`를 채움. V3 모델은 건너뜀
- 실제 사용된 `{useCoords, centers}`는 이미지 metadata의 `characterPositions`에 저장되고 이미지 상세에 표시
- UI: Chars 탭 "Position"(AI/Random/Fixed + 피커), SceneView "Character positions" 섹션(Default/AI/Random/Fixed, 공용 피커, Snap to grid `87studio-position-snap`), 씬 선택 헤더 "Character positions..." 일괄 적용, 메타데이터 임포트(use_coords true → Fixed)

### 토너먼트 (이상형 월드컵)

- 같은 씬에서 생성된 이미지들을 1:1 비교하여 랭킹 매김
- 결과: left, right, both_win, both_lose
- 이미지별 tournament_wins / tournament_losses 집계
- tournament_matches 테이블에 대전 기록 저장

### 캐릭터 파츠 (Character Parts, `/characters`)

- 스펙: `docs/superpowers/specs/2026-10-30-character-parts-design.md`
- 글로벌 라이브러리: 캐릭터 · 의상 아이템 · 코디(아이템 묶음) · 축. 캐릭터/아이템 = 조각(fragment) 목록, 각 조각은 조건 `{축id: [허용 값id]}`(비면 항상). 아이템은 아이템 조건(모든 조각에 공통)도 가짐
- 축: 글로벌(View: Front·Side·Back, Framing: Full body·Upper body·Face 시드, 편집 가능) + 로컬(캐릭터/아이템 소유, 예: Zipper). **첫 값이 기본값**. 값 삭제로 허용 목록이 비면 그 조각은 "절대 포함 안 됨"(경고 칩), 축 삭제 시 조건 키 제거
- 프로젝트 캐릭터 슬롯: `library_character_id`(실시간 연결), 기본 의상 `outfit_item_ids`, 로컬 축 기본값 `axis_values`. **분리**(`detachCharacterSlot`) = 프로젝트 전용 복사본(`project_id` 설정, 글로벌 목록에 안 보임)으로 프로젝트 전체 재연결
- 씬: `project_scenes.axis_values`(글로벌 축), 캐릭터별 `character_scene_overrides.axis_values` / `outfit_item_ids`(null = 기본 의상). 글로벌 씬 템플릿 `scenes.axis_values`는 적용 시 스냅샷 복사
- **가림(occlusion)**: 부위(`library_areas`, Axes 탭 "Body areas", 시드 Top·Bottom·Outerwear·Shoes·Headwear·Accessory) + 아이템 `area_ids` / `cover_rules`(`{conditions, areaIds}`). 의상 순서 = 안→밖. 바깥(뒤쪽) 아이템의 통과한 규칙이 안쪽 아이템의 **모든** 부위를 가리면 숨김. 아이템 조건 미통과 아이템은 가리지 않음, 숨겨진 겉옷도 가림. 축 삭제 시 그 축을 쓰던 가림 규칙은 삭제. 씬 Parts에 "가려짐" 배지
- **이미지 기록**: 생성 이미지마다 `image_axis_values`(글로벌 축), `image_library_links`(연결 캐릭터 + 실제로 조각이 들어간 아이템). 이전 이미지는 기록 없음. 갤러리 `?axis=<axisId>:<valueId>,…`, `?libraryCharacter=`, `?outfitItem=` 필터(내보내기에도 적용). 라이브러리 상세 "Images (N)" + 썸네일 지정/초기화(자동 = 최신 연결 이미지)
- `@{char}` / `@{outfit}` 토큰은 워크스페이스 캐릭터 프롬프트 에디터에서만 자동완성·유효 처리 (`partsTokens` prop)
- **중첩 부위 + 조각 부위**: `library_areas.parent_id`(한 단계만, 시드 Neck·Chest·Arms ⊂ Top). 부모를 가리면 자식도 가려짐(반대는 아님). `fragments.area_ids`(의상 조각만, 비면 아이템 부위 상속) — 조각의 유효 부위가 모두 가려지면 그 조각만 숨김. 아이템은 맞는 조각이 모두 숨겨졌을 때만 "가려짐", 일부면 "일부 가려짐"(툴팁에 조각 — 가린 아이템). 부위 삭제 시 자식은 최상위로
- **의상 변수**: `outfit_items.variables` `[{name, default}]`, 조각 텍스트의 `@{var:name}`(캐릭터 조각에서는 제거). 의상 목록은 **엔트리** `[{id, vars?}]`(`characters.outfit_item_ids`, `character_scene_overrides.outfit_item_ids`, `outfit_presets.item_ids`; 예전 `number[]`도 읽음). 값 = 엔트리 값 → 아이템 기본값 → ''. 합성 안에서 번들/슬롯보다 먼저 치환. 이름 변경 시 조각 토큰과 저장된 엔트리 값 키도 함께 변경. 프롬프트 에디터: `@{var:…}` 하이라이트·자동완성·미지정 변수 경고(`var-ref.ts`, `varNames` prop)
- **코디 ↔ 이미지**: `image_library_links` kind `'preset'` — 생성 시 캐릭터의 유효 의상(가림 전)이 코디와 아이템 순서·변수 값(기본값 해석 후)까지 같으면 연결. `outfit_presets.thumbnail_image_id`, 갤러리 `?outfitPreset=`(내보내기 포함), 오버레이 `detailPreset`
- **비어 있음 표시**: 아이템이 의상에 있고 완전히 가려지지 않았는데 현재 축 값에서 조각이 하나도 안 나오면(아이템 조건 불통과 / 맞는 조각 없음 / 내용이 빈 조각만) "비어 있음". `composeParts`가 `emptyItemIds` 반환, `summarizeEmptyItems`가 "가려지지 않은 아이템이 전부 비면 의상 전체 비어 있음 한 줄"로 합침. `synthesizePrompts` 슬롯 결과에 `emptyItemIds`/`charEmpty`(연결 캐릭터 조각 없음) 추가(생성 동작 무변화). 씬 Parts: 칩에 회색 점선 "Empty" 배지(`EmptyBadge`, 툴팁에 씬 축 값) + 최종 프롬프트 위 안내 줄(`parts-empty-info`). 라이브러리 상세: 조합 확인 그리드(`combination-grid.tsx`, 조건이 참조하는 전역 축 1개 = 한 줄, 2개 이상 = 첫 축 행 × 둘째 축 열, 칸 클릭 = 미리보기 선택, 현재 칸 강조) + 빈 미리보기 문구에 선택 값 표시
- **Quick Generate 파츠**: 로컬 캐릭터(localStorage)가 `libraryCharacterId`(실시간 연결)·`outfit`(엔트리 `[{id, vars?}]`)·`axisValues`(로컬 축)를 가질 수 있고, 글로벌 축(View·Framing…)은 상태의 `globalAxisValues`(모든 캐릭터 공통, Chars 탭 상단 `AxisSegmented`, 파츠 캐릭터가 있을 때만 표시). 분리(detach) 없음. 삭제된 라이브러리 캐릭터/아이템은 "연결 끊김" 표시 + 합성에서 무시. 합성은 서버 `composeQuickPrompts`(`prompt.ts`, 워크스페이스와 같은 `composeSlotParts` 공유, 글로벌 라이브러리만) — 생성 시 `createQuickGenerationJob`, 미리보기 `previewQuickPrompts`. 이미지 기록(`image_axis_values`/`image_library_links` 캐릭터·아이템·글로벌 코디)은 워크스페이스와 같은 경로. UI는 `CharacterPartsView`(`character-parts-panel.tsx`, 저장 방식과 무관)를 워크스페이스(`CharacterPartsPanel`, DB 저장)와 공유하고 `quick-characters-tab.tsx`가 최종 프롬프트 미리보기 + Covered/Partly covered/Empty 배지를 붙임. 순수 로직 `src/lib/quick-parts.ts`
- 순수 로직 `src/lib/character-parts.ts`(테스트 있음), 서버 `src/server/functions/library.ts`, `src/server/services/parts.ts`, UI `src/components/library/`, `src/components/parts/`(AxisSegmented, OutfitItemsEditor), 워크스페이스 `character-parts-panel.tsx`, `scene-parts-section.tsx`(Parts 섹션 + 최종 프롬프트 미리보기), `scene-axes-dialog.tsx`(선택 모드 일괄 View/Framing)

### Prompt Bundle (프롬프트 번들)

- 재사용 가능한 프롬프트 스니펫 라이브러리
- `@{bundle:name}` 구문으로 프롬프트 내에서 참조
- 번들 태그로 분류/정리 가능
- 생성된 이미지와 연결 (image_bundles 테이블)
- 에디터에서 자동완성, 하이라이팅, 호버 툴팁 지원
- 대표 썸네일 이미지 설정 가능
- **와일드카드 번들** (스펙: `docs/superpowers/specs/2026-10-31-wildcard-bundles.md`): 에디터의 Wildcard 스위치로 `kind='wildcard'` — 비어 있지 않은 각 줄(`#` 주석 제외)이 옵션 하나(줄 전체가 하나, 쉼표 태그 가능), 줄이 `@{bundle:x}` 하나면 그 텍스트 번들 내용으로 한 단계 치환(옵션 안 와일드카드는 빈 문자열, `@{slot:}`은 유효). 기본 모드 `wildcard_mode` random|sequential(Segmented), 사용처 재정의 `@{bundle:x:random}` / `:seq`(`:sequential`), 고정 옵션 `@{bundle:x:<옵션 이름>}`(번호 선택 없음; 참조 줄의 이름 = 참조한 번들 이름; 못 찾으면 빈 문자열 + invalid-ref 경고). 우선순위: 정확한 번들 이름 > 모드 키워드 > 옵션 이름. "Add bundle" 버튼(Popover+Command)이 텍스트 번들을 `@{bundle:name}` 줄로 추가
  - 합성(`BundleResolver`)은 프롬프트에 `@{wc:N}` 마커를 남기고 옵션 목록을 `ResolvedPrompts.wildcards`에 저장(와일드카드 선택이 번들/슬롯 치환보다 먼저). **선택은 `generation.ts` 루프에서 이미지마다**(sequential = 루프 인덱스 `i` % 개수 → 재시작 복구 유지, 여러 sequential은 함께 진행). 이미지 metadata는 선택이 반영된 최종 `prompts` + `wildcards: [{bundle, mode(random|sequential|fixed), option, index}]`(promptTag 필터가 선택 결과에 일치), `image_bundles`는 와일드카드 번들만 연결. 미리보기/큐 프롬프트 보기는 `{a | b | c}` / `{seq: a | b | c}`
  - 에디터: 와일드카드 참조는 보라 점선 하이라이트, 알 수 없는 번들/옵션은 invalid-ref 경고, 호버에 타입·모드·옵션 목록, 자동완성 `wildcard · n options` 및 `bundle:name:` 뒤 `random`/`seq`/옵션 이름. 목록 행에 옵션 수 배지
  - 순수 로직 `src/lib/wildcard.ts`(테스트 있음), 스모크 `scripts/smoke/wildcard.mjs`

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
- 캐릭터 파츠 지원 (라이브러리 캐릭터 연결·기본 의상·글로벌 축 — "캐릭터 파츠" 절의 Quick Generate 파츠)
- 프로젝트 기반 플로우의 대안

### SD Studio 임포트

- SD Studio 프리셋 JSON 파일을 파싱하여 프로젝트/씬으로 변환

### 이미지 메타데이터 인스펙터 (/metadata)

- 가져오기 대화상자(프로젝트 생성 / Quick Generate 전송 / Quick Generate 드롭)는 `components/common/metadata-import-options.tsx` 공용: Prompts 그룹(긍정/부정/캐릭터) + "모든 생성 설정 동기화" 마스터 토글(기본 ON, 시드 제외) 아래 설정별 체크박스(모델·크기·스텝·CFG·리스케일·샘플러·스케줄·UC 프리셋·SMEA/DYN·VAR+·DECRISP·시드(기본 OFF)), 현재값 → 가져올 값 표시
- 모델은 PNG `Source` 텍스트(예: "NovelAI Diffusion V4.5 4BDE2A90")에서 버전 토큰으로 매핑, 해시 테이블(`KNOWN_SOURCE_HASHES`)에 없으면 Full 가정 + UI에 "Full assumed" 표시, 모델 정보가 전혀 없으면 현재 모델 유지 안내. 스텔스 알파도 `Source` 키 사용
- 매핑은 `naiMetadataToParams` 한 곳(V5는 VAR+/DECRISP 제외, SMEA/DYN은 V3 프로파일만, 앱이 편집할 수 없는 샘플러는 건너뜀), 프로젝트 생성은 선택된 키만 `projects.parameters`에 저장(나머지는 기본값)

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
- Spotlight 하이라이트 + 안내 툴팁으로 UI 요소 강조 (대상이 비활성 탭 안에 있으면 `fallbackTarget` = 해당 탭 트리거 강조)
- 이벤트/라우트/조건 기반 자동 진행, 수동 진행, 건너뛰기 지원
- localStorage에 진행 상태 저장

### 이미지 비교

- 같은 씬에서 생성된 이미지들을 나란히 비교 (`compare-dialog.tsx`)
- 4장씩 페이지네이션, 시드/즐겨찾기/별점/승률 정보 표시

### 씬 팩 변환 (프로젝트 씬 → 글로벌 템플릿)

- 프로젝트의 커스텀 씬을 글로벌 씬 팩으로 역변환 (`convert-to-template-dialog.tsx`)
- 선택한 씬들의 플레이스홀더를 글로벌 씬 팩 템플릿으로 저장

## 프롬프트 합성 규칙

0. (캐릭터 파츠) 연결된 캐릭터 또는 기본 의상이 있는 슬롯만: 유효 축 값 = 축 기본값 ← 슬롯 기본값 ← 씬 ← 캐릭터 오버라이드. 조건을 통과한 캐릭터 조각 → `@{char}`, 의상 조각 → `@{outfit}`. 토큰이 char_prompt에 있으면 그 자리, 없으면 `char, outfit, 자유 프롬프트` 순으로 앞에 붙임. 그 뒤 아래 규칙 적용 (파츠 없는 슬롯은 기존과 동일)
1. `@{bundle:name}` 번들 참조를 해당 번들의 content로 치환
2. project.general_prompt의 `@{slot:name}`를 project_scenes.placeholders 값으로 치환
3. 각 character.char_prompt의 `@{slot:name}`를 character_scene_overrides.placeholders 값으로 치환
4. 매칭되지 않는 플레이스홀더는 빈 문자열로 처리
5. 합성된 최종 프롬프트는 generation_jobs.resolved_prompts에 JSON으로 저장 (재현용)
6. **중첩 플레이스홀더 불가** (`@{slot:}` 구문 내 중첩 미지원)
7. 프롬프트 템플릿에서 **플레이스홀더 목록을 자동 추출**하여 씬 편집 UI에 입력 필드로 표시

## 이미지 생성 (비동기)

- NAI API를 직접 호출하여 이미지를 생성
- **모델 선택 가능**: V5 Curated/Full, V4.5 Curated/Full, V4 Curated/Full, V3 Anime, Furry V3 (기본: `nai-diffusion-4-5-full`)
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
- **프롬프트 태그 필터** (`promptTag` URL 파라미터): "＋ Filter → Prompt tag" (단부루 자동완성 다이얼로그). `foo_bar`/`foo bar`, 대소문자 무시, `1.2::tag::`·`{tag}`·`[tag]`·`\(` 이스케이프를 제거한 뒤 쉼표 토큰 단위로 일치. `src/lib/prompt-tags.ts`(순수 함수, 테스트 있음) + `image-query.ts`에서 SQL LIKE 사전 필터 후 SQLite 사용자 함수 `prompt_has_tag`로 정확 일치 (페이지네이션·이전/다음 키셋과 호환)
- 즐겨찾기 토글, 별점(1~5), 메모 기능
- **태그**: 사용자가 직접 수동으로 이미지에 태그 부여
- 각 이미지에 생성 시 사용된 전체 프롬프트, 파라미터, 시드값 등 메타데이터 보존
- 이미지는 로컬 파일시스템에 저장, 썸네일 자동 생성
- **갤러리 레이아웃**: 무한 스크롤 그리드 (헤더 "Gallery {n}", 액션 Select·Export, 툴바 = 필터 칩 + ＋ Filter + 정렬 + 카드 크기 슬라이더 `87studio-grid-gallery`)
- **이미지 상세**: 별도 라우트 (`/gallery/$imageId`)
- **최소 승률 필터**: `+ Filter` → Min win rate (50/60/70/80%), URL `?minWinRate=`, 매치가 1회 이상인 이미지만 (`listImages`, 헬퍼 `src/lib/win-rate.ts`)
- **일괄 태그**: 선택 헤더의 Tag 팝오버 (`bulk-tag-popover.tsx`, `getImageTagCounts`/`bulkUpdateImageTags`) — 전체가 가진 태그는 클릭 시 제거, 그 외는 추가, 새 태그 생성 가능
- **태그 북마크에 추가**: 이미지 상세(오버레이/라우트 헤더)와 선택 헤더의 북마크 팝오버 (`add-to-bookmark-popover.tsx`, `addBookmarkImagesFromGallery`, 이미 있는 이미지는 건너뜀)
- **일괄 다운로드**: 필터/선택 기반 ZIP 다운로드 (파일명 템플릿 지원)

## 프론트엔드 UI 세부사항

### 페이지 프레임 (브라우즈 페이지 공통)

- 페이지 제목/개수/액션은 **앱 헤더**(h-12)에 둔다: `usePageHeader({ items?, count? })`(개수는 muted, 마지막 크럼 뒤) + `<HeaderActions>`(헤더 우측 포털; 모바일에서는 아이콘 버튼으로 축소, 줄바꿈 없음). 페이지 내부 큰 제목/설명 문단 없음 (`PageHeader` 삭제)
- 콘텐츠는 전폭 + `p-4 md:p-6` (중앙 좁은 컬럼 없음)
- 선택 모드: `<HeaderActions selecting>` + `<SelectionBar>`가 헤더 액션 영역을 대체 (브레드크럼 숨김, 헤더 배경 primary 소프트) — 떠다니는 벌크 바 없음
- 레이아웃 라우트가 자식 라우트(`/gallery/$imageId`)를 품으면 자식 상세 중에는 부모 헤더 컴포넌트를 렌더하지 않는다 (헤더 상태 덮어쓰기 방지)

### 대시보드 (/)

- 헤더 "Projects {n}", 액션: 이름 검색(클라이언트) + ＋ New Project(`default`, 온보딩 앵커 `new-project-btn`)
- 실행 스트립(`data-running-strip`): 큐에 대기/진행 작업이 있을 때만 — 상태 점, 배치 라벨, 진행바(brand gradient), 완료/전체, `/queue` 링크
- 프로젝트 카드 그리드(auto-fill 220px): 3:2 커버(썸네일/최근 이미지, 없으면 아이콘), 이름, "{씬} scenes · {이미지} images · 상대 시간"(`listProjects`가 `sceneCount` 포함), ⋯ 메뉴(이름 변경/복제/삭제), 마지막 칸 점선 ＋ New 카드. 빈 상태: 환영 + New + 메타데이터 임포트 링크
- API 키 미설정이면 설정으로 가는 얇은 안내 줄

### 워크스페이스 (/workspace/$projectId)

- `EditorShell` 기반 (빠른 생성과 동일한 리사이즈·접기 3패널, 모바일 Edit/Result/History)
- 헤더: 프로젝트 썸네일 + 이름(클릭해 변경) + 저장 상태, 씬 템플릿 / Import(SD Studio → 프로젝트에 할당) / Export
- 좌측 탭 (빠른 생성과 동일): Prompt(general/negative) · Chars(캐릭터 프롬프트, 추가/삭제) · Refs(활성 참조 수 배지) · Params
- 고정 푸터: 진행률 + "N scenes · M images" + Generate M (Ctrl/Cmd+Enter)
- 중앙 씬 모드(기본): `[SceneRail | SceneView]`
  - SceneRail: 헤더(Scenes N, ▦ 보드, ＋ 씬 추가, ⋯ 정렬/선택 모드/씬 템플릿/새 팩/Default ×N, 너비 토글), 검색(`?q=`) 입력 안에 필터 버튼(All=아이콘만, 활성=라벨 칩 Reserved/No images, 클릭 → All·Reserved·No images 드롭다운 + 개수), 팩 그룹(접기 상태 저장), 행 = 썸네일·이름·예약 스테퍼·메뉴(호버 "…"/우클릭), ↑/↓ 선택 이동(replace)
  - ＋ 씬 추가: Popover(이름 · 팩 Select(기본=선택 씬의 팩) · "현재 씬 값 복사" 체크(플레이스홀더+캐릭터 오버라이드) · Cancel/Add). 같은 팩에 중복 이름이면 인라인 에러. 추가 후 새 씬 선택(`?scene=`, push)·레일 스크롤·접힌 팩 펼침·필터 해제. `addProjectScene`이 `packId`/`copyFromSceneId`/중복 검사(`DUPLICATE_SCENE_NAME`) 지원
  - 선택 모드: 선택 상태(`checkedIds`)는 워크스페이스 라우트가 소유해 레일·보드가 공유. 켜면 레일 헤더가 선택 헤더(✕ · 전체선택 체크박스 · "n selected" · 장수 설정 Popover · 내보내기 · ⋯ 템플릿/기본 장수로/삭제(확인))로 바뀌고(한 줄 유지, n=0이면 액션 비활성), 씬 모드 중앙은 SceneView 대신 **선택 그리드**(보드 카드 그리드 + 체크박스, 레일 검색·필터 반영, 카드 크기 슬라이더, 같은 선택 헤더)가 표시된다. 종료하면 선택한 씬의 SceneView로 복귀. compact 레일은 ✕+개수 배지만(액션은 중앙 헤더)
  - 너비: 216px / 56px(compact: 썸네일+장수 배지, 이름 툴팁). **수동 토글만**(자동 compact 없음), 선택은 프로젝트별 저장(`87studio-scene-rail:<id>`), 기본 expanded
  - SceneView (`?scene=<id>`): 이름 변경, 비교, 토너먼트, 템플릿 변환, 썸네일 초기화, 접이식 플레이스홀더, 이미지 그리드(`imageSort`). 선택 없음·잘못된 id·삭제된 씬 → 레일 순서 첫 씬 자동 선택(replace)
- 보드 모드 (`?view=board`): 레일 숨김, 팩별 카드 그리드 + 검색+필터(레일과 같은 컴포넌트)/카드 크기 슬라이더/선택/＋ 씬 추가/닫기. 카드 클릭 → 해당 씬으로 씬 모드 복귀. 선택 모드에서는 툴바가 선택 헤더로 대체되고 카드 클릭은 체크 토글
- 팩 0개: 빈 상태(씬 템플릿 / 씬 추가), 레일 숨김 (빈 팩만 있으면 레일 + 빈 상태)
- Ctrl/Cmd+K: 씬 팔레트 (이름·팩 검색, Enter로 선택; 프롬프트 에디터 안에서도 동작, 다른 다이얼로그가 열려 있으면 무시)
- 모바일: Result 패널 상단 "Scenes ▾ {현재 씬}" → 하단 Sheet에 전체 레일(선택 시 닫힘, 헤더에서 보드 진입)
- 우측: 프로젝트 히스토리 (클릭 → 이미지 상세 오버레이), 갤러리 링크
- 기존 `/workspace/$projectId/scenes/$sceneId`는 `?scene=`로 리다이렉트
- 이미지 비교 (같은 씬 이미지 나란히 비교)
- 씬 팩 변환 (프로젝트 씬 → 글로벌 템플릿)
- SD Studio JSON 임포트
- 이상형 월드컵 (토너먼트)

### 씬 템플릿 다이얼로그 (`scene-pack-dialog.tsx`)

- 워크스페이스 헤더 / 레일 ⋯ "Scene templates"로 열림. 데스크톱: `w-[min(1200px,94vw)] h-[88vh]`, 3패널 리사이즈 (Packs · Scenes · Editor, 폭은 localStorage `87studio-templates-layout`에 사용자 조절 후 저장). 모바일(<768): 전체 화면 스택 Packs → Scenes → Editor (헤더 뒤로가기, Scenes 단계에 Apply 푸터)
- **Packs**: ＋ 팝오버(이름·설명), 행 ⋯/우클릭: Rename, Edit description, Duplicate, Delete(확인; 이미 프로젝트에 적용된 스냅샷은 영향 없음). 열면 첫 팩 자동 선택, 체크박스는 기본 전체 선택
- **Scenes**: 검색, ＋ 팝오버(이름 + 선택 씬 값 복사), 행 = 적용 체크박스 + 이름 + 키 개수, ↑/↓ 선택 이동, ⋯/우클릭: Rename, Duplicate, Move up/down(`reorderScenes`), Delete. 편집 중인 씬 선택과 적용 체크박스는 별개
- **Editor**: 씬 이름 클릭 → 인라인 이름 변경, 키마다 지연 로딩 CodeMirror(최소 2줄, ~12줄까지 자동 확장 후 스크롤; 단부루/번들/가중치), 키 이름 클릭 → 이름 변경(순서 유지), 키 삭제, ＋ Add key 팝오버(같은 팩 다른 씬의 키 + 프로젝트 `@{slot:…}` 이름 추천). 값은 800ms 디바운스 자동 저장, 씬 전환·다이얼로그 닫기·Apply·복제 전에 flush (편집 값은 부모 상태에도 즉시 반영)
- **Apply**: "Apply N scenes to project" (0개면 비활성, 기본 `variant="default"`). `assignScenePack({ projectId, scenePackId, sceneIds? })` — `sceneIds`를 생략하면 팩 전체(기존 동작), 있으면 해당 씬만 스냅샷
- Generate(Ctrl/Cmd+Enter)/씬 팔레트(Ctrl/Cmd+K) 단축키는 `[data-slot="dialog-content"]` 가드로 다이얼로그가 열려 있으면 무시

### 메타데이터 인스펙터 (/metadata)

- 빈 상태: 전체 영역 드롭존. 로드 후: 좌 이미지 미리보기(파일명/크기/교체) + 우 탭(Prompt/Characters/Parameters/References/Raw), 모바일은 세로 스택(이미지 최대 40vh), 페이지 어디에 드롭해도 이미지 교체

- 이미지 드래그 앤 드롭 업로드
- NAI 메타데이터 추출 (PNG tEXt, Stealth Alpha)
- 프롬프트, 파라미터, V4 캐릭터 캡션 표시
- 메타데이터에서 프로젝트 직접 생성

### 설정 페이지 (/settings)

- 데스크톱(≥1024): 좌측 sticky 섹션 내비(General/Generation/Appearance/Storage/Help, 스크롤 스파이) + 우측 카드(max 720px). 그 미만: 상단 sticky 칩 행
- API 키는 마스킹 + 표시 토글 + 상태 배지(미설정/설정됨/유효), 스토리지 정리는 확인 다이얼로그

- NAI API 키 입력/저장
- 이미지 생성 간 딜레이 설정 (기본 500ms, 범위 0~30초)
- 언어 선택 (English / 한국어)
- 스토리지 관리 (통계 조회, 고아 파일 정리)

### 프롬프트 번들 (/bundles)

- 프롬프트 스니펫 라이브러리 관리
- 번들 CRUD, 태그 분류
- 번들 갤러리 이미지 연결
- `MasterDetail`: 좌측 리사이즈 목록(검색 + ＋ New, 썸네일·이름·태그 칩 행), 우측 상세(`PromptEditorHeader` + 프롬프트 에디터). 모바일은 목록 → 상세(뒤로가기)

### 빠른 생성 (/generate)

- 프로젝트/씬 설정 없이 직접 이미지 생성
- 참조 이미지 지원
- Ctrl/Cmd+Enter로 생성

### 큐 (/queue)

- 전폭. 헤더 "Queue {활성 배치 수}", 액션: Pause/Resume
- "Now generating" 카드(`data-now-generating`): 실행 중 배치의 최신 씬 이미지 미리보기, 프로젝트 · 씬, 진행바(brand gradient), 완료/전체, 배치 취소
- 대기 배치 목록(드래그 재정렬, 확장 시 작업 재정렬·프롬프트 보기, 취소), 완료/실패/취소 히스토리는 기본 접힘(개수 표시, 실패 재시도 유지)

### 태그 갤러리 (/tags)

- Danbooru 태그 검색 및 상세 정보 조회
- 태그 북마크 컬렉션 관리 (검색 옆 ＋ New → 태그 이름 입력으로 북마크 생성)
- 북마크별 참고 이미지 갤러리
- 북마크 상세 "이 태그를 쓴 이미지": 결과 프롬프트(general + 캐릭터, 네거티브 제외)에 태그가 쉼표 구분 토큰으로 포함된 갤러리 이미지의 개수 + 최신 24장 썸네일 (클릭 → 이미지 오버레이, `detailTag`로 이전/다음이 해당 목록을 순회), "갤러리에서 보기" → `/gallery?promptTag=<tag>` (다이얼로그 내장 모드에서는 숨김)
- 번들과 같은 `MasterDetail` (페이지 `87studio-master-detail:tags`, 프롬프트 에디터 다이얼로그 `tag-dialog`)

### 캐릭터 편집 (Quick Generate Chars 탭 / 워크스페이스 Chars 탭 공용 `CharactersEditor`)

- 헤더 "Characters n", 칩 탭(캐릭터당 1개, 선택=primary 소프트) + "＋ Add" 칩 + 선택 캐릭터 ⋯ 메뉴(Rename·Duplicate·Move left/right·Delete 확인). Add는 이름 입력 없이 "Character N"을 즉시 만들고 선택 + 이름 필드 포커스
- 본문: Name 입력, Prompt(태그 갤러리 + 확장) 에디터(최소 ~8줄), Negative는 접이식(비어 있으면 기본 접힘 + "(empty)")
- 0개: 안내 문구 + Add 버튼
- 워크스페이스: `characters-panel.tsx`가 debounced 저장·pending-saves flush·삭제/방금 추가 안전 처리를 유지하고, 순서 이동은 `moveCharacter`(UNIQUE(project_id, slot_index)를 임시 인덱스로 우회, 한 트랜잭션), 복제는 `duplicateCharacter`(프롬프트/네거티브 + character_scene_overrides 복사). Quick Generate는 로컬 배열(`src/lib/characters.ts`의 moveItem/nextCharacterName/duplicateName)

### 프롬프트 에디터 (CodeMirror 6)

- 단부루(Danbooru) 태그 자동완성 (`/danbooru-tags.json`)
- `@{slot:name}` 구문 하이라이팅 (시각적으로 구분)
- `@{bundle:name}` 번들 참조 하이라이팅, 자동완성, 호버 툴팁
- 존재하지 않는 참조 경고 하이라이팅
- 가중치 구문 하이라이팅
- 우클릭 컨텍스트 메뉴 (태그 정보, 복사, 삭제, Danbooru 페이지)
- 전체 화면 확장 편집 (에디터가 다이얼로그 본문 높이를 채움, 헤더에 태그 갤러리 버튼)
- 모든 프롬프트 입력(Quick Generate prompt/negative/캐릭터, 워크스페이스 prompt/negative/캐릭터, 플레이스홀더)에 태그 갤러리 버튼 (`useTagGallery`)
- general_prompt, negative_prompt, char_prompt, char_negative 모두에 적용

### 태그 어시스트 (자동완성 · 커서 태그 카드 · Tag Search 창)

- 데이터: `data/danbooru.db`(읽기 전용, `STUDIO_DATA_DIR` 반영). 서버 접근은 `src/server/services/tag-index.ts`(`getDanbooruDb`, `suggestTagsFor`, `searchTagsFor`, `getTagInfoFor`), server fn은 `src/server/functions/tag-assist.ts`(`suggestTags`, `getTagInfo`, `searchTagsWindow`, `hasTagDb`, `setTagDescription`)
- **세부 카테고리**: `src/lib/tag-categories.ts` 상단에 카테고리 목록과 매핑 규칙 문서화. `tag_groups` 그룹(점수) + 이름 규칙으로 일반 태그를 분류, 나머지는 `misc`. 모든 태그 결과에 `top`/`fine` 포함. **일반 태그의 top = NAIA 12그룹**(fashion·body·pose·emotion·place·object·people·situation·concept·presentation·sexual·misc, ko 라벨은 NAIA 그룹명): 한국어 태그 데이터에 있으면 그 그룹 + fine = `ko:<소분류>`(`koFineKey`; ko 로캘에서만 소분류 라벨, 그 외는 그룹 라벨 — `fineLabel`), 없으면 규칙 분류 결과의 부모 그룹(subject→people, expression→emotion, … 매핑은 tag-categories.ts 헤더). Danbooru 비일반(character·artist·copyright·meta)은 그대로. Tag Search 하위 칩: 한국어 데이터가 있으면 ko 로캘에서 NAIA 소분류(상위 14개, `getKoTagCategories`), en은 그룹 탭만, 데이터가 없으면 규칙 하위 카테고리
- **설명**: 스튜디오 DB `tag_descriptions(tag, locale, text, source, updated_at)` (마이그레이션 0018) → 없으면 위키 본문 요약(`src/lib/dtext.ts` `wikiSummary`, DText 제거). 현재는 `setTagDescription`만 쓰기 가능(향후 번역/임포트용). 순서 = 수동 `tag_descriptions` → (UI 로캘이 `ko`일 때만) NAIA 한국어 설명 → 위키 요약. **UI에는 출처 라벨·표기를 두지 않음**(출처는 THIRD_PARTY_NOTICES.md·README·LICENSE에만)
- **자동완성**: 순위 exact > alias exact > prefix > alias/other_names prefix > substring(≥3자), 가중치 문법 제거, 20개. 행 = 색 태그 + 세부 카테고리 라벨 + 게시물 수 + 별칭 힌트(`← alias`, 선택 시 정식 태그 삽입) + "in prompt" 표시, 옆에 정보 패널(`info`). 순수 로직 `src/lib/tag-query.ts`
- **한국어 태그 데이터 (NAIA2.0)**: `naia-ko-v<KO_TAGS_VERSION>.db`(SQLite: `meta`, `ko_tags(tag, small_category, group_key, description, keywords, count)`, `ko_keywords(keyword, tag, kind)` — kind 1 = `<무늬>` 같은 그룹 토큰), 빌드는 `scripts/build-ko-tags.mjs`(NAIA 매핑에 없는 대분류는 스크립트의 `SUPPLEMENT_*`로 배치). 서버 `src/server/services/ko-tags.ts`: 열기/닫기/조회만(**자동 다운로드 없음**, 설치는 설정 › 데이터 = 「선택 데이터 (Settings › Data)」 절), 파일은 `data-registry.ts`의 `koFilePath()`(데이터 디렉토리의 최신 `naia-ko-v<N>.db`)로 찾으므로 직접 넣어 둔 파일도 그대로 사용. 한글이 포함된 질의는 자동완성(`suggestTagsFor`)·Tag Search(`searchTagsFor`)에서 키워드 일치(exact > prefix > substring(≥2자), 일반 키워드 > 그룹 토큰, 게시물 수; 띄어쓰기 변형 지원)로 영어 태그를 찾고 행에 `← 줄무늬` 힌트(자동완성 `kind` `ko_*`, Tag Search `via`), 삽입은 영어 태그. 순수 로직 `src/lib/ko-tags.ts`. 설정 › 태그 검색의 `KoTagsCard`는 설정 › 데이터로 가는 안내 한 줄
- **커서 태그 카드** (`prompt-editor/tag-caret-info.ts`): 클릭/방향키로 태그에 멈추면 300ms 후 표시(타이핑·자동완성·Esc·blur 시 숨김, 모르는 태그는 없음). 칩(별칭/함의/피함의/같은 그룹) 클릭 → 현재 토큰 뒤에 `, tag` 삽입. 에디터 헤더 토글, localStorage `87studio-tag-info`
- **Tag Search 창** (`components/tag-search/`): 비모달 플로팅 창, Ctrl/Cmd+Shift+F(전역) 또는 에디터 헤더 🔍. 제목줄 드래그/우하단 리사이즈/뷰포트 클램프/더블클릭 리셋, localStorage `87studio-tag-search-window`(순수 로직 `src/lib/floating-window.ts`). "프롬프트에 추가"는 마지막으로 포커스한 에디터(`editor-registry.ts`)에 삽입. 모바일(<768)은 하단 시트. 모달 다이얼로그(확장 에디터) 안에서는 다이얼로그 콘텐츠에 포털
- 스모크: `scripts/smoke/tag-assist.mjs` (NAI_MOCK 서버 + `danbooru.db`를 데이터 디렉토리에 복사한 throwaway 데이터). 영어/모바일 구간은 한국어 데이터 없이(규칙 폴백), 한국어 구간은 시작 시 빌드된 `naia-ko-v1.db`(`KO_DB`, 기본 `<SMOKE_OUT>/../naia-ko-upload/`)를 데이터 디렉토리에 복사해 검증(`SMOKE_ONLY=ko`로 이 구간만 실행; 원격 Danbooru 구간은 네트워크 필요)

### 반응형 디자인

- **데스크톱**: 풀 레이아웃, 사이드바 네비게이션 (`/workspace`, `/generate` 진입 시 자동 접힘)
- **태블릿**: 아이콘 모드로 축소된 사이드바, 적응형 그리드
- **모바일**: 헤더의 `SidebarTrigger`로 여는 offcanvas 사이드바 시트 (하단 네비게이션 없음, 이동 시 자동 닫힘), 단일 컬럼 레이아웃, 터치 최적화

## NAI API 세부사항

### 엔드포인트

- 이미지 생성: `https://image.novelai.net/ai/generate-image`
- 이미지 생성 (스트림): `https://image.novelai.net/ai/generate-image-stream`

### 지원 모델

| 모델 ID                         | 이름                             |
| ------------------------------- | -------------------------------- |
| nai-diffusion-5-full            | NAI Diffusion V5 Full            |
| nai-diffusion-5-curated         | NAI Diffusion V5 Curated         |
| nai-diffusion-4-5-curated       | NAI Diffusion V4.5 Curated       |
| nai-diffusion-4-5-full          | NAI Diffusion V4.5 Full (기본값) |
| nai-diffusion-4-curated-preview | NAI Diffusion V4 Curated         |
| nai-diffusion-4-full            | NAI Diffusion V4 Full            |
| nai-diffusion-3                 | NAI Diffusion V3 (Anime)         |
| nai-diffusion-furry-3           | NAI Diffusion Furry V3           |

- 모델 메타데이터·기능 판별은 `src/lib/nai-models.ts` (`NAI_MODELS`, `supportsVibe/supportsPrecise/usesMultipartRequest/defaultSkipCfgAboveSigma`)
- **생성 옵션** (`parameters` JSON, 파라미터 패널 `ParameterForm`, 순수 로직은 `nai-models.ts`):
  - SMEA `smea` / DYN `smeaDyn` → `sm` / `sm_dyn` (V3 프로파일만 표시·전송, `sm = smea || smeaDyn`, ddim 샘플러면 둘 다 false + UI 비활성)
  - VAR+ `varietyPlus` → `skip_cfg_above_sigma` (미설정 기본: v4/v4.5 on, v3 off. on: v4.5=58, v4/v3=19. off: v4/v4.5=null, v3=0. V5 생략, Precise 사용 시 null)
  - DECRISP `decrisp` → `dynamic_thresholding` (V5는 항상 false, 토글 숨김)
  - Seed Fix: `seed != null`
  - Rnd Res `randomResolution` → 이미지마다 832×1216 / 1216×832 / 1024×1024 중 무작위(`pickRandomResolution`, `generation.ts` 루프), 실제 width/height가 이미지 metadata.parameters에 저장됨
- **V5**: 요청이 JSON 본문이 아니라 `multipart/form-data`의 `request` 파트(JSON Blob, filename `blob`)로 전송됨 (Content-Type 헤더 수동 지정 금지, `buildNaiRequestInit` in `nai-request.ts`). `skip_cfg_above_sigma` 키 생략 (V4.5=58, V4=19, V3=0). 응답은 동일한 ZIP. **Vibe Transfer / Precise Reference 미지원** (Precise는 V4.5 전용, V5에서 vibe 선택 시 job 실패)

### 인증

- `Authorization: Bearer ${token}` 헤더
- **API 키는 UI 설정 화면에서 사용자가 입력**, 서버 DB에 저장

### 응답

- **ZIP 형식**으로 이미지 데이터 반환 (fflate로 압축 해제)
- ZIP 압축 해제 후 이미지 파일 추출하여 `data/images/{projectId}/`에 저장

## DB 스키마 (Drizzle ORM) — 32개 테이블 (캐릭터 파츠 6개는 "캐릭터 파츠" 절 참고)

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
| position      | text                             | JSON PositionSpec (NULL = ai)  |
| appearance    | text (NOT NULL, DEFAULT 'all')   | 'all' \| 'selected' (씬별 등장 기본값) |
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
| name          | text (NOT NULL)                      | 프로젝트 내 고유 (UI/서버 검증) |
| sort_order    | integer (NOT NULL, DEFAULT 0)        | 팩 순서 (마이그레이션 0014, id 순으로 백필) |
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
| position                               | text                                   | JSON. 씬 위치 오버라이드 (NULL = inherit) |
| presence                               | text                                   | NULL(기본 따름) \| 'on' \| 'off' \| 'replace' |
| replace_prompt / replace_negative      | text                                   | presence = 'replace'일 때 대신 쓰는 프롬프트/네거티브 |
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
| kind               | text (NOT NULL, DEFAULT 'text') | 'text' 또는 'wildcard' (목록, 마이그레이션 0021) |
| wildcard_mode      | text (NOT NULL, DEFAULT 'random') | 와일드카드 기본 모드 'random' / 'sequential' |
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

- 프로젝트 삭제 시 **생성된 이미지 파일은 기본 보존** (DB 레코드만 CASCADE 삭제, 파일 유지). 확인 다이얼로그의 체크박스 "이미지 파일도 디스크에서 삭제 (N장)"로 선택. `deleteProject({ id, deleteFiles })`, 기본 `false`
- **프로젝트 씬 팩 제거**: `removeProjectScenePack({ id, deleteFiles })`, 기본 `false` (현재 UI 호출부 없음)
- **씬 삭제 / 프로젝트 삭제 / 씬 팩 제거는 모두 같은 정책** (공용 `DeleteFilesOption` 체크박스, 기본 해제). 씬 삭제 (레일/보드 메뉴의 단일 삭제, 선택 모드의 일괄 삭제): 확인 다이얼로그의 체크박스 "이미지 파일도 디스크에서 삭제 (N장)"로 선택
  - 기본값은 **해제 = 파일 보존**. 서버 함수 `deleteProjectScene({ id, deleteFiles })` / `bulkDeleteProjectScenes({ ids, deleteFiles })`의 `deleteFiles` 기본값은 `false`
  - 보존된 파일은 DB에 없는 고아 파일이 되며 설정 › 스토리지의 고아 파일 정리로 나중에 삭제 가능 (다이얼로그 힌트에 안내)
  - 단일 이미지 삭제(갤러리/상세)는 기존대로 파일도 삭제

## NAI Mock 모드 (유료 API 없이 큐 테스트)

- 환경변수 `NAI_MOCK=1`을 **서버 시작 시** 지정한 경우에만 활성. **`STUDIO_DATA_DIR` 없이는 시작을 거부**(가짜 이미지/Vibe가 실제 `./data`에 쌓이지 않도록, 에러 출력 후 exit 1) (미설정이면 동작 변화 없음). 시작 시 경고 로그/콘솔 출력, 사이드바에 `MOCK` 배지(`data-testid="mock-badge"`, `getAppInfo` server fn의 `naiMock`)
- `src/server/services/nai-mock.ts`: novelai.net으로 **어떤 네트워크 요청도 보내지 않음** (이미지 생성 + Vibe 인코딩 모두). `NAI_MOCK_DELAY_MS`(기본 1500) 후 sharp로 만든 그라디언트 + "MOCK seed {seed}" PNG를 ZIP에 담아 실제 응답과 같은 형태로 반환
- API 키 없이도 동작 (생성 시 키 검사 생략, `getSetting('nai_api_key')`는 mock일 때 `'mock'` 반환, 키 검증은 항상 valid)
- 실패 주입: 프롬프트(일반/네거티브/캐릭터)에 `__mock_fail__` → 매번 실패(`NAI API error 500 ... Mock failure`), `__mock_fail_once__` → 같은 프롬프트의 첫 호출만 실패(재시도 테스트용)
- 큐 UI 보강: 큐가 에러로 멈추면 큐 페이지 상단에 에러 배너(`data-queue-error`: 오류 메시지 + Retry/Skip). 마지막 남은 작업이 실패해도 진행 위젯/사이드바 위젯이 에러 상태로 계속 표시됨
- 실행: `scripts/demo/start-demo.bat`은 `NAI_MOCK=1`, `NAI_MOCK_DELAY_MS=1500`, `STUDIO_DATA_DIR=demo/data`로 :3001 실행. 개발 서버 테스트(실제 `./data`와 분리):
  ```bash
  runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock        # /demo-mock/ 은 .gitignore
  NAI_MOCK=1 NAI_MOCK_DELAY_MS=1500 STUDIO_DATA_DIR=$PWD/demo-mock/data     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort
  PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/queue.mjs http://127.0.0.1:3100 demo-mock/data/studio.db
  ```
- `scripts/smoke/queue.mjs`는 MOCK 배지가 없거나 큐가 idle이 아니면 **실행을 거부**(exit 2). 큐 상태(일시정지/에러)는 서버 메모리에 남으므로 중단된 실행 뒤에는 서버를 재시작하고 다시 seed

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

### 선택 데이터 (Settings › Data)

- **아무것도 자동으로 받지 않는다.** `start.ps1`/`start.sh`는 Node·의존성·마이그레이션·빌드·실행만 한다(Danbooru DB 단계 없음). 데이터가 없어도 프롬프트 작성·생성·갤러리는 모두 동작. 이미 `data/danbooru.db`(+`.version`)나 `naia-ko-v*.db`가 있는 기존 사용자는 설치됨으로 표시됨
- 데이터셋 3개: `danbooru`(`danbooru.db` ~277MB, 필수), `ko`(한국어 태그 데이터, `requires danbooru`), `semantic`(자연어 검색 인덱스 `tag-index-*.bin/.json` + EmbeddingGemma 모델, `requires danbooru`; 모델은 해시 없이 `src/lib/semantic.ts`의 모델 id/dtype으로 식별)
- **매니페스트** `data-manifest.json` (HF 베이스 URL 옆): `{ schema: 1, files: { "<key>": { version, files: [{ name, size, sha256 }], requires?: [...] } } }`. 앱 내장 사본 `BUILTIN_MANIFEST`(`src/lib/data-manifest.ts`)가 폴백(원격 키가 없으면 내장 항목 유지). 서버 시작당 1회 + 「업데이트 확인」 버튼으로 원격 확인, 실패하면 조용히 내장 사용. 업데이트는 사용자가 누를 때만 적용, 있으면 설정 사이드바 항목에 점
- **환경변수** `DATA_BASE_URL`(끝 `/`)로 다운로드 베이스 덮어쓰기(테스트용 로컬 서버). **NAI_MOCK에서는 `DATA_BASE_URL`이 없으면 네트워크 접근 안 함**(매니페스트 포함). 자연어 인덱스는 `SEMANTIC_INDEX_URL`이 있으면 그쪽
- 서버: `services/data-registry.ts`(경로·설치 버전·매니페스트 상태; danbooru 버전 = `data/danbooru.db.version`, 나머지 = `data/data-versions.json`/파일명), `services/data-files.ts`(스트리밍 다운로드 → `<file>.tmp` → size+sha256 검증 → 핸들 닫고(`closeDanbooruDb`/`closeKoDb`, 캐시 초기화, WAL/SHM 제거) 원자적 rename → 재오픈. 검증 실패/취소면 기존 파일 유지 + 오류 상태, 데이터셋당 동시 1개, 상태는 서버 메모리라 새로고침 후에도 유지), server fn `functions/data.ts`(`getDataFilesStatus`, `checkDataUpdates`, `installDataset`, `cancelDatasetInstall`, `deleteDatasetFiles`). `semantic`은 기존 `services/semantic.ts`(`enable`/`reinstallIndex`/`deleteFiles`)에 위임
- UI: 설정 › 데이터(`components/data/data-settings-card.tsx`; 행 = 이름·용도·크기·설치 버전·상태(설치 안 됨/받는 중 n%/설치됨(최신)/업데이트 있음/오류)·받기/업데이트/다시 받기/삭제). Danbooru DB가 없으면 한국어·자연어 행은 「Danbooru 태그 DB가 먼저 필요해요」+ 비활성. Danbooru 삭제는 확인 다이얼로그(자동완성·한국어·자연어 중단 경고). 안내(전부 닫을 수 있고 막지 않음): 대시보드 한 줄(`data-hint-line.tsx`, localStorage `87studio-data-hint-dismissed`), Tag Search 창·/tags 검색의 `NeedsTagData` 패널, 에디터 헤더 태그 정보 토글(DB 없으면 토스트 + 열기), ko 로캘 Tag Search의 한국어 데이터 한 줄. 훅 `use-data-files.ts`(`useDataStatus` 폴링, 설치 상태가 바뀌면 `tag-db-installed`/`tag-search` 등 의존 쿼리 무효화)
- 순수 로직 `src/lib/data-manifest.ts`(`parseManifest`, `mergeManifest`, `compareVersions`, `deriveState`, `missingRequirements`, `formatBytes`; 테스트 있음)
- **새 데이터 버전 배포**: HF 데이터셋에 파일 업로드(새 버전은 같은 이름 덮어쓰기 가능, 한국어는 `naia-ko-v<N>.db` 새 이름 권장) → `node scripts/build-data-manifest.mjs --dir <파일 폴더> --prev data-manifest.json --version <key>=<새 버전> --out data-manifest.json`(sha256·크기 자동 계산) → `hf upload snuff8729/87-studio data-manifest.json data-manifest.json --repo-type dataset`. 앱 코드는 파일 이름이 바뀌는 경우에만 건드리면 되고(`BUILTIN_MANIFEST`는 오프라인 폴백이라 가끔 갱신), 기존 사용자는 설정 › 데이터에서 「업데이트 있음」을 보고 직접 업데이트
- 스모크: `scripts/smoke/data.mjs`(NAI_MOCK 서버 + `DATA_BASE_URL` 로컬 픽스처 서버, danbooru.db 없는 throwaway 데이터: 안내·설치·진행률·업데이트·재다운로드·체크섬 실패·삭제)

## 배포 / 실행

- **간편 실행**: `start.sh` (Linux/macOS) / `start.bat` (Windows)
  - Node.js v22.12.0 자동 다운로드 (`./runtime/node/`), 의존성 설치, DB 마이그레이션, 빌드, 서버 실행 (브라우저는 자동으로 열지 않음, http://localhost:3000)
  - Node.js가 설치되지 않은 환경에서도 사용 가능
  - 태그 데이터는 시작 시 받지 않음 — 설정 › 데이터에서 직접 받는다
- **업데이트**: `update.bat` / `update.sh` — 최신 버전 태그로 체크아웃(detached) 후 의존성·마이그레이션·빌드. git clone으로 받은 폴더에서만 동작(ZIP은 안내 후 중단). 시작 시 포트 3000이 열려 있으면(서버 실행 중) 중단, 브랜치 위에 있으면 태그로 전환된다는 경고 + y/N 확인(기본 No), `src/routeTree.gen.ts`·`package-lock.json`만 수정된 경우 자동 복원하고 그 외 추적 파일 수정이 있으면 목록 표시 후 중단(stash/reset 없음). `UPDATE_DRY_RUN=1`이면 체크아웃 직후 종료(테스트용)

## 개발 명령어

```bash
pnpm install                    # 의존성 설치 (npm install도 가능: package-lock.json과 pnpm-lock.yaml은 같은 버전을 고정 — 갱신은 설치된 트리 기준으로 npm lock 생성 후 `pnpm import`)
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
├── components/
│   └── layout/
│       └── __tests__/
│           └── nav-items.test.ts    # 네비게이션 활성 항목, 에디터 라우트 판별, 자동 접힘
├── lib/
│   └── __tests__/
│       ├── placeholder.test.ts      # 플레이스홀더 추출/치환
│       ├── bundle.test.ts           # 번들 참조 추출/치환
│       ├── sd-studio-import.test.ts # SD Studio JSON 파싱
│       ├── nai-metadata.test.ts     # NAI 메타데이터 파싱 (PNG tEXt, A1111)
│       ├── nai-import.test.ts       # 모델 감지, 메타데이터 → 파라미터 매핑, 선택 적용
│       ├── nai-models.test.ts       # 모델 프로파일/기능 판별 (V5 포함)
│       ├── project-packs.test.ts    # 팩 이름 중복/접미사, 순서 교환
│       └── prompt-tags.test.ts      # 프롬프트 태그 토큰 매칭 (가중치/중괄호/언더스코어)
└── server/
    └── services/
        └── __tests__/
            ├── download.test.ts     # 파일명 템플릿 치환
            └── nai-request.test.ts  # NAI 요청 빌더 (V5 multipart vs JSON)
```

### 테스트 대상 모듈

| 모듈                              | 테스트 항목                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/lib/placeholder.ts`          | `extractPlaceholders`, `resolvePlaceholders` — 정규식 기반 플레이스홀더 추출/치환, 엣지 케이스                        |
| `src/lib/bundle.ts`               | `extractBundleReferences`, `resolveBundles` — `@{bundle:name}` 구문 추출/치환                                         |
| `src/lib/sd-studio-import.ts`     | `parseSdStudioFile` — 입력 검증, 카테시안 곱, 라이브러리 참조, 이름 중복 처리, 프롬프트 정리                          |
| `src/lib/nai-metadata.ts`         | `parseNAIMetadata`, `getUcPresetLabel` — PNG 바이너리 tEXt 청크 파싱, NAI/A1111 형식 변환, V4 프롬프트, Vibe Transfer |
| `src/components/layout/nav-items.ts` | `getActiveNavItem`, `isEditorRoute`, `shouldAutoCollapse` — 경로 기반 활성 항목 판별, 에디터 라우트 자동 접힘 조건 |
| `src/server/services/download.ts` | `resolveFilenameTemplate` — 변수 치환, 금지 문자 제거, 빈 결과 폴백                                                   |

### 테스트 작성 규칙

- `import { describe, it, expect } from 'vitest'` 명시적 임포트
- DB 의존성이 있는 서비스(`prompt.ts`, `generation.ts`)는 현재 테스트 제외 (별도 모킹 필요)
- `nai-metadata.test.ts`에서 PNG 바이너리를 직접 생성하여 tEXt 청크 파싱 테스트 (Stealth Alpha는 브라우저 API 의존으로 제외)
