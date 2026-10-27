import { Effect, Option, Schema as S } from 'effect'
import { Command, File as FoldkitFile } from 'foldkit'
import { zipSync } from 'fflate'
import { Adjust, Template } from './collage/layout'
import { isImageFile, outputFileName, timestamp, uniqueName } from './format'
import { CollageRatio } from './geometry'
import { Message } from './message'
import { Item, Slot } from './model'
import type { Result } from './model'
import { ImageWorkers } from './pipeline/pool'
import { Settings, extensionFor } from './settings'
import { Mode, persistMode } from './theme'

const ACCEPT = ['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif']

const mimeFor = (format: Settings['format']) => `image/${format}`

/** Trigger a browser download of a blob. The URL lives long enough to start it. */
const saveBlob = (blob: Blob, name: string) =>
  Effect.gen(function* () {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    yield* Effect.sleep('1 second')
    URL.revokeObjectURL(url)
  })

export const PersistMode = Command.define('PersistMode', {
  args: { mode: Mode },
  execute: ({ mode }) => persistMode(mode).pipe(Effect.as(Message.CompletedPersistMode())),
  messages: [Message.CompletedPersistMode],
})

export const PickFiles = Command.define('PickFiles', {
  execute: FoldkitFile.selectMultiple(ACCEPT).pipe(
    Effect.map((files) =>
      files.length === 0 ? Message.PickCancelled() : Message.FilesDropped({ files }),
    ),
  ),
  messages: [Message.PickCancelled, Message.FilesDropped],
})

/** Give each new image an id and a preview URL. Non-images are dropped. */
export const PrepareItems = Command.define('PrepareItems', {
  args: { files: S.Array(S.instanceOf(File)), firstId: S.Number },
  execute: ({ files, firstId }) =>
    Effect.sync(() =>
      Message.ItemsPrepared({
        items: files.filter(isImageFile).map((file, index): Item => ({
          id: firstId + index,
          file,
          sourceUrl: URL.createObjectURL(file),
          status: { _tag: 'Working' },
        })),
      }),
    ),
  messages: [Message.ItemsPrepared],
})

/** Run one photo through the worker pool. */
export const ProcessItem = Command.define('ProcessItem', {
  args: { id: S.Number, file: S.instanceOf(File), settings: Settings },
  execute: ({ id, file, settings }) =>
    Effect.gen(function* () {
      const workers = yield* ImageWorkers
      const output = yield* workers.run({ kind: 'single', file, settings })
      const blob = new Blob([output.bytes], { type: mimeFor(settings.format) })
      const result: Result = {
        blob,
        url: URL.createObjectURL(blob),
        width: output.width,
        height: output.height,
        sourceWidth: output.sourceWidth,
        sourceHeight: output.sourceHeight,
        extension: extensionFor(settings.format),
      }
      return Message.Processed({ id, result })
    }).pipe(
      Effect.catchTag('ProcessError', (error) =>
        Effect.succeed(Message.ProcessFailed({ id, error: error.message })),
      ),
    ),
  messages: [Message.Processed, Message.ProcessFailed],
})

export const RevokeUrls = Command.define('RevokeUrls', {
  args: { urls: S.Array(S.String) },
  execute: ({ urls }) =>
    Effect.sync(() => {
      for (const url of urls) URL.revokeObjectURL(url)
      return Message.CompletedRevoke()
    }),
  messages: [Message.CompletedRevoke],
})

export const ZipEntry = S.Struct({ name: S.String, blob: S.instanceOf(Blob) })

/** Store every output in one uncompressed archive (the images are compressed already). */
export const DownloadZip = Command.define('DownloadZip', {
  args: { entries: S.Array(ZipEntry) },
  execute: ({ entries }) =>
    Effect.gen(function* () {
      const taken = new Set<string>()
      const archive: Record<string, Uint8Array> = {}
      for (const entry of entries) {
        const name = uniqueName(taken, entry.name)
        taken.add(name)
        archive[name] = new Uint8Array(yield* Effect.promise(() => entry.blob.arrayBuffer()))
      }
      const zip = zipSync(archive, { level: 0 })
      yield* saveBlob(
        new Blob([zip], { type: 'application/zip' }),
        `imgutils-${timestamp(new Date())}.zip`,
      )
      return Message.ZipSaved()
    }),
  messages: [Message.ZipSaved],
})

export const outputName = (file: File, result: Result) =>
  outputFileName(file.name, result.extension)

/** Read a photo's oriented size and make its preview URL. */
const prepareSlot = (file: File, key: number): Effect.Effect<Option.Option<Slot>> =>
  Effect.tryPromise(() => createImageBitmap(file, { imageOrientation: 'from-image' })).pipe(
    Effect.map((bitmap) => {
      const slot: Slot = {
        key,
        file,
        url: URL.createObjectURL(file),
        width: bitmap.width,
        height: bitmap.height,
        adjust: { zoom: 1, fx: 0.5, fy: 0.5 },
      }
      bitmap.close()
      return Option.some(slot)
    }),
    Effect.orElseSucceed(() => Option.none()),
  )

export const PickCollageFiles = Command.define('PickCollageFiles', {
  execute: FoldkitFile.selectMultiple(ACCEPT).pipe(
    Effect.map((files) =>
      files.length === 0 ? Message.PickCancelled() : Message.CollageFilesChosen({ files }),
    ),
  ),
  messages: [Message.PickCancelled, Message.CollageFilesChosen],
})

export const PrepareSlots = Command.define('PrepareSlots', {
  args: { files: S.Array(S.instanceOf(File)), firstKey: S.Number },
  execute: ({ files, firstKey }) =>
    Effect.forEach(
      files.filter(isImageFile),
      (file, index) => prepareSlot(file, firstKey + index),
      {
        concurrency: 3,
      },
    ).pipe(
      Effect.map((prepared) => {
        const slots = prepared.flatMap((slot) => (Option.isSome(slot) ? [slot.value] : []))
        return Message.SlotsPrepared({ slots, failed: files.length - slots.length })
      }),
    ),
  messages: [Message.SlotsPrepared],
})

export const ReplaceSlot = Command.define('ReplaceSlot', {
  args: { index: S.Number, key: S.Number },
  execute: ({ index, key }) =>
    Effect.gen(function* () {
      const file = yield* FoldkitFile.select(ACCEPT)
      if (Option.isNone(file)) return Message.PickCancelled()
      const slot = yield* prepareSlot(file.value, key)
      return Message.SlotReplaced({ index, slot: Option.getOrNull(slot) })
    }),
  messages: [Message.PickCancelled, Message.SlotReplaced],
})

/** A Fisher–Yates permutation of `0..count-1`. */
export const ShuffleOrder = Command.define('ShuffleOrder', {
  args: { count: S.Number },
  execute: ({ count }) =>
    Effect.sync(() => {
      const order = Array.from({ length: count }, (_, index) => index)
      for (let index = count - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1))
        const held = order[index] ?? index
        order[index] = order[other] ?? other
        order[other] = held
      }
      return Message.Shuffled({ order })
    }),
  messages: [Message.Shuffled],
})

export const SaveCollage = Command.define('SaveCollage', {
  args: {
    files: S.Array(S.NullOr(S.instanceOf(File))),
    cells: S.Array(Adjust),
    template: Template,
    ratio: CollageRatio,
    gapPercent: S.Number,
    settings: Settings,
  },
  execute: (job) =>
    Effect.gen(function* () {
      const workers = yield* ImageWorkers
      const output = yield* workers.run({ kind: 'collage', ...job })
      const blob = new Blob([output.bytes], { type: mimeFor(job.settings.format) })
      yield* saveBlob(blob, `collage-${timestamp(new Date())}.${extensionFor(job.settings.format)}`)
      return Message.CollageSaved({
        width: output.width,
        height: output.height,
        size: blob.size,
        count: output.count,
      })
    }).pipe(
      Effect.catchTag('ProcessError', (error) =>
        Effect.succeed(Message.CollageSaveFailed({ error: error.message })),
      ),
    ),
  messages: [Message.CollageSaved, Message.CollageSaveFailed],
})
