import type { Html, HtmlBuilder } from 'foldkit/html'
import { Check, CopyPlus, Download, Eclipse, Sun } from 'lucide'
import { icon } from '../components/icon'
import { EditorMessage } from './message'
import type { Model } from './model'

/**
 * The editor's top bar (docs/adr/0013-materials). It draws no rule and owns no
 * background: the wordmark, the document line, the appearance toggle and the
 * actions float over the canvas tone, separated from the work area by space
 * alone.
 *
 * The mode toggle is the only control here that changes the whole app; it
 * sits next to the save actions because both are "how the session is set up"
 * rather than "what the photo looks like".
 */
export const topBar = (
  h: HtmlBuilder<EditorMessage>,
  saveStatus: Model['saveStatus'],
  attachedEdit: Model['attachedEdit'],
  mode: Model['mode'],
  hasImage: boolean,
): Html => {
  const saving = saveStatus._tag === 'saving'
  const attachedId = attachedEdit?.id ?? null
  return h.header(
    [
      h.Class(
        'pointer-events-none absolute inset-x-0 top-0 z-20 flex h-16 items-center gap-6 px-6',
      ),
    ],
    [
      h.h1([h.Class('flex-none text-xs font-semibold tracking-[0.34em] text-accent')], ['LUTRA']),
      documentLine(h, attachedEdit),
      h.div(
        [h.Class('pointer-events-auto ml-auto flex items-center gap-3')],
        [
          modeToggle(h, mode),
          h.div(
            [h.Class('surface flex h-10 items-center gap-0.5 p-1')],
            [
              saveStatusText(h, saveStatus),
              textButton(h, 'Save as', CopyPlus, EditorMessage.SaveAsRequested(), {
                isDisabled: !hasImage || saving || attachedId === null,
                iconOnlyOnSmall: true,
                hideOnSmall: true,
              }),
              iconButton(h, 'Export image', Download, EditorMessage.ExportRequested(), {
                isDisabled: !hasImage,
              }),
              textButton(h, 'Save', Check, EditorMessage.SaveRequested(), {
                isDisabled: !hasImage || saving,
                primary: true,
                label: saving ? 'Saving…' : 'Save',
              }),
            ],
          ),
        ],
      ),
    ],
  )
}

/** The document line: the edit being worked on, never invented metadata. */
const documentLine = (h: HtmlBuilder<EditorMessage>, attachedEdit: Model['attachedEdit']) =>
  h.div(
    [h.Class('micro tnum hidden items-center gap-3 font-mono md:flex')],
    [
      h.span([], [attachedEdit?.id == null ? 'New edit' : `Edit ${attachedEdit.id.slice(0, 8)}`]),
      h.span([h.Class('opacity-60')], ['sRGB']),
    ],
  )

const modeToggle = (h: HtmlBuilder<EditorMessage>, mode: Model['mode']): Html => {
  const segment = (target: 'dark' | 'light', label: string, Icon: typeof Sun) => {
    const active = mode === target
    return h.button(
      [
        h.Class(
          `grid h-8 w-10 place-items-center rounded-full transition-colors ${
            active ? 'bg-accent-soft text-accent' : 'text-dim hover:text-ink'
          }`,
        ),
        h.OnClick(EditorMessage.ToggledMode()),
        h.AriaLabel(`${label} appearance`),
        h.AriaPressed(String(active)),
        h.Title(`${label} appearance`),
      ],
      [icon(h, Icon, label, 16)],
    )
  }
  return h.div(
    [h.Class('surface flex h-10 items-center gap-0.5 p-1'), h.AriaLabel('Appearance')],
    [segment('dark', 'Dark', Eclipse), segment('light', 'Light', Sun)],
  )
}

type ActionConfig = Readonly<{
  isDisabled: boolean
  primary?: boolean
  label?: string
  iconOnlyOnSmall?: boolean
  hideOnSmall?: boolean
}>

const baseActionClass = (disabled: boolean) =>
  `flex h-8 items-center gap-2 rounded-full px-3 text-[10px] uppercase tracking-[0.1em] transition-colors ${
    disabled ? 'opacity-30' : 'hover:bg-s2 hover:text-ink'
  }`

const textButton = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  Icon: typeof Check,
  onClick: EditorMessage,
  config: ActionConfig,
): Html =>
  h.button(
    [
      h.Class(
        `${config.hideOnSmall ? 'hidden sm:flex' : 'flex'} ${
          config.primary
            ? `key h-8 items-center gap-2 rounded-full bg-accent px-4 text-[10px] uppercase tracking-[0.1em] text-accent-ink ${
                config.isDisabled ? 'pointer-events-none opacity-40' : ''
              }`
            : `${baseActionClass(config.isDisabled)} ${config.isDisabled ? '' : 'text-muted'}`
        }`,
      ),
      h.OnClick(onClick),
      ...(config.isDisabled ? [h.Disabled(true)] : []),
      h.AriaLabel(label === 'Save' ? 'Save edit' : 'Save as a new edit'),
    ],
    [
      icon(h, Icon, label, 14),
      config.iconOnlyOnSmall
        ? h.span([h.Class('hidden sm:inline')], [config.label ?? label])
        : (config.label ?? label),
    ],
  )

const iconButton = (
  h: HtmlBuilder<EditorMessage>,
  label: string,
  Icon: typeof Download,
  onClick: EditorMessage,
  config: ActionConfig,
): Html =>
  h.button(
    [
      h.Class(
        `grid h-8 w-8 place-items-center rounded-full transition-colors ${
          config.isDisabled ? 'opacity-30' : 'text-muted hover:bg-s2 hover:text-ink'
        }`,
      ),
      h.OnClick(onClick),
      ...(config.isDisabled ? [h.Disabled(true)] : []),
      h.AriaLabel(label),
      h.Title(label),
    ],
    [icon(h, Icon, label, 16)],
  )

/**
 * The save flow's status: the last save's time, or the last failure's reason.
 * Rendered inline before the actions so it never reflows the buttons.
 */
const saveStatusText = (h: HtmlBuilder<EditorMessage>, saveStatus: Model['saveStatus']) => {
  if (saveStatus._tag === 'saved') {
    return h.span(
      [h.Class('hidden px-2 text-[10px] text-dim sm:inline')],
      [
        `Saved ${new Date(saveStatus.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      ],
    )
  }
  if (saveStatus._tag === 'failed') {
    return h.span(
      [h.Class('hidden px-2 text-[10px] text-accent sm:inline'), h.Title(saveStatus.error.message)],
      ['Save failed'],
    )
  }
  return null
}
