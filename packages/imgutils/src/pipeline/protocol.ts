import { Schema as S } from 'effect'
import type { Adjust, Template } from '../collage/layout'
import type { CollageRatio } from '../geometry'
import type { Settings } from '../settings'

/** What the main thread posts to an image worker. */
export type Job =
  | Readonly<{ kind: 'single'; file: File; settings: Settings }>
  | Readonly<{
      kind: 'collage'
      files: ReadonlyArray<File | null>
      cells: ReadonlyArray<Adjust>
      template: Template
      ratio: CollageRatio
      gapPercent: number
      settings: Settings
    }>

/** The encoded output. `sourceWidth`/`sourceHeight` are 0 for a collage. */
export type Output = Readonly<{
  bytes: Uint8Array<ArrayBuffer>
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  count: number
}>

/** What a worker posts back. The bytes' buffer is transferred. */
export type Reply = Readonly<{ ok: true; output: Output }> | Readonly<{ ok: false; error: string }>

/** A photo could not be decoded, resized, or encoded. */
export class ProcessError extends S.TaggedError<ProcessError>()('ProcessError', {
  message: S.String,
}) {}
