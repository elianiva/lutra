/** Stateful submodel — import the whole module as a namespace and wire its
 *  Model/Message/init/update into your app:
 *  `import * as AlertDialog from '@/components/ui/alert-dialog'`
 */
import { Dialog as FoldkitDialog } from '@foldkit/ui'
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from 'foldkit/html'

type Child = Html | string

import { cn } from '@/lib/utils'

// Re-export the @foldkit/ui Dialog submodel surface. An alert dialog is a
// Dialog variant: same headless behavior, destructive-confirm styling.
//
// foldcn gaps vs upstream: no Media part slot wiring in styledViewInputs
// (use AlertDialog.media inside content), and Action/Cancel compose Button
// tokens instead of rendering the Button component.

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

/** foldkit delta: host <dialog> element chrome (upstream Root renders
 *  nothing). See dialog.ts. */
export const alertDialogClass = 'bg-transparent p-0 open:flex items-center justify-center'

export const alertDialogBackdropClass =
  'data-enter:animate-in data-leave:animate-out data-leave:fade-out-0 data-enter:fade-in-0 bg-black/60 duration-100 fixed inset-0 isolate z-[59]'

export const alertDialogPanelClass =
  'data-enter:animate-in data-leave:animate-out data-leave:fade-out-0 data-enter:fade-in-0 data-leave:zoom-out-95 data-enter:zoom-in-95 bg-panel text-ink gap-0 rounded-none border border-border p-0 shadow-lg duration-100 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm group/alert-dialog-content fixed top-1/2 left-1/2 z-[60] grid w-full -translate-x-1/2 -translate-y-1/2 outline-none'

export const alertDialogMediaClass = 'bg-muted mb-2 inline-flex size-10 items-center justify-center rounded-md sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*=\'size-\'])]:size-6'

export const alertDialogTitleClass = 'text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2 font-heading'

export const alertDialogDescriptionClass = 'text-muted-foreground *:[a]:hover:text-foreground text-sm text-balance md:text-pretty *:[a]:underline *:[a]:underline-offset-3'

export const alertDialogHeaderClass = 'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]'

export const alertDialogFooterClass =
  'flex flex-col-reverse gap-2 border-t border-border p-0 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end'

/** Upstream renders Cancel via `<Button variant="outline" size="default">`. */
export const alertDialogCancelClass =
  'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*=\'size-\'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2'

/** Upstream renders Action via `<Button>` (default variant). */
export const alertDialogActionClass =
  'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*=\'size-\'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2'

/** foldcn extra (upstream alert-dialog has no close X): ghost icon button,
 *  kept for backward compatibility with the closeButton helper. */
export const alertDialogCloseButtonClass =
  'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*=\'size-\'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg'

type StyleConfig<M> = Readonly<{
  className?: string
  /** Submodel-provided attributes (from the `styledViewInputs` content
   *  callback render bundle) to merge onto the element. */
  attributes?: ReadonlyArray<Attribute<M> | ChildAttribute>
}>

/** Alert dialog header wrapper. */
export const header = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.div(
    [
      h.DataAttribute('slot', 'alert-dialog-header'),
      h.Class(cn(alertDialogHeaderClass, config.className)),
    ],
    children,
  )

/** Media slot — icon/media area above the title (upstream AlertDialogMedia). */
export const media = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.div(
    [
      h.DataAttribute('slot', 'alert-dialog-media'),
      h.Class(cn(alertDialogMediaClass, config.className)),
    ],
    children,
  )

/** Alert dialog title — merges with the submodel's title attributes. */
export const title = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.h2(
    [
      ...(config.attributes ?? []),
      h.DataAttribute('slot', 'alert-dialog-title'),
      h.Class(cn(alertDialogTitleClass, config.className)),
    ],
    children,
  )

/** Alert dialog description — merges with the submodel's description attributes. */
export const description = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.p(
    [
      ...(config.attributes ?? []),
      h.DataAttribute('slot', 'alert-dialog-description'),
      h.Class(cn(alertDialogDescriptionClass, config.className)),
    ],
    children,
  )

/** Alert dialog footer wrapper. */
export const footer = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.div(
    [
      h.DataAttribute('slot', 'alert-dialog-footer'),
      h.Class(cn(alertDialogFooterClass, config.className)),
    ],
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
      h.DataAttribute('slot', 'alert-dialog-close'),
      h.Class(cn(alertDialogCloseButtonClass, config.className)),
    ],
    children,
  )

/** Destructive action button. Pass the submodel's `closeButton` attributes
 *  via `attributes` so a confirm also dismisses the dialog. */
export const actionButton = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.button(
    [
      ...(config.attributes ?? []),
      h.DataAttribute('slot', 'alert-dialog-action'),
      h.Class(cn(alertDialogActionClass, config.className)),
    ],
    children,
  )

/** Secondary cancel button. */
export const cancelButton = <M>(
  config: StyleConfig<M>,
  children: ReadonlyArray<Child>,
  h: HtmlBuilder<M>,
): Html =>
  h.button(
    [
      ...(config.attributes ?? []),
      h.DataAttribute('slot', 'alert-dialog-cancel'),
      h.Class(cn(alertDialogCancelClass, config.className)),
    ],
    children,
  )

export type AlertDialogContent<M> = Readonly<{
  closeButton: ReadonlyArray<Attribute<M> | ChildAttribute>
  title: ReadonlyArray<Attribute<M> | ChildAttribute>
  description: ReadonlyArray<Attribute<M> | ChildAttribute>
}>

export type StyledViewInputs<M> = Readonly<{
  content: (render: AlertDialogContent<M>, h: HtmlBuilder<M>) => ReadonlyArray<Child>
  className?: string
  backdropClass?: string
  panelClass?: string
  /** Upstream Content `size` prop ("default" | "sm"); keys the panel token's
   *  max-width variants via data-size. */
  size?: 'default' | 'sm'
}>

/** Build styled `Dialog.ViewInputs` for an alert dialog. Pass your view's `h`
 *  so the content callback can dispatch your own messages. */
export const styledViewInputs = <M>(
  viewInputs: StyledViewInputs<M>,
  h: HtmlBuilder<M>,
): FoldkitDialog.ViewInputs => ({
  toView: ({ dialog, backdrop, panel, closeButton, title, description, isVisible }) =>
    h.dialog(
      [
        ...dialog,
        h.DataAttribute('slot', 'alert-dialog'),
        h.Class(cn(alertDialogClass, viewInputs.className)),
      ],
      isVisible
        ? [
            h.div([
              ...backdrop,
              h.DataAttribute('slot', 'alert-dialog-overlay'),
              h.Class(cn(alertDialogBackdropClass, viewInputs.backdropClass)),
            ]),
            h.div(
              [
                ...panel,
                h.DataAttribute('slot', 'alert-dialog-content'),
                h.DataAttribute('size', viewInputs.size ?? 'default'),
                h.Class(cn(alertDialogPanelClass, viewInputs.panelClass)),
              ],
              viewInputs.content({ closeButton, title, description }, h),
            ),
          ]
        : [],
    ),
})

