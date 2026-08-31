/** Stateful submodel — import the whole module as a namespace and wire its
 *  Model/Message/init/update into your app:
 *  `import * as DragAndDrop from '@/components/ui/drag-and-drop'`
 */
import { DragAndDrop as FoldkitDragAndDrop } from '@foldkit/ui'

// Re-export the @foldkit/ui DragAndDrop surface. Drag and drop is heavily
// consumer-driven: you own the item/container data model, and this module
// provides the styled hooks (`draggable`, `sortable`, `droppable`) plus the
// helpers for reading drag state. Wire `data-dragging` / `data-drop-target`
// in your view via `isDragging` / `maybeDropTarget` — the submodel does not
// emit those attributes itself (it emits `data-draggable-id`,
// `data-sortable-id`, `data-droppable-id`, `role`, `aria-roledescription`,
// and `tabindex`). See the showcase view for the full pattern.

export const init = FoldkitDragAndDrop.init
export const update = FoldkitDragAndDrop.update
export const draggable = FoldkitDragAndDrop.draggable
export const droppable = FoldkitDragAndDrop.droppable
export const sortable = FoldkitDragAndDrop.sortable
export const ghostStyle = FoldkitDragAndDrop.ghostStyle
export const isDragging = FoldkitDragAndDrop.isDragging
export const maybeDraggedItemId = FoldkitDragAndDrop.maybeDraggedItemId
export const maybeDropTarget = FoldkitDragAndDrop.maybeDropTarget
export const subscriptions = FoldkitDragAndDrop.subscriptions
export const Model = FoldkitDragAndDrop.Model
export type Model = typeof Model.Type
export const Message = FoldkitDragAndDrop.Message
export type Message = typeof Message.Type
export const OutMessage = FoldkitDragAndDrop.OutMessage
export type OutMessage = typeof OutMessage.Type

export type InitConfig = FoldkitDragAndDrop.InitConfig
export type DraggableConfig<M> = FoldkitDragAndDrop.DraggableConfig<M>
export type DraggableMessage = FoldkitDragAndDrop.DraggableMessage

// Card-like draggable item. Mirrors shadcn card/list-item styling:
// `border bg-card text-card-foreground shadow-xs` with
// `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50`
// since `draggable` emits `tabindex=0` + `role=option` (focusable). The
// submodel's `touch-action: none` / `user-select: none` inline styles are
// complemented here with `select-none` + `cursor-grab`. Set
// `data-dragging` on the element when `isDragging` / `maybeDraggedItemId`
// indicates this item is being dragged — the `data-[dragging]:opacity-50`
// hook dims the source. Keyboard dragging is covered by `focus-visible`
// rather than a separate `data-[keyboard-dragging]` attribute (the submodel
// never emits that).
export const dragCardClass =
  'flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-card-foreground shadow-xs outline-none select-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[dragging]:opacity-50 cursor-grab active:cursor-grabbing'

export const dragDropPlaceholderClass =
  'h-9 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5'

export const dragContainerClass =
  'flex min-h-[120px] flex-col gap-1.5 rounded-lg border-2 border-transparent bg-muted/50 p-2 outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[drop-target]:border-dashed data-[drop-target]:border-primary/50 data-[drop-target]:bg-accent/50'

export const dragGhostClass =
  'flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-card-foreground shadow-lg ring-1 ring-foreground/10 select-none'

