// The persistence seam (docs/adr/0007, 0008). Owns the Edit / Edit summary
// schemas, the swappable EditStore contract, and backend implementations.
// A future server/account-side EditStoreLive lands here too.

// Edit domain
export { EditId, EditIdSchema } from './edit/edit-id'
export type { EditId as EditIdType } from './edit/edit-id'
export { Edit } from './edit/edit'
export type { Edit as EditType } from './edit/edit'
export { EditSummary } from './edit/edit-summary'
export type { EditSummary as EditSummaryType } from './edit/edit-summary'
export { StoreError } from './edit/store-error'
export type { StoreError as StoreErrorType } from './edit/store-error'

// The contract + backends
export { EditStore } from './edit/edit-store'
export type { EditStore as EditStoreShape } from './edit/edit-store'
export { EditStoreNoopLive } from './edit/edit-store-noop'
