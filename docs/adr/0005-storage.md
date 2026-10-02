# Storage

## Package boundary

Persistence lives in its own package, **@lutra/store**: the `Edit` / `EditSummary` schemas, the store service contracts (`save` / `load` / `list` / `delete` / `clearAll`), and the backend implementations. @lutra/engine stays pure — no storage, no browser concerns. The dependency graph is acyclic: `store → engine` (store reuses the engine's Layer schema); `frontend → store + engine`. A future server imports the schemas from the store package rather than redefining them, and swaps backends behind Effect Layers with call sites unchanged.

## Self-contained records

An Edit is **one self-contained record** — source bytes, edit chain, and thumbnail together, keyed by UUID. Save/load/delete are single atomic operations, and an Edit maps 1:1 to a future cloud object (an upload is one record). An OPFS-for-sources split was rejected: it breaks Edit atomicity (image and chain never commit together) and complicates the cloud future.

The v1 backend is the typed IndexedDB table stack (@effect/platform-browser): database `"lutra"`, one object store per record kind (`edits`), schema evolution via appended `IndexedDbVersion` migrations.

The database version is the number of declared versions, and IndexedDB refuses to open a database at a lower version than it is on disk, so **a shipped version is never removed**. v2 added the `collages` store; when collages were retired the version stayed as a no-op rather than being deleted, because dropping it back to v1 would fail the open outright and break every existing install's gallery. Fresh installs never create the store; existing ones keep its rows unread until a later version drops it.

Deliberate v1 costs, documented so they can be revisited without touching the seam:

- `Uint8Array` payloads round-trip through the JSON codec as base64 (~33% overhead).
- Capacity is bounded by IndexedDB quota — large raw-file workloads would revisit OPFS.
- The gallery renders object URLs converted from stored bytes; a future URL-serving backend changes the implementation, not the contract.
- `list()` sorts by `savedAt` in memory: the query returns rows unordered, and keeping ordering in memory stays portable to a server-side-ordered backend.

**Why typed tables, not a flat KeyValueStore**: a flat store has no key enumeration — it cannot implement `list()`, which must scan every record to build grids and menus. That requirement itself is the migration trigger: cursor-paged queries, multi-key indexes, or additional tables extend the version chain; they do not reshape the seam.
