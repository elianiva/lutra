# PWA + offline support (offline library)

Status: **Implemented** (2026-08-09) — see docs/adr/0015. Decided in the planning session; ready to implement.

## Goal

The app works **fully offline**: once the **offline library** (CONTEXT.md) is
mirrored, every feature — editing, saving, exporting, and all 296 LUTs with
their previews — works with zero network. Plus the standard PWA plumbing:
installable (manifest + icons), a service worker for the app shell, and an
"Offline ready" toast announcing completion.

## Why

The app is web-first and client-side only — its entire network surface is the
vendored **LUT library** (catalog JSON + 296 `.cube` files, 38MB + 8.2MB of
generic thumbnails) and the app shell itself. Edits live in IndexedDB, fonts
are bundled, shaders are generated, RAW/encode wasm ships with the build.
"Works offline" was therefore one real trade-off (the LUT library's size) plus
standard PWA plumbing.

## Decisions (D1–D10, from the planning session)

- **D1 — Full offline**: the complete library is mirrored (not app-shell-only,
  not on-demand). The 46MB downloads in the background instead of blocking the
  first visit.
- **D2 — Page-driven fill**: the fill is an Effect fiber in a service layer
  (`OfflineFill`), NOT the service worker. Progress lives in the TEA model
  (testable with vitest, Effect-idiomatic retries). The SW stays dumb.
- **D3 — Fill UX**: a thin progress strip on the main menu only ("Preparing
  offline library — 42%"), a toast only on the Downloading → Ready transition
  (once per browser, ever — a full cache boots silently), and a foldkit
  Machine: `Idle → Filling → Ready` with `Paused` and `QuotaError`.
- **D4 — Hand-rolled service worker** (~90 lines, `sw/sw.ts`), built by
  `scripts/build-sw.ts` after `vite build` (injects the hashed-asset precache
  manifest + the shared cache name). Registered prod-only
  (`import.meta.env.PROD`) with `updateViaCache: 'none'` — a SW in `vite dev`
  is a stale-cache footgun.
- **D5 — Silent updates**: `skipWaiting` + `clientsClaim`; two caches —
  `lutra-shell-<hash>` (the shell cache name is a short hash of the precache
  manifest, injected at build time, so every deploy installs into a fresh
  cache and activate purges the previous shell wholesale — old hashed assets
  never accumulate across releases) and `lutra-luts`
  (never touched by the SW; the page's fill owns it). Hashed assets make
  mid-session swaps safe. No "new version" toast.
- **D6 — Installable**: manifest (`display: standalone`, `theme_color:
  #111111`), icons rasterized from `public/icons/icon.svg` by
  `scripts/build-icons.ts` (@resvg/resvg-js; PNGs committed), default browser
  install UI (no custom button).
- **D7 — Offline window**: while offline, undownloaded LUT rows are dimmed
  with a "not downloaded" badge; clicking shows a distinct connect-once notice
  instead of the generic **LUT load error**.
- **D8 — Per-row progress via the root pubsub**: the fill publishes per-file
  events into an Effect PubSub; a root foldkit Subscription bridges them into
  the message loop. Per-LUT states (`fetching`/`downloaded`) drive the LUT
  bar's spinners; the strip's counters and the toast read the same channel.
- **D9 — Persistent storage**: `navigator.storage.persist()` requested on
  every start; the quota retry is **gated on a fresh grant** (a denied grant
  stops the retry loop; the strip's Retry button is the manual path).
- **D10 — saveData respected**: on metered connections the fill does not
  auto-start; the strip shows a "Start offline download" button instead.

## Current state (verified facts at planning time)

- Network surface: `packages/frontend/public/luts/` (catalog fetched by
  `luts/store.ts`, cubes on demand, thumbs from the LUT bar) + the shell
  (hashed assets incl. lazy AVIF/WebP encode wasm). Everything else is local.
- `LutStore` (luts/store.ts) memoizes catalog + parsed cubes; a failed fetch
  is not cached. **LUT load error** / **LUT parse error** are the existing
  error taxonomy.
- The editor's phase machine (`editor/phase.ts`) is the foldkit Machine
  precedent; `phase.test.ts` asserts `unreachableStates()` /
  `deadTransitions()` empty.
- foldkit facts: `Runtime.makeApplication` accepts a `subscriptions` config
  (`Subscription.persistent` for model-independent streams; services ride the
  stream's `R`). `Layer.merge` does **not** subtract requirements at the type
  level in effect 4.0.0-beta.102 — cross-service layers must be self-contained
  (`Layer.provide`). `Effect.either`/`forkDaemon`/`retry({delay})` are gone;
  use `Effect.result`/`forkScoped`/`retry({schedule})`.
- The catalog has no version field — the fill is **diff-based** (catalog
  entries vs `cache.keys()`), so catalog updates on later deploys are picked
  up automatically.

## Layout / architecture

```
entry.ts ── registers SW (prod only) ──► sw.js (precache shell, cache-first /luts/*)
                                              ▲ read/write
main.ts ── resources: OfflineFillLive (Layer, self-contained) ──► Cache Storage "lutra-luts"
                │ publishes FillEvents to a PubSub
root/subscriptions.ts ── bridges PubSub + online/offline events ──► RootMessage
root/update.ts ── steps offlineMachine, owns counters, delegates per-file facts
                ├──► editor (lutDownloads per LUT, online flag) ──► LUT bar rows
                └──► root view: strip (main menu) + toast (global)
```

## Key files

- `src/offline/` — `cache.ts` (LutCache service + `LUT_CACHE_NAME`),
  `messages.ts` (FillEvent + root messages), `fill.ts` (the loop +
  `OfflineFill` service), `machine.ts` (the foldkit Machine),
  `model.ts` (root slice + per-LUT download states).
- `src/root/` — `subscriptions.ts`, `offline-command.ts` (StartOfflineFill,
  DismissOfflineToast), offline arms in `update.ts`, strip + toast in
  `view.ts`.
- `src/editor/lut-bar/` — `thumb.ts` (spinner/badge), `bar.ts` (commit gate
  + notice line).
- `sw/sw.ts`, `scripts/build-sw.ts`, `scripts/build-icons.ts`,
  `public/manifest.webmanifest`, `public/icons/`.

## Verification

- Unit tests (vitest): `src/offline/machine.test.ts` (transitions +
  unreachable/dead), `src/offline/fill.test.ts` (diff, order, offline pause,
  retries, quota, throttle, silent full-cache boot), `src/offline/sw-source.test.ts`
  (SW/page cache-name coupling + manifest injection), `src/root/offline.test.ts`
  (machine stepping, counters, editor delegation, commands),
  `src/editor/lut-bar/offline.test.ts` (badge, notice, offline commit).
- Accepted risk (decided): no browser-level smoke test — the SW's serving
  behavior is verified by the coupling tests and code review only.
