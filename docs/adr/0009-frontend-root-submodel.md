# Frontend is a root Submodel with one Submodel per route arm

The frontend restructures to a **root Submodel** owning the top-level route and one **Submodel per route arm**: a thin **Gallery** submodel (Edit summaries grid) and the existing **Editor** converted into a Submodel. Route-driven state lives inside the Submodels via `init(route)` (cold load) and `informRouteChanged(route)` (navigation), both firing the same route-driven Commands so reload and in-app navigation behave identically. Editor Messages wrap as `GotEditorMessage`, Gallery as `GotGalleryMessage`; the root view embeds the active route arm with per-arm view identity.

**Status**: accepted

**Considered Options**:

- **Route arms only** (each route a branch in a single top-level `view`, shared `Model`/`Message`) — simplest for a thin gallery, but mixes gallery and editor state in one `Model`, bloats the `AppMessage` union, and gives no `Got*` boundary or DevTools filtering separation.
- **Root submodel + one submodel per route arm** — the foldkit-idiomatic shape (per the routing/informing-submodels docs and the typing-game exemplar). Clean separation (`GotEditorMessage`/`GotGalleryMessage`), each screen's state machine lives behind its own boundary, and growing a screen later is local. This is what we picked.

**Consequences**:

- The **foundational restructure** — root submodel, Gallery submodel, Editor-as-submodel — lands _before_ the store/backend work (packages/frontend's `main.ts`/`view.ts`/`update.ts` relocate the editor under an `Editor` boundary; the `@lutra/store` seam is its first real consumer).
- The editor's internal state machine (`phase.ts`, `command.ts`, render/export bookkeeping) is preserved, just relocated under the `Editor` submodel namespace. Its `update` is unchanged, so existing editor tests keep driving it directly.
- Route shape: **Gallery** `= "/"`, **Editor** `= "/edit/:editId"` (the id segment decoded through `EditIdSchema` via `schemaSegment`, so malformed ids fall through to NotFound). Opening a tile pushes `/edit/<uuid>`; the editor re-loads by id from both `init` and `informRouteChanged`.
- `Got*Message` wrappers follow the DevTools-submodel-filter convention.
