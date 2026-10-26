import { Effect, Schema } from 'effect'

/**
 * The app's appearance mode (docs/adr/0013-materials). A single attribute on
 * the document root — `data-mode` — switches every surface: the token set in
 * styles.css resolves differently, and nothing else knows about the mode.
 *
 * Light is the default: the chrome-and-white side of the Leica palette. Dark
 * (vulcanite black) is one toggle away for judging in a dim room. The choice
 * persists per browser.
 */
export const Mode = Schema.Literals(['dark', 'light'])
export type Mode = typeof Mode.Type

const MODE_KEY = 'lutra-mode'

/** The persisted mode, read once at boot. Anything unknown falls back to light. */
export const readMode = (): Mode => {
  try {
    const stored = globalThis.localStorage?.getItem(MODE_KEY)
    return stored === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Paint the mode. Idempotent — safe to call on every change. */
export const applyMode = (mode: Mode): void => {
  document.documentElement.dataset['mode'] = mode
  document.documentElement.style.setProperty('color-scheme', mode)
}

/** What `ToggledMode` runs: paint the mode, then remember it. */
export const persistMode = (mode: Mode) =>
  Effect.sync(() => {
    applyMode(mode)
    try {
      globalThis.localStorage?.setItem(MODE_KEY, mode)
    } catch {
      // A blocked store only costs the preference — the mode still applies.
    }
  })
