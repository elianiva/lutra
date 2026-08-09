# Offline support: the page drives the fill; the service worker stays dumb

Lutra works fully offline by mirroring the vendored **LUT library** (catalog + 296 `.cube` files + generic thumbnails, ~46MB) into Cache Storage. The mirror is built by a **page-driven background fill** (an Effect fiber in a service layer publishing per-file events through a PubSub that a root foldkit Subscription bridges into the message loop); the **service worker only precaches the app shell** and serves the caches. Two caches with different lifetimes: `lutra-shell-<hash>` (named after a short hash of the precache manifest at build time — every deploy installs into a fresh cache, so activate purges the previous deploy's shell wholesale, dead hashed assets included) and `lutra-luts` (never touched by the SW — the page owns it, so the offline library survives SW swaps by construction).

**Status**: accepted

**Considered Options**:

- **Service-worker-driven fill** — the SW iterates the catalog and caches each file, reporting progress via `postMessage`. Loses Effect (retries, resource management), forces progress through a message bridge into the TEA model, gets killed after ~30s idle anyway (so "background" is illusory), and is untestable in the repo's vitest/happy-dom setup. Rejected.
- **Page-driven fill with the SW kept dumb** — the fill runs in an `OfflineFill` service layer; per-file events flow through an Effect PubSub into the root subscription; the SW precaches the shell at install and serves cache-first with put-on-miss (`/luts/*` runtime-caches the user's actual usage ahead of the fill's queue — cache-as-you-go needs zero page changes). Chosen.
- **On-demand-only caching** (no full mirror) — rejected: the goal is full offline; the background fill gets there without blocking the first visit.
- **Workbox / vite-plugin-pwa** — rejected: no third-party requests to route; the precache list is injected by a ~20-line build script; the interesting logic is page-side anyway.

**Implementation**: `src/offline/` owns the fill (`fill.ts` — the diff/loop, pure and testable), the machine (`machine.ts` — Idle/Filling/Ready with Paused + QuotaError), the cache seam (`cache.ts` — `LutCache` service over Cache Storage "lutra-luts"; errors tagged `unavailable` vs `quota`), and the root's offline slice. The fill is diff-based (catalog entries vs `cache.keys()`) — no catalog versioning needed; a deploy that adds LUTs is picked up on the next run. It throttles in batches, pauses while offline (polling `navigator.onLine` only while offline), retries transient failures with backoff, and stops on quota (announcing `QuotaError`; the retry is gated on a fresh `navigator.storage.persist()` grant to bound the retry loop). `saveData` skips the auto-start (the main menu strip shows a manual start button instead). The root subscription (`root/subscriptions.ts`) bridges the PubSub and the browser's online/offline events; root update steps the machine, owns the counters, and delegates per-file facts into the editor Submodel (ADR 0009 boundary), whose LUT bar renders per-row states (spinner while fetching, dimmed "not downloaded" badge + connect-once notice while offline). The strip (main menu) and the "Offline ready" toast (global) read the same slice. `sw/sw.ts` (built by `scripts/build-sw.ts`, which injects the hashed-asset precache manifest, the shell cache name it hashes to, and the shared LUT cache name — pinned by `sw-source.test.ts`) precaches the shell, purges only `lutra-shell-*` on activate, serves navigations network-first with the cached `index.html` fallback, `/luts/*` cache-first with put-on-miss, and other same-origin GETs cache-first. Registration is prod-only with `updateViaCache: 'none'`. The manifest + rasterized icons make the app installable.

**Why the SW never writes the LUT cache**: the offline library's lifecycle is the page's (diff, retries, quota handling, progress). A SW that also wrote it would duplicate that logic in untestable vanilla JS and create two writers racing on the same cache. The page's `cache.put` calls work regardless of SW version — the cache is version-agnostic — so the library survives deploys by construction.

**Migration trigger**: if the app ever gains server-side traffic (the future online Edit store, cloud LUT fetching), the SW grows network-first/runtime-cache strategies for those routes; the shell/LUT split stays.

**Consequences**:

- The app is fully offline-capable once the fill completes: editing, saving, exporting, and every LUT apply/preview work with zero network.
- First visit downloads ~10MB (shell) immediately; the ~46MB library fills in the background, throttled, resumable across sessions via the diff.
- The offline promise degrades honestly during the fill window (dimmed rows + a distinct notice) and on quota (a paused state with a retry path) — no silent failures.
- The SW stays ~90 lines and needs no unit tests; the coupling that matters (cache name, precache injection) is pinned by tests.
- Accepted risk: no browser-level smoke test of SW serving (decided in the planning session).
