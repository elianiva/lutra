import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Dialog from '@/components/ui/dialog'

type Child = Html | string

/** Lutra modal backdrop — matches the pre-foldcn export/settings dialogs. */
export const lutraBackdropClass = 'fixed inset-0 z-[59] bg-black/60'

/** Standard Lutra panel (export, settings). */
export const lutraPanelClass =
  'fixed left-1/2 top-1/2 z-[60] w-[min(420px,calc(100vw-2rem))] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-panel shadow-lg rounded-none'

/** Narrow confirm panel (delete photo). */
export const lutraNarrowPanelClass =
  'fixed left-1/2 top-1/2 z-[60] w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-border bg-panel shadow-lg rounded-none'

export const lutraDialogTitleClass = 'text-sm font-semibold tracking-[0.14em]'

export const lutraDialogFooterClass =
  'flex justify-end gap-2 border-t border-border px-4 py-3'

export const lutraDialogSectionClass = 'flex flex-col gap-4 px-4 py-4'

/** foldcn Dialog `styledViewInputs` with Lutra chrome. */
export const lutraDialogViewInputs = <M>(
  config: Readonly<{
    panelClass?: string
    content: (render: Dialog.DialogContent<M>, h: HtmlBuilder<M>) => ReadonlyArray<Child>
  }>,
  h: HtmlBuilder<M>,
) =>
  Dialog.styledViewInputs(
    {
      backdropClass: lutraBackdropClass,
      panelClass: config.panelClass ?? lutraPanelClass,
      content: config.content,
    },
    h,
  )
