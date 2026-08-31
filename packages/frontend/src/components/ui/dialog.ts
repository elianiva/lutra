/** Stateful submodel — import the whole module as a namespace and wire its
 *  Model/Message/init/update into your app:
 *  `import * as Dialog from '@/components/ui/dialog'`
 */
import { Dialog as FoldkitDialog } from '@foldkit/ui'
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from 'foldkit/html'

type Child = Html | string

import { cn } from '@/lib/utils'

// Re-export the @foldkit/ui Dialog submodel surface so a foldcn Dialog is a
// drop-in for wiring `h.submodel`.

export const Model = FoldkitDialog.Model
export type Model = typeof Model.Type

export const Message = FoldkitDialog.Message
export type Message = typeof Message.Type

export const OutMessage = FoldkitDialog.OutMessage
export type OutMessage = typeof OutMessage.Type

export const init = (config: InitConfig): Model =>
  FoldkitDialog.init({ isAnimated: false, ...config })
export const update = FoldkitDialog.update
export const open = FoldkitDialog.open
export const close = FoldkitDialog.close
export const titleId = FoldkitDialog.titleId
export const descriptionId = FoldkitDialog.descriptionId
export const view = FoldkitDialog.view

export type InitConfig = FoldkitDialog.InitConfig
export type RenderInfo = FoldkitDialog.RenderInfo

/** foldkit delta: the host <dialog> element's own chrome (upstream Root renders
 *  nothing). Backdrop/panel are fixed-position; this only neutralizes the
 *  native dialog box. */
export const dialogClass = 'bg-transparent p-0 open:flex items-center justify-center'

// The @foldkit/ui Dialog defers Animation submodel attributes onto the
// backdrop/panel elements: `data-enter` while entering, `data-leave` while
// leaving (never `data-state`). The sync script rewrites upstream's
// `data-open:`/`data-closed:` animation utilities to these windows during token
// sync; persistent `data-open:` styling passes through untouched.
export const dialogBackdropClass =
  'data-enter:animate-in data-leave:animate-out data-leave:fade-out-0 data-enter:fade-in-0 bg-black/60 duration-100 fixed inset-0 isolate z-[59]'

export const dialogPanelClass =
  'bg-panel text-ink data-enter:animate-in data-leave:animate-out data-leave:fade-out-0 data-enter:fade-in-0 data-leave:zoom-out-95 data-enter:zoom-in-95 grid max-w-[calc(100%-2rem)] gap-0 rounded-none border border-border p-0 text-sm shadow-lg duration-100 fixed top-1/2 left-1/2 z-[60] w-full -translate-x-1/2 -translate-y-1/2 outline-none'

/** Upstream renders its close control as `<Button variant="ghost" size="icon-sm"
 *  className="cn-dialog-close">`; compose the same tokens here. */
export const dialogCloseButtonClass =
  'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*=\'size-\'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg absolute top-2 right-2'

export const dialogTitleClass = 'text-base leading-none font-medium font-heading'

export const dialogDescriptionClass = 'text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3'

export const dialogHeaderClass = 'gap-2 flex flex-col'

export const dialogFooterClass =
  'flex flex-col-reverse gap-2 border-t border-border p-0 sm:flex-row sm:justify-end'

// These abstract away element types, base classes, and attribute spreading.
// Use inside `styledViewInputs` content callbacks:
//
//   content: (render, h) => [
//     Dialog.header({}, [
//       Dialog.title({ attributes: render.title }, ['Title'], h),
//       Dialog.description({ attributes: render.description }, ['Subtitle'], h),
//     ], h),
//     Dialog.footer({}, [button(...)], h),
//   ]
//
// Every builder follows one shape: `(config, children, h)`. Attribute
// bundles handed to you by `styledViewInputs` go in `config.attributes`.

type StyleConfig<M> = Readonly<{
  className?: string
  /** Submodel-provided attributes (from the `styledViewInputs` content
   *  callback render bundle) to merge onto the element. */
  attributes?: ReadonlyArray<Attribute<M> | ChildAttribute>
}>

/** Dialog header wrapper. */
export const header = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.div(
    [h.DataAttribute('slot', 'dialog-header'), h.Class(cn(dialogHeaderClass, config.className))],
    children,
  )

/** Dialog title — merges with the submodel's title attributes. */
export const title = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.h2(
    [
      ...(config.attributes ?? []),
      h.DataAttribute('slot', 'dialog-title'),
      h.Class(cn(dialogTitleClass, config.className)),
    ],
    children,
  )

/** Dialog description — merges with the submodel's description attributes. */
export const description = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.p(
    [
      ...(config.attributes ?? []),
      h.DataAttribute('slot', 'dialog-description'),
      h.Class(cn(dialogDescriptionClass, config.className)),
    ],
    children,
  )

/** Dialog footer wrapper. */
export const footer = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.div(
    [h.DataAttribute('slot', 'dialog-footer'), h.Class(cn(dialogFooterClass, config.className))],
    children,
  )

/** Close button — merges with the submodel's closeButton attributes. */
export const closeButton = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.button(
    [
      ...(config.attributes ?? []),
      h.DataAttribute('slot', 'dialog-close'),
      h.Class(cn(dialogCloseButtonClass, config.className)),
    ],
    children,
  )

export type DialogContent<M> = Readonly<{
  closeButton: ReadonlyArray<Attribute<M> | ChildAttribute>
  title: ReadonlyArray<Attribute<M> | ChildAttribute>
  description: ReadonlyArray<Attribute<M> | ChildAttribute>
}>

export type StyledViewInputs<M> = Readonly<{
  /** Panel content. Receives the close-button, title and description
   *  attribute bundles to spread onto your own elements, or pass to
   *  Dialog.title / Dialog.description / Dialog.closeButton helpers via
   *  their `attributes` config field. */
  content: (render: DialogContent<M>, h: HtmlBuilder<M>) => ReadonlyArray<Child>
  className?: string
  backdropClass?: string
  panelClass?: string
}>

/** Build styled `Dialog.ViewInputs`. Pass your view's `h` so the content
 *  callback can dispatch your app's own messages (e.g. a destructive
 *  action button next to the dialog's `closeButton`). */
export const styledViewInputs = <M>(
  viewInputs: StyledViewInputs<M>,
  h: HtmlBuilder<M>,
): FoldkitDialog.ViewInputs => ({
  toView: ({ dialog, backdrop, panel, closeButton, title, description, isVisible }) =>
    h.dialog(
      [
        ...dialog,
        h.DataAttribute('slot', 'dialog'),
        h.Class(cn(dialogClass, viewInputs.className)),
      ],
      isVisible
        ? [
            h.div([
              ...backdrop,
              h.DataAttribute('slot', 'dialog-overlay'),
              h.Class(cn(dialogBackdropClass, viewInputs.backdropClass)),
            ]),
            h.div(
              [
                ...panel,
                h.DataAttribute('slot', 'dialog-content'),
                h.Class(cn(dialogPanelClass, viewInputs.panelClass)),
              ],
              viewInputs.content({ closeButton, title, description }, h),
            ),
          ]
        : [],
    ),
})

