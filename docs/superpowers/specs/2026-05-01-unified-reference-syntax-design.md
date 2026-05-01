# Unified Reference Syntax: `@{class:name}`

## Overview

플레이스홀더(slot)와 번들(bundle)의 참조 구문을 `@{class:name}` 형식으로 통일한다.

- 기존 플레이스홀더: `\\\\name\\\\` → `@{slot:name}`
- 기존 번들: `@{name}` → `@{bundle:name}`
- prefix 없는 `@{name}` → 에디터에서 에러 하이라이트

## 구문 정의

### 유효한 참조

```
@{slot:expression}      — 씬별 변수 슬롯
@{bundle:quality}       — 번들 텍스트 스니펫
```

### 무효한 참조 (에러)

```
@{expression}           — prefix 없음 → 에러 하이라이트
\\\\expression\\\\      — 구 구문 → 더 이상 인식하지 않음
```

### 정규식

```typescript
// 유효한 참조 매칭
const REFERENCE_RE = /@\{(slot|bundle):([^}]+)\}/g

// slot만 매칭
const SLOT_RE = /@\{slot:([^}]+)\}/g

// bundle만 매칭
const BUNDLE_RE = /@\{bundle:([^}]+)\}/g

// 무효한 참조 (prefix 없음) 매칭 — 에러 하이라이트용
const INVALID_REF_RE = /@\{(?!slot:|bundle:)([^}]+)\}/g
```

## 핵심 라이브러리 변경

### `src/lib/placeholder.ts`

기존 `\\\\(\w+)\\\\` 정규식을 `@\{slot:([^}]+)\}`로 교체.

- `extractPlaceholders(template)` — `@{slot:name}`에서 name 추출
- `resolvePlaceholders(template, values)` — `@{slot:name}`을 값으로 치환

### `src/lib/bundle.ts`

기존 `@\{([^}]+)\}` 정규식을 `@\{bundle:([^}]+)\}`로 교체.

- `extractBundleReferences(template)` — `@{bundle:name}`에서 name 추출
- `resolveBundles(template, bundleMap)` — `@{bundle:name}`을 내용으로 치환

## 프롬프트 합성 순서 (변경 없음)

1. `@{bundle:name}` 확장 (번들 내용으로 치환)
2. `@{slot:name}` 확장 (씬 플레이스홀더 값으로 치환)

순서는 기존과 동일. `src/server/services/prompt.ts`는 함수만 호출하므로 라이브러리 정규식 변경만으로 자동 적용.

## CodeMirror 에디터 변경

### 하이라이팅

기존 2개 플러그인을 1개로 통합하거나 각각 정규식만 교체:

- **placeholder-highlight.ts**: `/\\\\\w+\\\\/g` → `/@\{slot:[^}]+\}/g`, CSS class 유지 (`cm-placeholder-highlight`)
- **bundle-highlight.ts**: `/@\{[^}]+\}/g` → `/@\{bundle:[^}]+\}/g`, CSS class 유지 (`cm-bundle-highlight`)
- **신규: invalid-ref-highlight.ts**: `/@\{(?!slot:|bundle:)[^}]+\}/g` → 에러 스타일 (`cm-invalid-ref-highlight`), 빨간색/밑줄 등

### 자동완성 통합

기존 `bundleCompletion`과 `danbooruCompletion`을 하나의 통합 자동완성으로 교체.

**트리거 조건**: 
- `@{` 입력 시 → slot/bundle prefix 선택 + 이름 자동완성
- 일반 텍스트 입력 시 (콤마 뒤 2자 이상) → slot, bundle, danbooru 태그 모두 표시

**우선순위 (위에서 아래로)**:
1. **Slot** — 현재 프로젝트의 프롬프트에서 추출된 `@{slot:...}` 이름들
2. **Bundle** — 글로벌 번들 목록
3. **Danbooru 태그** — 태그 데이터

**`@{` 트리거 시 동작**:
1. `@{` 입력 → 드롭다운에 `slot:` prefix와 `bundle:` prefix 선택지 표시, 그 아래로 slot 이름들과 bundle 이름들 표시
2. `@{sl` 입력 → `slot:` prefix 필터됨 + slot 이름 목록
3. `@{slot:` 입력 → slot 이름만 목록
4. `@{slot:expr` 입력 → "expression" 등 매칭되는 slot 이름
5. 선택 시 `@{slot:expression}` 완성 (닫는 `}` 포함)
6. `@{bundle:` 입력 → bundle 이름만 목록, 기존과 동일

**일반 텍스트 트리거 시 동작**:
1. 콤마 뒤 2자 이상 입력 → 드롭다운 표시
2. slot 매칭 결과 → `@{slot:name}` 형태로 삽입 (현재 입력 중인 텍스트를 통째로 교체)
3. bundle 매칭 결과 → `@{bundle:name}` 형태로 삽입
4. danbooru 매칭 결과 → 기존처럼 태그 텍스트로 삽입
5. 각 카테고리는 시각적으로 구분 (type 속성으로 아이콘/색상 분리)

**Slot 이름 제공 방식**:
- `PromptEditor` props에 `slotNames?: Array<string>` 추가
- 워크스페이스에서 현재 프로젝트의 모든 프롬프트에서 `extractPlaceholders()`로 추출한 이름들을 전달
- 번들 페이지 등 프로젝트 컨텍스트가 없는 곳에서는 slot 자동완성 미표시

### 호버 툴팁

`bundle-tooltip.ts`의 정규식을 `@\{bundle:([^}]+)\}`로 교체. `@{slot:...}`에도 동일한 hover 툴팁을 추가할 수 있으나, slot은 에디터에서 정의하는 것이라 내용 미리보기가 불가 — 툴팁 없이 유지.

## UI 표시 변경

### 워크스페이스 컴포넌트 (12곳)

기존 `` `\\\\${key}\\\\` `` → `` `@{slot:${key}}` ``

- `placeholder-editor.tsx`: 5곳
- `scene-detail.tsx`: 2곳
- `scene-pack-dialog.tsx`: 3곳
- `prompt-panel.tsx`: 2곳

### 온보딩

`onboarding-overlay.tsx`의 검증 정규식: `/\\\\.+?\\\\/.test(text)` → `/@\{slot:.+?\}/.test(text)`

## 데이터 마이그레이션

### DB 텍스트 필드 (프롬프트 텍스트 내 구문 치환)

Drizzle 마이그레이션으로 처리. 이중 백슬래시 → `@{slot:name}` 변환은 SQL REPLACE로 처리 가능:

```sql
-- Placeholder: \\name\\ → @{slot:name}
-- SQL에서 \\는 리터럴 백슬래시. SQLite는 백슬래시를 이스케이프하지 않으므로 그대로 매칭.

-- projects
UPDATE projects SET general_prompt = REPLACE(general_prompt, '\\', CHAR(0)) WHERE general_prompt LIKE '%\\%';
-- 이후 CHAR(0) 쌍을 @{slot:...} 로 변환 — SQL만으로는 복잡함
```

**SQL만으로는 `\\name\\` 패턴의 name 부분을 보존하면서 변환하기 어려움.** JS 마이그레이션 스크립트로 처리:

```typescript
// 마이그레이션 스크립트 (drizzle custom migration 또는 별도 스크립트)
const LEGACY_PLACEHOLDER_RE = /\\\\(\w+)\\\\/g
function migrateSyntax(text: string): string {
  return text.replace(LEGACY_PLACEHOLDER_RE, (_, name) => `@{slot:${name}}`)
}
```

대상 테이블/컬럼:
- `projects.general_prompt`, `projects.negative_prompt`
- `characters.char_prompt`, `characters.char_negative`

### DB JSON 필드 (placeholders 값 내 구문)

`scenes.placeholders`, `project_scenes.placeholders`, `character_scene_overrides.placeholders`는 JSON 형태 `{"key": "value"}`로 저장됨. key는 순수 이름(prefix 없음)이고, value 안에 `\\name\\` 구문이 들어있을 수 있음. value 내부도 동일하게 치환.

### Bundle 참조 마이그레이션

기존 `@{name}` → `@{bundle:name}` 변환. 대상:
- `projects.general_prompt`, `projects.negative_prompt`
- `characters.char_prompt`, `characters.char_negative`
- `prompt_bundles.content` (번들 내부에서 다른 번들 참조 가능)

```typescript
const LEGACY_BUNDLE_RE = /@\{([^}]+)\}/g
function migrateBundleSyntax(text: string): string {
  return text.replace(LEGACY_BUNDLE_RE, (_, name) => `@{bundle:${name}}`)
}
```

**주의: placeholder → slot 마이그레이션을 먼저 실행한 후 bundle 마이그레이션 실행.** 순서가 중요함. placeholder 마이그레이션 후에는 `@{slot:...}`만 남아있으므로, bundle 마이그레이션의 `@{name}` 매칭이 slot을 건드리지 않도록 `@{(?!slot:)([^}]+)}` 패턴 사용.

### `generation_jobs.resolved_prompts`

이미 합성 완료된 과거 데이터. 변환하지 않음 (읽기 전용 참고 데이터).

## i18n 변경

`en.ts`, `ko.ts`의 `\\\\placeholders\\\\` 표기를 `@{slot:placeholders}`로 교체 (10곳).

## 문서 변경

`.claude/CLAUDE.md`, `README.md`의 `\\placeholder\\` 표기를 `@{slot:placeholder}`로 교체.

## 테스트 변경

- `src/lib/__tests__/placeholder.test.ts` — 모든 `\\\\name\\\\` → `@{slot:name}`
- `src/lib/__tests__/bundle.test.ts` — 모든 `@{name}` → `@{bundle:name}`

## CSS 스타일 추가

`src/styles.css`에 무효 참조 에러 하이라이트 스타일 추가:

```css
.cm-invalid-ref-highlight {
  text-decoration: wavy underline red;
  text-decoration-skip-ink: none;
}
```

## 영향 범위 요약

### 코어 로직 (정규식)
- `src/lib/placeholder.ts` — 정규식 교체
- `src/lib/bundle.ts` — 정규식 교체

### CodeMirror 플러그인
- `src/components/prompt-editor/placeholder-highlight.ts` — 정규식 교체
- `src/components/prompt-editor/bundle-highlight.ts` — 정규식 교체
- `src/components/prompt-editor/bundle-completion.ts` — 통합 자동완성으로 재작성
- `src/components/prompt-editor/bundle-tooltip.ts` — 정규식 교체
- `src/components/prompt-editor/danbooru-completion.ts` — 통합 자동완성에 병합
- `src/components/prompt-editor/prompt-editor.tsx` — 통합 자동완성 연결, slotNames prop 추가
- **신규**: `src/components/prompt-editor/invalid-ref-highlight.ts`

### 워크스페이스 UI (표시 문자열)
- `src/components/workspace/placeholder-editor.tsx` — 5곳
- `src/components/workspace/scene-detail.tsx` — 2곳
- `src/components/workspace/scene-pack-dialog.tsx` — 3곳
- `src/components/workspace/prompt-panel.tsx` — 2곳

### 온보딩
- `src/components/onboarding/onboarding-overlay.tsx` — 정규식 1곳

### 워크스페이스 라우트 (slotNames 전달)
- `src/routes/workspace/$projectId/index.tsx` — PromptEditor에 slotNames prop 전달
- `src/routes/workspace/$projectId/scenes/$sceneId.tsx` — 동일

### i18n
- `src/lib/i18n/en.ts` — 5곳
- `src/lib/i18n/ko.ts` — 5곳

### 테스트
- `src/lib/__tests__/placeholder.test.ts` — 전체
- `src/lib/__tests__/bundle.test.ts` — 전체

### 스타일
- `src/styles.css` — 에러 하이라이트 CSS 추가

### 서버
- `src/server/services/prompt.ts` — 코멘트 1곳

### DB 마이그레이션
- JS 마이그레이션 스크립트 1개 (placeholder + bundle 구문 변환)

### 문서
- `.claude/CLAUDE.md`
- `README.md`
