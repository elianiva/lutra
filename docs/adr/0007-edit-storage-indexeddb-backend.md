# Edit storage is a swappable backend; local is IndexedDB for the whole self-contained Edit

Edits (a **source image** + **edit chain** + **thumbnail**, one self-contained record per UUID) persist through a swappable storage abstraction. The v1 backend is the browser's **IndexedDB**, holding the *entire* Edit — chain JSON and source-image bytes together in one keyed record — via `@effect/platform-browser`'s IndexedDB-backed `KeyValueStore` with explicit database name `"lutra"`. This drops the previously-planned OPFS-for-source-images split.

**Status**: accepted

**Considered Options**:

- **OPFS for source images, IndexedDB JSON for chain metadata** (the originally planned layout) — lets source blobs live in raw files, but breaks Edit atomicity (image and chain never commit together), complicates the cloud future, and splits every save/load across two stores.
- **IndexedDB for the whole self-contained Edit** — one key per Edit UUID holds chain + bytes, so save/load/delete is a single transactional record; an Edit maps 1:1 to a future cloud object. This is what we picked.
- **OPFS only** — no metadata store, no per-Edit JSON; wrong fit for chain + thumbnail.

**Implementation**: the v1 backend is built on `@effect/platform-browser`'s `BrowserKeyValueStore.layerIndexedDb` (a flat schema-typed `KeyValueStore`, not the raw `IndexedDbTable` migration stack), with explicit DB name `"lutra"`. A self-contained Edit, encoded with `Schema.Uint8Array` for source image + thumbnail, is one stored value keyed by its Edit id. Because a `KeyValueStore` is keyed by id and not indexable by time, the gallery's order comes from a `savedAt` field on the Edit record, sorted in memory by `list()`.

**Migration trigger**: if the gallery later needs cursor-paged or index-ordered queries, or we add tables beyond one-record-per-Edit, move the single store to a typed `IndexedDbTable` (e.g. an index on `savedAt`) using the `IndexedDbVersion` migration chain. The future sqlite backend (e.g. D1/Turso) will do its own ordering; the seam makes that swap a Layer change.

**Consequences**:

- A self-contained Edit is one IndexedDB record: chain JSON and source-image bytes are read and written together, atomically.
- The swappable seam is `save(Edit) / load(EditId) / list(EditSummary[]) / delete(EditId) / clearAll()` hiding the backend; IndexedDB is the v1 implementation. The gallery renders thumbnails as object URLs it converts from the summary's stored bytes; a future URL-serving backend returns them by URL and the render contract is unchanged.
- Source-image capacity is bounded by the browser's IndexedDB quota (hundreds of MB to GB), not by raw-file semantics — a known, accepted ceiling. Large raw-file workloads would revisit OPFS.
- The online backend (a future opt-in store, e.g. D1/Turso with R2 for source blobs) implements the same seam; because an Edit is self-contained, an upload is one record.
