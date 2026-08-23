# Frontend architecture

## Root Submodel, one Submodel per route arm

A root Submodel owns the top-level route; each route arm (Gallery, Editor, Collage) is its own Submodel embedded via `h.submodel`. Route-driven state initializes via `init(route)` (cold load) and refreshes via `informRouteChanged(route)` (navigation), both firing the same route-driven Commands — so reload and in-app navigation behave identically. Child messages wrap as `Got<Arm>Message`, keeping each screen's state machine behind its own boundary.

## Error taxonomy

Every failure is a `Schema.TaggedError` (message + optional cause) — never a plain `Error`, never flattened to a string at the message boundary:

- Recoverable failures ride the Effect error channel of commands; defects (impossible states, programmer errors) are _tagged throws_ that still crash.
- Failure messages carry the error instance or a schema union naming the failure set. The message schema is therefore the documented, enforced failure set: adding a failure mode means consciously widening a union and its `catchTags` table (exhaustive dispatch forces a decision per tag).
- Causes survive to the model and views, so retry / quota / network-vs-corrupt discrimination never needs string parsing.
- Deliberate exception: structured-clone worker boundaries may carry string errors, consumed into tagged errors at the seam.

## Component pattern

A component is a **directory**, not a file: `index.ts` barrels the public surface; one file per role (view, pure atoms, pure data logic, Effect mounts). Views are pure functions of `(h, model)` — no state, no DOM access; side effects live in `Mount.define`/`Mount.defineStream` blocks. Conditional rendering is an Option pipeline ending in a plain `null` child (fabricated empty divs are banned); union dispatch is `Match` with schema guards (`switch` is banned for unions); data plumbing is `pipe`. Parameters are always annotated; return types only where they earn their keep.

## View performance discipline

Memoization at stable boundaries is load-bearing, not polish:

- Every expensive subtree sits behind a **module-scope `createLazy`/`createKeyedLazy` slot**, taking exactly the model slices it needs — never the whole Model, or unrelated mutations invalidate it — plus `h`.
- Every mapped list is keyed by a stable entity id (`h.Key` on layers, tiles, thumbs, cards), never index.
- Render-only derivations stay in the view behind lazy slots; move them onto the Model only if measurement proves the derivation itself is hot.
- Updates preserve unchanged references (`evo` discipline) so lazy `===` checks hit.
- High-frequency gesture messages (pan/zoom/hover/drag) are excluded from DevTools history, and heavy binaries (`ImageBitmap`, multi-MB `Uint8Array`) must never be walked by diffable snapshots.
