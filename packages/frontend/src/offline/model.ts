import { Schema as S } from 'effect'
import { Idle, OfflinePhase } from './machine'
import type { LutId } from '@lutra/engine'


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

export const Offline = S.Struct({
  phase: OfflinePhase,
  // offline).
  online: S.Boolean,
  saveData: S.Boolean,
  downloaded: S.Number,
  total: S.Number,
  persisted: S.NullOr(S.Boolean),
  readyToast: S.Boolean,
})
export type Offline = typeof Offline.Type

/** The offline slice at boot. Reads the browser's connectivity/saveData
 *  signals; both degrade to the non-offline posture when absent. */
export const initialOffline = (): Offline => {
  const { connection } = navigator as Navigator & { connection?: { readonly saveData?: boolean } }
  return {
    downloaded: 0,
    online: globalThis.navigator === undefined ? true : navigator.onLine,
    persisted: null,
    phase: Idle(),
    readyToast: false,
    saveData: globalThis.navigator === undefined ? false : connection?.saveData === true,
    total: 0,
  }
}
