import { Schema as S } from 'effect'
import { Idle, OfflinePhase } from './machine'
import type { LutId } from '@lutra/engine'

// The root's offline slice (CONTEXT.md "Offline library"): the fill
// machine's state plus the counters the main menu's progress card and the
// "Offline ready" toast read. Owned by the root because it spans both
// Submodels — the card floats bottom-right on the main menu, the per-LUT
// download states reach the editor's LUT bar through the root's delegation.

// ---- per-LUT download states (the LUT bar's rows) ----

/** A cube file's mirroring state: being fetched, or in the cache. Absence
 *  means "not downloaded" — the offline LUT bar dims those entries. */
export const DownloadState = S.Union([S.Literal('fetching'), S.Literal('downloaded')])
export type DownloadState = typeof DownloadState.Type

/** The editor's per-LUT download state map: lutId → state. */
export const LutDownloads = S.Record(S.String, DownloadState)
export type LutDownloads = Readonly<Record<string, DownloadState>>

export type LutDownloadState = DownloadState | 'not-downloaded'
/** The bar's lookup: a missing entry reads as "not downloaded". */
export const stateFor = (downloads: LutDownloads, lutId: LutId): LutDownloadState =>
  downloads[lutId] ?? 'not-downloaded'

// The root's offline slice (CONTEXT.md "Offline library"): the fill
// machine's state plus the counters the main menu's progress card and the
// "Offline ready" toast read. Owned by the root because it spans both
// Submodels — the card floats bottom-right on the main menu, the per-LUT
// download states reach the editor's LUT bar through the root's delegation.

export const Offline = S.Struct({
  // The fill's lifecycle (./machine.ts): Idle | Filling | Paused | Ready |
  // QuotaError. Idle also covers a library already complete from a previous
  // session — a run with nothing missing emits no events and never leaves
  // Idle, so a full cache boots silently.
  phase: OfflinePhase,
  // The browser's online state — drives the machine's Paused transition and
  // is forwarded to the editor (the LUT bar dims undownloaded entries while
  // offline).
  online: S.Boolean,
  // The device asked for reduced data usage (navigator.connection.saveData):
  // the fill does not auto-start, the strip shows a manual start button.
  saveData: S.Boolean,
  // Files mirrored so far this run (done from the run's start + completions).
  downloaded: S.Number,
  // The full library size (catalog + cubes + thumbnails) of the current run.
  total: S.Number,
  // The last navigator.storage.persist() result (null before the first
  // request) — future Options-screen fuel, and the quota retry's gate.
  persisted: S.NullOr(S.Boolean),
  // True while the "Offline ready" toast is showing (set on the Filling →
  // Ready transition; cleared by click or the auto-dismiss timer).
  readyToast: S.Boolean,
})
export type Offline = typeof Offline.Type

/** The offline slice at boot. Reads the browser's connectivity/saveData
 *  signals; both degrade to the non-offline posture when absent. */
export const initialOffline = (): Offline => {
  // oxlint-disable-next-line consistent-type-assertions
  const connection = (navigator as Navigator & { connection?: { readonly saveData?: boolean } })
    .connection
  return {
    phase: Idle(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    saveData: typeof navigator === 'undefined' ? false : connection?.saveData === true,
    downloaded: 0,
    total: 0,
    persisted: null,
    readyToast: false,
  }
}
