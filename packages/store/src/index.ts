// The persistence seam (docs/adr/0005-storage). Owns the Edit schema, the
// swappable EditStore contract, and backend implementations. A future
// server/account-side store lands here too.

export { EditId, EditIdSchema, newEditId } from './edit/edit-id'
export type { EditId as EditIdType } from './edit/edit-id'
export { Edit } from './edit/edit'
export type { Edit as EditType } from './edit/edit'
export { EditSummary } from './edit/edit-summary'
export type { EditSummary as EditSummaryType } from './edit/edit-summary'
export { StoreError } from './edit/store-error'
export type { StoreError as StoreErrorType } from './edit/store-error'

export { EditStore } from './edit/edit-store'
export type { EditStore as EditStoreContract } from './edit/edit-store'
export { EditTable } from './edit/edit-table'
export { EditStoreIndexedDb, EditStoreLive } from './edit/edit-store-indexeddb'

// The shared database schema ("lutra": v1 edits, v2 a retained no-op)
export { LutraDbSchema } from './db'
