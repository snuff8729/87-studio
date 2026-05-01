# 87 Studio

NovelAI(NAI) 4/4.5를 활용하여 캐릭터 이미지 세트를 효율적으로 생성하고 관리하는 개인용 웹 애플리케이션.
포즈/제스처별 프롬프트 프리셋을 관리하고, 대량 생성 후 즐겨찾기·토너먼트로 최종 이미지를 선별하는 워크플로우를 지원한다.

## 주요 기능

- **프롬프트 프리셋 관리** — 씬 팩/씬 기반 포즈·제스처 프리셋 템플릿 시스템
- **플레이스홀더 시스템** — `@{slot:name}` 구문으로 씬별 가변 값 삽입
- **프롬프트 번들** — `@{bundle:name}` 구문으로 재사용 가능한 프롬프트 스니펫 라이브러리
- **다중 캐릭터 지원** — 프로젝트 내 여러 캐릭터 슬롯, 캐릭터별 씬 오버라이드
- **참조 이미지** — Vibe Transfer (스타일 반영), Precise Control (구도/포즈 반영)
- **배치 이미지 생성** — 여러 씬을 한번에 선택하여 대량 생성, 배치 단위 큐 관리
- **빠른 생성** — 프로젝트/씬 설정 없이 직접 이미지 생성
- **갤러리** — 프로젝트/씬/즐겨찾기/태그 필터링, 별점, 메모, 무한 스크롤
- **이상형 월드컵** — 같은 씬에서 생성된 이미지 1:1 비교 랭킹
- **태그 갤러리** — Danbooru 태그 검색, 북마크 컬렉션 관리
- **메타데이터 인스펙터** — NAI 이미지 메타데이터 추출 및 프로젝트 생성
- **SD Studio 임포트** — SD Studio 프리셋 JSON 파일 변환
- **일괄 다운로드** — 필터/선택 기반 ZIP 다운로드 (파일명 템플릿 지원)
- **큐 관리** — 생성 큐 실시간 상태 시각화, 배치별 진행 현황
- **온보딩** — 처음 사용자를 위한 단계별 가이드 튜토리얼
- **다국어** — English / 한국어
- **반응형** — 데스크톱 + 태블릿 + 모바일

## 기술 스택

- **TanStack Start** (풀스택 React 프레임워크) + **Vite 7**
- **React 19** + **TypeScript**
- **SQLite** (better-sqlite3) + **Drizzle ORM**
- **shadcn/ui** + **Tailwind CSS 4** + **Radix UI**
- **CodeMirror 6** (Danbooru 태그 자동완성, 플레이스홀더/번들 하이라이팅, 컨텍스트 메뉴)
- **Nitro** (프로덕션 서버)

## 시작하기

### 간편 실행 (Node.js 미설치 환경)

```bash
# Linux / macOS
./start.sh

# Windows
start.bat
```

자동으로 Node.js v22를 다운로드하고, 의존성 설치, DB 마이그레이션, 빌드, 서버 실행까지 수행한다.

### 개발 환경

```bash
pnpm install          # 의존성 설치
pnpm dev              # 개발 서버 (http://localhost:3000)
```

### 프로덕션 빌드

```bash
pnpm build            # 빌드
pnpm start            # 서버 실행
```

### 테스트

```bash
pnpm test             # 전체 테스트 실행 (vitest)
pnpm test -- --watch  # 워치 모드
```

테스트 대상 모듈:

- **플레이스홀더 시스템** — `@{slot:name}` 추출/치환 (`src/lib/placeholder.ts`)
- **프롬프트 번들** — `@{bundle:name}` 참조 추출/치환 (`src/lib/bundle.ts`)
- **SD Studio 임포트** — JSON 파싱, 카테시안 곱, 라이브러리 참조 (`src/lib/sd-studio-import.ts`)
- **NAI 메타데이터 파서** — PNG tEXt 청크, NAI/A1111 형식 (`src/lib/nai-metadata.ts`)
- **다운로드 파일명 템플릿** — 파일명 변수 치환, 금지 문자 처리 (`src/server/services/download.ts`)

### DB 관리

```bash
pnpm db:generate      # 마이그레이션 생성
pnpm db:migrate       # 마이그레이션 적용
pnpm db:studio        # Drizzle Studio (DB 브라우저)
```

## 사용 플로우

### 프로젝트 기반 (정석)

1. 설정 페이지에서 NAI API 키 입력
2. (선택) 프롬프트 번들 생성 → 자주 쓰는 프롬프트 스니펫 등록
3. 씬 팩 생성 → 씬(포즈/제스처) 추가
4. 프로젝트 생성 → 캐릭터 슬롯 추가 → 프롬프트 템플릿 작성
5. (선택) 참조 이미지 등록 (Vibe Transfer / Precise Control)
6. 프로젝트에 씬 팩 할당 (스냅샷) → 캐릭터별 오버라이드 편집
7. 씬 선택 (다중 가능) → 배치 생성
8. 갤러리에서 결과 확인 → 즐겨찾기/별점/태그 선별
9. 이상형 월드컵으로 이미지 랭킹 → 최종 이미지 세트 완성
10. 갤러리에서 필터/선택 기반 일괄 다운로드

### 빠른 생성

1. /generate에서 프롬프트 직접 입력 → 참조 이미지 설정 → 즉시 생성

## 라이선스

[PolyForm Noncommercial License 1.0.0](LICENSE)
