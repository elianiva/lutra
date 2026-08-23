// The persistence seam (docs/adr/0007, 0008, 0030). Owns the Edit / Collage
// schemas, the swappable EditStore / CollageStore contracts, and backend
// implementations. A future server/account-side store lands here too.

export { EditId, EditIdSchema, newEditId } from './edit/edit-id'
export type { EditId as EditIdType } from './edit/edit-id'
export { Edit } from './edit/edit'
export type { Edit as EditType } from './edit/edit'
export { EditSummary } from './edit/edit-summary'
export type { EditSummary as EditSummaryType } from './edit/edit-summary'
export { StoreError } from './edit/store-error'
export type { StoreError as StoreErrorType } from './edit/store-error'

export { CollageId, CollageIdSchema, newCollageId } from './collage/collage-id'
export type { CollageId as CollageIdType } from './collage/collage-id'
export {
  Collage,
  CollageBackground,
  CollageLayout,
  CollageTile,
  TileFraming,
  defaultCollageLayout,
  defaultTileFraming,
} from './collage/collage'
export type {
  Collage as CollageType,
  CollageBackground as CollageBackgroundType,
  CollageLayout as CollageLayoutType,
  CollageTile as CollageTileType,
  TileFraming as TileFramingType,
} from './collage/collage'

export { EditStore } from './edit/edit-store'
export type { EditStore as EditStoreContract } from './edit/edit-store'
export { EditTable } from './edit/edit-table'
export { EditStoreIndexedDb, EditStoreLive } from './edit/edit-store-indexeddb'
export { CollageStore } from './collage/collage-store'
export type { CollageStore as CollageStoreContract } from './collage/collage-store'
export { CollageTable } from './collage/collage-table'
export { CollageStoreIndexedDb, CollageStoreLive } from './collage/collage-store-indexeddb'

// The shared database schema ("lutra": v1 edits, v2 collages)
export { LutraDbSchema } from './db'
