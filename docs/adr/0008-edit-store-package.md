# Edit storage lives in its own package (@lutra/store)

A third workspace package, `@lutra/store`, owns the persistence seam: the `Edit` / `EditSummary` schemas, the `EditStore` service contract (save/load/list/delete), the IndexedDB local `EditStoreLive`, and — later — the account/cloud `EditStoreLive`. `@lutra/engine` stays pure (no storage, no browser concerns), the frontend consumes both engine and store, and a future server imports the `Edit` schema from the store package rather than redefining it.

**Status**: accepted

**Considered Options**:

- **Contract in `@lutra/engine`** — follows the ADR 0006 `ImageEncoder` pattern (engine owns contracts), but would push storage schemas _and_ a browser IndexedDB implementation _and_ a future network backend into a package documented as the pure, no-DOM computational core.
- **Separate `@lutra/store` package** — keeps engine pure; gives the seam (which will have IndexedDB, worker, and server implementations) a single natural home that a future server can depend on. This is what we picked.
- **Only create it when the server lands (YAGNI)** — saves the slicing now, but the local IndexedDB backend is already a substantial, distinct module, and retrofitting a package boundary later while adding auth is exactly when it gets painful.

**Consequences**:

- The dependency graph is acyclic: `@lutra/store → @lutra/engine` (store reuses the engine's `Layer` schema for chains); `@lutra/frontend → @lutra/store + @lutra/engine`.
- A future server-side `EditStoreLive` (e.g. D1/Turso + R2) implements the same `save`/`load`/`list`/`delete` contract; the app swaps the backend via a Layer, unchanged at the call sites.
- `@lutra/store` is browser-side for its v1 (IndexedDB) implementation; the schema/contract halves of it are platform-neutral and reusable anywhere.
