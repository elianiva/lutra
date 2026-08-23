# Offline support

The app works fully offline: the vendored LUT library (catalog + cubes + thumbnails) mirrors into Cache Storage, built by a **page-driven background fill**; the **service worker stays dumb**.

## The fill is page-side

The fill runs as an Effect fiber in a page-side service layer, publishing per-file events through a PubSub that a root subscription bridges into the message loop. It is diff-based (catalog vs cached keys — no versioning needed; deploys adding LUTs are picked up next run), throttled in batches, resumable across sessions, pauses while offline, stops on quota (retry gated on a fresh `navigator.storage.persist()` grant), and skips auto-start under Save-Data (manual start instead).

An SW-driven fill was rejected: it loses Effect's retries and resource management, gets killed after idle anyway (so "background" is illusory), and is untestable in the repo's vitest setup. Workbox/vite-plugin-pwa were rejected: there is no third-party routing need and the interesting logic is page-side.

## The SW precaches the shell and serves caches

Two caches with different lifetimes:

- `lutra-shell-<hash>` — named after a build-time hash of the precache manifest; every deploy installs fresh, and activate purges previous shells wholesale (dead hashed assets included). Navigations serve network-first with the cached page as fallback.
- The LUT cache — **never touched by the SW**. The page owns it: single writer, no duplicated fill logic in untestable SW JS, no racing writers. The cache is version-agnostic, so the offline library survives SW swaps by construction. `/luts/*` serves cache-first with put-on-miss, so actual usage is cached ahead of the fill queue.

**Consequences**: full offline editing/saving/exporting once the fill completes; honest degradation during the fill window (dimmed rows + notice) and on quota (paused state with retry); the SW itself stays tiny, pinned by tests only where coupling matters (cache name, precache injection).
