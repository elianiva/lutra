# Edit storage is a swappable backend; local is IndexedDB for the whole self-contained Edit

Edits (a **source image** + **edit chain** + **thumbnail**, one self-contained record per UUID) persist through a swappable storage abstraction. The v1 backend is the browser's **IndexedDB**, holding the _entire_ Edit — chain JSON and source-image bytes together in one keyed record — via `@effect/platform-browser`'s IndexedDB-backed `KeyValueStore` with explicit database name `"lutra"`. This drops the previously-planned OPFS-for-source-images split.

**Status**: accepted

**Considered Options**:

- **OPFS for source images, IndexedDB JSON for chain metadata** (the originally planned layout) — lets source blobs live in raw files, but breaks Edit atomicity (image and chain never commit together), complicates the cloud future, and splits every save/load across two stores.
- **IndexedDB for the whole self-contained Edit** — one key per Edit UUID holds chain + bytes, so save/load/delete is a single transactional record; an Edit maps 1:1 to a future cloud object. This is what we picked.
- **OPFS only** — no metadata store, no per-Edit JSON; wrong fit for chain + thumbnail.

**Implementation**: the v1 backend is built on `@effect/platform-browser`'s typed `IndexedDbTable`/`IndexedDbDatabase` stack (one `edits` object store, `keyPath: 'id'`, with an index on `savedAt`), with explicit DB name `"lutra"`. The initial database schema version (`IndexedDbVersion` migration chain) creates the store and its index; later schema changes append versions via `.add`. A self-contained Edit — chain + source image + thumbnail — is one row in that store, encoded through the `Edit` schema. The gallery's order comes from a `savedAt` field on the record, sorted in memory by `list()` (the query builder returns rows unordered; ordering in memory keeps the store layer simple and matches the future sqlite backend's own ordering). Rows round-trip through effect's schema JSON codec, so the `Uint8Array` payloads (source/thumbnail) are stored as base64 strings — a documented v1 cost (~33% overhead on source images) that a future binary encoding can revisit without touching the seam.

**Why not the flat `KeyValueStore` (`layerIndexedDb`)**: a flat `KeyValueStore` has no key enumeration (`get`/`set`/`remove`/`clear`/`size` only) — it cannot implement the seam's `list()`, which must scan every Edit to build the gallery grid. The ADR's original migration trigger — “move to a typed table when the gallery needs ordered queries” — fires on the plain `list()` requirement itself, so the v1 lands directly on the typed table stack.

**Migration trigger**: if the gallery later needs cursor-paged queries, multi-key indexing, or tables beyond one-record-per-Edit, extend the `IndexedDbVersion` chain (a new version + `.add` migration). The future sqlite backend (e.g. D1/Turso) will do its own ordering; the seam makes that swap a Layer change.

**Consequences**:

- A self-contained Edit is one IndexedDB record: chain JSON and source-image bytes are read and written together, atomically.
- The swappable seam is `save(Edit) / load(EditId) / list(EditSummary[]) / delete(EditId) / clearAll()` hiding the backend; IndexedDB is the v1 implementation. The gallery renders thumbnails as object URLs it converts from the summary's stored bytes; a future URL-serving backend returns them by URL and the render contract is unchanged.
- Source-image capacity is bounded by the browser's IndexedDB quota (hundreds of MB to GB), not by raw-file semantics — a known, accepted ceiling. Large raw-file workloads would revisit OPFS.
- The online backend (a future opt-in store, e.g. D1/Turso with R2 for source blobs) implements the same seam; because an Edit is self-contained, an upload is one record.
