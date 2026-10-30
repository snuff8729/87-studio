# Natural-language tag search (EmbeddingGemma, local, manual on/off, prebuilt index)

Date: 2026-10-31
Status: approved by user (chat; user reviews usage only). Revised: the tag index is **prebuilt by the maintainer and
downloaded**, not built on the user's machine.
Branch / worktree: `feat/tag-semantic` at `../87-studio-sem` (from main 5f528f4)
Builds on: `2026-10-31-tag-assist-design.md` (Tag Search window). A parallel branch `fix/tag-card` edits the tag card /
Tag Search detail pane; this branch's Tag Search UI changes are small (toggle row + result section).

## Goal
Type a description in Korean or English ("빨간 리본으로 묶은 머리", "sitting on a bench at night") and get matching
Danbooru tags. Runs fully locally with Google **EmbeddingGemma** (300M) for the query. The model is **never loaded
implicitly** - the user switches it on/off manually; off = no memory used.

## Model & runtime
- `@huggingface/transformers` 4.3.1 (exact pin; Node + onnxruntime-node, bundled Windows x64 binaries) on the server;
  model `onnx-community/embeddinggemma-300m-ONNX`, dtype **q8** (`onnx/model_quantized.onnx` + `_data`, ~309 MB;
  q4 is 197 MB; fp16 is not recommended for Gemma). Downloaded on first enable into `data/models/hf/` (via `dataPath`,
  so `STUDIO_DATA_DIR` works) with progress. Not gated. The Gemma terms link is shown in the settings card; enabling
  = acceptance.
- Prompts: query `task: search result | query: <text>`; document `title: <tag name> | text: <category>. <wiki lead>
  Also: <aliases>, <other names>` (<= 360 chars). Matryoshka truncation to **256 dims**, L2-normalized, stored **int8**
  (scale 127). Pure helpers in `src/lib/semantic.ts` (tested).
- Query: embed (~100 ms), brute-force cosine over the in-memory int8 matrix (50k x 256 = 12.8 MB, a few ms), return
  top 50 (+ similarity score) joined with `danbooru.db` for post count / category. Results of the "By meaning" section
  are shown above the name matches (duplicates removed), filtered by the active category tab.
- Memory: switching off disposes the ONNX session and the matrix (RAM freed). "Delete downloaded files" removes
  `data/models/` entirely.

## Prebuilt index (maintainer builds, app downloads)
- Content: top **N = 50,000** general/character/copyright tags by post count (not deprecated), names in meta json.
- Files (next to `danbooru.db` on HuggingFace, `TAG_INDEX_BASE_URL` in `src/lib/semantic.ts`, override with env
  `SEMANTIC_INDEX_URL`):
  - `tag-index-embeddinggemma-300m-q8-50000-256.bin` - int8 row-major 50000 x 256 (12.8 MB)
  - `tag-index-embeddinggemma-300m-q8-50000-256.json` - meta: `version, indexVersion, model, modelId, dtype,
    quantization, dims, size, count, dbVersion, builtAt, sha256, bytes, names[]`
- `TAG_INDEX_VERSION` (constant) is bumped whenever the files are re-uploaded with a different format/contents; the app
  rejects a mismatching `indexVersion`. A different `dbVersion` than the local `danbooru.db.version` is informational
  only (names are looked up in the local DB; missing ones are skipped).
- Maintainer script `scripts/build-tag-index.mjs <danbooru.db> [--n 50000] [--dims 256] [--out dir] [--cache dir]
  [--mock]` (run with `runtime/node/node.exe` from the repo root): embeds with the real model (~50 docs/s on a laptop
  CPU, ~17 min for 50k), resumable (`<out>/.build/`), prints progress/ETA, writes `.bin` + `.json` with sha256.
  `--mock` builds a tiny hash-embedded index for smoke tests.
- Client download: on first enable fetch `.json` then `.bin` (streamed with progress), verify size + sha256, store
  under `data/models/`, meta written last (its presence marks a complete index). Failure -> status `error` with the
  message and a **Retry** button. No local build fallback.

## Manual on/off (no implicit loading)
- **Settings > Tag search** card (new section nav entry): "Natural-language search" switch (persisted as setting
  `semantic_enabled`), status line + progress bar (off / downloading tag index x% / downloading model x% / loading /
  ready / error + Retry), downloaded-files line (model size, index size, tag count), "Delete downloaded files"
  (confirm), db-version mismatch note, Gemma terms link.
- **Tag Search window / mobile sheet**: compact "Natural" switch row under the search box mirroring the setting
  (status polled only while the window is mounted: 700 ms while busy, 3 s otherwise). While busy: spinner + short
  status text. When ON and ready, results get a "By meaning" section (similarity bar per row) above "By name"; when
  OFF the behaviour is exactly as before. **Searching never turns it on** and never calls the semantic endpoint while
  not ready.
- A persisted "on" resumes lazily: the first status request after a server start kicks off load (index/model are
  cached, so no re-download).
- Server functions (`src/server/functions/semantic.ts`): `getSemanticStatus`, `setSemanticEnabled({on})`,
  `deleteSemanticFiles`, `semanticTagSearch({query, limit})` (throws `SEMANTIC_NOT_READY` unless ready).
  Service: `src/server/services/semantic.ts` (state survives HMR via `globalThis`).

## Install / start scripts
- `start.ps1` / `start.sh` previously skipped `npm install` whenever `node_modules/.package-lock.json` existed. They now
  reinstall when `package.json` is newer than that marker (and touch the marker after installing). `update.*` already
  installs every time. `pnpm-lock.yaml` updated (the `nitro: latest` entry deliberately kept at the previously locked
  `3.0.1-alpha.2`).
- onnxruntime-node ships Windows x64 binaries inside the package (no postinstall download on Windows); verified working
  with the bundled Node 22.12 runtime.
- Production build: `@huggingface/transformers` is kept external in the Nitro bundle (`vite.config.ts`
  `rollupConfig.external`) because it loads `onnxruntime-node` through a runtime `require`; `node .output/server/index.mjs`
  run from the app folder resolves it from the project `node_modules`.

## Mock / tests
- `SEMANTIC_MOCK=1`: deterministic hash embedder (`mockEmbed`), fake model "download" (`SEMANTIC_MOCK_DELAY_MS`,
  default 600), mock index files named `tag-index-mock-50000-256.*` (built with `build-tag-index.mjs --mock`, served by
  the smoke from a local HTTP server via `SEMANTIC_INDEX_URL`).
- Unit tests (`src/lib/__tests__/semantic.test.ts`): prompts, vector math, int8 quantization, top-k, index meta
  compatibility, mock embedder.
- Smoke `scripts/smoke/tag-semantic.mjs` (see header for setup).
- Real end-to-end check done with the actual model (see the implementation report).
