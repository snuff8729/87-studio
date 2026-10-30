# Character Positions (per character default + per scene override)

Date: 2026-10-30
Status: approved by user (brainstorm `char-position-1.html`; reference: DNT-LAB/NAIA2.0 `core/character_settings.py`, `core/api_service.py`)

## Model

- Position spec: `{ mode: 'ai' | 'random' | 'fixed', x?: number, y?: number }`, x/y normalized 0–1 (origin top-left, x→right, y→down), rounded to 3 decimals, clamped to [0, 1]. Scene override adds `mode: 'inherit'` (= use character default). Default for every character = `ai` (identical to today's behaviour).
- Storage: character default on `characters` (new column `position` TEXT JSON, default NULL = ai) via a drizzle migration (0015); scene override in `character_scene_overrides` (new column `position` TEXT JSON, NULL = inherit). Quick Generate characters keep the spec in their local state (`87studio-quick-generate`).
- Resolution: coordinates are resolution-independent; the picker preview uses the current width/height aspect ratio; random resolution and size changes need no remapping.

## Resolution at generation time (pure module `src/lib/character-positions.ts`, unit-tested)

`resolveCharacterPositions(specs: Array<PositionSpec>, rng) → { useCoords: boolean, centers: Array<{x,y}> }`
- All `ai` → `useCoords: false`, centers all `{0.5, 0.5}` (exactly today's payload).
- Otherwise `useCoords: true`; `fixed` uses its x/y; `random` draws x,y uniformly in [0.1, 0.9] (3 decimals) keeping Euclidean distance ≥ 0.2 from already placed points (up to 5 tries, then keep last); `ai` characters in a mixed set are auto-placed on the first free point of the ring center → left → right → up → down → corners using 0.3/0.5/0.7, skipping points closer than 0.2 to placed ones.
- Called per image inside the generation loop (so random differs per image) — `generation.ts`; the final payload sets `use_coords` (top level and `v4_prompt.use_coords`) and per-character `centers` in `v4_prompt.caption.char_captions` and `v4_negative_prompt.caption.char_captions` (and `characterPrompts[].center` if our payload sends that), for V4/V4.5/V5. V3: no characters → untouched. Mock mode: same code path up to the network call.
- Keep `use_order` as today unless NAIA evidence requires otherwise.
- Save the actually used `{ useCoords, centers }` into each image's metadata (so random positions are visible/reproducible); show them in the image detail metadata view.
- The resolved specs (after inherit) are stored in the job's resolved data at enqueue time, like prompts.

## UI

- **Chars tab** (shared `CharactersEditor`, workspace + Quick Generate): per character "Position" row: segmented AI / Random / Fixed; Fixed shows the picker (below).
- **SceneView**: collapsible section "Character positions" next to placeholders (only when the project has ≥1 character and the model is not V3): per character segmented Default / AI / Random / Fixed (Default label shows what it resolves to, e.g. "Default: Fixed C3"); one shared picker stage at the current aspect ratio showing all fixed/default-fixed characters as numbered dots; drag the dot of a Fixed character; "Snap to grid" toggle (A1–E5 cell centers 0.1/0.3/0.5/0.7/0.9; persisted in localStorage; default off); label like "B3 · (0.30, 0.50)". Debounced save registered with pending-saves (Generate flushes).
- **Selection header** (scene select mode): "Character positions…" bulk action: choose character + mode (+ position) → apply to all checked scenes.
- **Quick Generate**: the picker in the Chars tab (no scenes).
- Picker: pointer + touch drag, keyboard arrows (0.01, shift 0.1) when a dot is focused, accessible labels.
- **Metadata import**: the shared import mapping (`src/lib/nai-import.ts` or equivalent) also imports positions when the source has `use_coords: true` (char_captions centers → Fixed per character); when `use_coords` false → AI. Part of the "Characters" group in the import dialog.

## Constraints

- shadcn first, hugeicons, i18n en + ko, dark tokens. tsc 0, eslint 0 errors, vitest green.
- Tests: pure module (all-ai payload identical to today, mixed placement, random distance/range with seeded rng, normalisation), payload builder assertions for V4.5 and V5, metadata import of positions.
- Real-write verification on a mock-mode dev server with throwaway `STUDIO_DATA_DIR` (see CLAUDE.md): set defaults and scene overrides, generate (mock), check job/image metadata centers and that random differs per image; resolution change keeps positions; mobile 390 picker drag works. Extend `scripts/smoke/queue.mjs` or workspace smoke as appropriate.
- Update `.claude/CLAUDE.md` (schema tables, prompt/generation rules).
