# Expanded Prompt Editor (CodeMirror Fullscreen Dialog)

## Overview

CodeMirror 프롬프트 에디터에 확대 편집 기능을 추가한다. 프롬프트 편집은 많은 라인을 수정하는 작업이므로, 거의 풀스크린에 가까운 Dialog에서 넓은 편집 공간을 제공한다.

## Scope

**대상**: CodeMirror 기반 PromptEditor가 사용되는 4개 에디터

- General Prompt (200px)
- Negative Prompt (120px)
- Character Prompt (200px)
- Character Negative Prompt (120px)

**추가 대상**: 프로젝트 내 모든 textarea 편집 필드

- PlaceholderEditor의 플레이스홀더 값 textarea (unfilled/filled, general/character)
- ScenePackDialog의 씬 플레이스홀더 값 Textarea
- 이미지 메모 Textarea (image-detail-overlay, gallery/$imageId)
- 프로젝트 설명 Textarea (대시보드 프로젝트 생성 다이얼로그)

## Architecture

### New Component

**`src/components/prompt-editor/expanded-editor-dialog.tsx`**

`ExpandedEditorDialog` — Radix UI Dialog 안에 PromptEditor를 렌더링하는 컴포넌트.

```typescript
interface ExpandedEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  bundleNames?: Array<{ name: string; content: string }>
}
```

### New Component (Textarea)

**`src/components/common/expanded-textarea-dialog.tsx`**

`ExpandedTextareaDialog` — Radix UI Dialog 안에 Textarea를 렌더링하는 컴포넌트. CodeMirror 없이 일반 textarea를 풀스크린으로 확대.

```typescript
interface ExpandedTextareaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onBlur?: () => void
}
```

### Modified Components

**`src/components/workspace/prompt-panel.tsx`**
각 에디터의 라벨 행에 확대 버튼을 추가한다.

**`src/components/workspace/placeholder-editor.tsx`**
각 플레이스홀더 textarea 옆에 확대 버튼을 추가한다.

**`src/components/workspace/scene-pack-dialog.tsx`**
씬 편집 패널의 플레이스홀더 textarea 옆에 확대 버튼을 추가한다.

**`src/components/common/image-detail-overlay.tsx`**
이미지 메모 textarea 옆에 확대 버튼을 추가한다.

**`src/routes/gallery/$imageId.tsx`**
이미지 메모 textarea 옆에 확대 버튼을 추가한다.

**`src/routes/index.tsx`**
프로젝트 설명 textarea 옆에 확대 버튼을 추가한다.

## Expand Button

### Placement

각 에디터의 라벨 텍스트 오른쪽에 배치한다. 에디터 내부가 아닌 라벨 행에 위치하므로 텍스트를 가리지 않는다.

```
[General Prompt]  [⤢]
┌─────────────────────────┐
│ CodeMirror editor       │
└─────────────────────────┘
```

### Style

- Icon: Hugeicons expand 계열 아이콘 (예: `ArrowExpand01Icon`)
- Size: ghost button, `h-6 w-6`
- Visibility: 항상 보임 (hover 전용이 아님)
- Tooltip/aria-label: i18n 키 사용

## Expanded Editor Dialog Layout

```
┌──────────────────────────────────────────────────┐
│  {title}                                   [✕]   │  header
├──────────────────────────────────────────────────┤
│                                                  │
│  PromptEditor (flex-1, fills remaining space)    │
│  - autocomplete (danbooru + bundle)              │
│  - placeholder highlighting                      │
│  - bundle highlighting                           │
│  - weight highlighting                           │
│  - theme (dark/light)                            │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Sizing

- **Desktop**: `max-w-[90vw]`, `h-[85vh]`
- **Mobile (< sm)**: fullscreen — `w-full h-full`, inset-0, no border-radius

### Behavior

- **Real-time sync**: onChange fires on every keystroke, same as inline editor. No "apply/cancel" buttons.
- **Auto-focus**: PromptEditor receives focus when dialog opens.
- **Close**: ESC key or close button. Content is already synced, so closing simply dismisses.
- **Tab/character switch while open**: Dialog closes (open state resets when parent re-renders with different tab).
- **Route navigation while open**: Radix Dialog auto-unmounts.
- **Cursor position**: No preservation needed — expanded editor starts fresh.

### CodeMirror Instance Strategy

원본 에디터는 Dialog 뒤에 마운트 상태로 유지한다. 확대 에디터에서 입력하면 onChange → parent state update → 원본 에디터도 value prop으로 동기화. CodeMirror 인스턴스가 2개 공존하지만, 가려진 에디터는 렌더링 비용이 거의 없고 프롬프트 텍스트 크기도 작으므로 성능 문제 없음.

## i18n

### New Keys

| Key                       | EN            | KO          |
| ------------------------- | ------------- | ----------- |
| `workspace.prompt.expand` | Expand editor | 에디터 확대 |

### Reused Keys

Dialog 타이틀은 기존 라벨 키를 재사용한다:

- `workspace.prompt.general`
- `workspace.prompt.negative`
- (캐릭터 이름은 데이터에서 가져옴)

## Edge Cases

- **Dialog 열린 상태에서 탭 전환**: Dialog 닫힘 (open state 리셋)
- **Dialog 열린 상태에서 라우트 이동**: 자동 언마운트
- **빈 프롬프트**: 정상 동작 (빈 에디터가 확대될 뿐)
- **매우 긴 프롬프트**: CodeMirror가 가상 렌더링 처리하므로 성능 문제 없음

## Testing

UI 인터랙션 중심 기능이므로 별도 유닛 테스트 대상 아님. 기존 PromptEditor 동작을 변경하지 않으므로 기존 테스트에 영향 없음.

## Summary

| Item             | Detail                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New files        | 2 (`expanded-editor-dialog.tsx`, `expanded-textarea-dialog.tsx`)                                                                                             |
| Modified files   | 8 (`prompt-panel.tsx`, `placeholder-editor.tsx`, `scene-pack-dialog.tsx`, `image-detail-overlay.tsx`, `gallery/$imageId.tsx`, `index.tsx`, `en.ts`, `ko.ts`) |
| New dependencies | None                                                                                                                                                         |
| Breaking changes | None                                                                                                                                                         |
