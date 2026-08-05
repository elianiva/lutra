import { describe, it, expect as vitestExpect } from 'vitest'
import { Command, Mount, click, expect, given, scene, selector, text } from 'foldkit/scene'
import { Dialog } from '@foldkit/ui'
import { MockImageBitmap } from '../vitest-setup'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { RenderHandle } from '../gpu/backend'
import { EncodeError } from '@lutra/engine'
import {
  SnapshotForExport,
  PrepareExport,
  ExportDownload,
  RevokeExportUrl,
  SaveExportSettings,
} from './command'
import {
  ExportSnapshotted,
  ExportPrepared,
  ExportEncodeFailed,
  ExportDownloaded,
  ExportUrlRevoked,
  ExportSettingsSaved,
  ScaledCanvas,
  CanvasRegistered,
  ExportRequested as ExportRequestedMessage,
  ExportDownloadRequested as ExportDownloadRequestedMessage,
  GotExportDialogMessage,
} from './message'

// ---- Scene test config ----

const config = {
  update,
  view,
} as const

/** A model with a rendered frame — the precondition for the export dialog. */
const loadedModel = () => ({
  ...initialModel(),
  phase: Idle(),
  source: { bitmap: new MockImageBitmap(200, 150), width: 200, height: 150, error: null },
  renderedStamp: 1,
  // oxlint-disable-next-line consistent-type-assertions
  lastRender: new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, map: null }),
})

/** A 200×150 export frame, as the snapshot readback produces it. */
const exportImage = new ImageData(200, 150)

const mountLoadedStage = [
  Mount.resolve(PanZoom, ScaledCanvas({ scale: 1, offsetX: 0, offsetY: 0 })),
  Mount.resolve(RegisterCanvas, CanvasRegistered()),
]

// Resolve the dialog's internal ShowDialog command.
const openDialog = [
  Command.expectHas(Dialog.ShowDialog),
  Command.resolve(Dialog.ShowDialog, Dialog.CompletedShowDialog()),
]

// ---- Tests ----

describe('Export dialog', () => {
  it('opens on ExportRequested and snapshots the frame — encoding waits for Export', () => {
    scene(
      config,
      given(loadedModel()),
      ...mountLoadedStage,

      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      // The dialog shows the format/resolution controls and the filename.
      expect(text('EXPORT')).toExist(),
      expect(text('PNG', { exact: false })).toExist(),
      expect(text('JPEG')).toExist(),
      expect(text('WEBP')).toExist(),
      expect(text('AVIF')).toExist(),
      expect(text('100%')).toExist(),
      Command.expectHas(SnapshotForExport),

      // The snapshot lands and is cached — no encode yet.
      Command.resolve(
        SnapshotForExport,
        ExportSnapshotted({ image: exportImage }),
      ),
      Command.expectNone(),

      // Pressing Export starts the encode and shows the loading state.
      click(text('Export')),
      expect(text('Encoding…')).toExist(),
      Command.expectHas(PrepareExport),

      // The encode completes; the download fires and the size appears.
      Command.resolve(
        PrepareExport,
        ExportPrepared({ sizeBytes: 4096, url: 'blob:export-1' }),
      ),
      Command.expectHas(ExportDownload),
      Command.resolve(ExportDownload, ExportDownloaded({ url: 'blob:export-1' })),
      expect(text('Downloaded', { exact: false })).toExist(),
      expect(text('4.0 KB', { exact: false })).toExist(),
      // The dialog stays open after a download — tweak and re-export.
      expect(text('EXPORT')).toExist(),
      Command.expectNone(),
    )
  })

  it('marks the selected format and scale with the filled indicator', () => {
    // Regression: foldkit's builder keeps only the last Class attribute on
    // an element — stacked Class calls silently dropped the selection fill.
    scene(
      config,
      given(loadedModel()),
      ...mountLoadedStage,
      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      Command.resolve(SnapshotForExport, ExportSnapshotted({ image: exportImage })),
      // PNG and 100% are the persisted defaults; their cells are filled.
      expect(text('PNG')).toHaveClass('bg-accent'),
      expect(text('100%')).toHaveClass('bg-accent'),
      expect(text('JPEG')).not.toHaveClass('bg-accent'),
      expect(text('50%')).not.toHaveClass('bg-accent'),
      // The pressed state is exposed to assistive tech.
      expect(text('PNG')).toHaveAttr('aria-pressed', 'true'),
      expect(text('JPEG')).toHaveAttr('aria-pressed', 'false'),

      // Switching moves the fill along with the selection.
      click(text('JPEG')),
      expect(text('JPEG')).toHaveClass('bg-accent'),
      expect(text('PNG')).not.toHaveClass('bg-accent'),
      Command.resolve(SaveExportSettings, ExportSettingsSaved()),
      click(text('50%')),
      expect(text('50%')).toHaveClass('bg-accent'),
      expect(text('100%')).not.toHaveClass('bg-accent'),
      Command.resolve(SaveExportSettings, ExportSettingsSaved()),
      Command.expectNone(),
    )
  })

  it('settings changes only persist — no encode until Export is pressed again', () => {
    scene(
      config,
      given(loadedModel()),
      ...mountLoadedStage,
      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      Command.resolve(
        SnapshotForExport,
        ExportSnapshotted({ image: exportImage }),
      ),
      // PNG: no quality knob.
      expect(text('Quality')).not.toExist(),

      // Switch to JPEG — quality slider appears at the default 75; the
      // change is persisted, not encoded.
      click(text('JPEG')),
      expect(text('Quality')).toExist(),
      expect(text('75')).toExist(),
      Command.expectHas(SaveExportSettings),
      Command.resolve(SaveExportSettings, ExportSettingsSaved()),
      Command.expectNone(),

      // Scale down to 50% — dims shown; again no encode.
      click(text('50%')),
      expect(text('200 × 150 → 100 × 75')).toExist(),
      Command.resolve(SaveExportSettings, ExportSettingsSaved()),
      Command.expectNone(),

      // The pressed settings (JPEG, 50%) are what the export encodes.
      click(text('Export')),
      Command.resolve(
        PrepareExport,
        ExportPrepared({ sizeBytes: 1024, url: 'blob:export-1' }),
      ),
      Command.resolve(ExportDownload, ExportDownloaded({ url: 'blob:export-1' })),
      expect(text('1.0 KB', { exact: false })).toExist(),
      Command.expectNone(),
    )
  })

  it('shows an encode failure and allows retrying', () => {
    scene(
      config,
      given(loadedModel()),
      ...mountLoadedStage,
      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      Command.resolve(
        SnapshotForExport,
        ExportSnapshotted({ image: exportImage }),
      ),
      click(text('Export')),
      Command.resolve(
        PrepareExport,
        ExportEncodeFailed({ error: new EncodeError({ message: 'encode exploded' }) }),
      ),
      expect(text('encode exploded')).toExist(),

      // The button is back to Export and can retry.
      click(text('Export')),
      Command.resolve(
        PrepareExport,
        ExportPrepared({ sizeBytes: 2048, url: 'blob:export-2' }),
      ),
      Command.resolve(ExportDownload, ExportDownloaded({ url: 'blob:export-2' })),
      expect(text('2.0 KB', { exact: false })).toExist(),
      Command.expectNone(),
    )
  })

  it('closes, revoking the blob URL and dropping the cached frame', () => {
    scene(
      config,
      given(loadedModel()),
      ...mountLoadedStage,
      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      Command.resolve(
        SnapshotForExport,
        ExportSnapshotted({ image: exportImage }),
      ),
      click(text('Export')),
      Command.resolve(
        PrepareExport,
        ExportPrepared({ sizeBytes: 4096, url: 'blob:export-1' }),
      ),
      Command.resolve(ExportDownload, ExportDownloaded({ url: 'blob:export-1' })),

      click(text('Cancel')),
      Command.expectHas(Dialog.CloseDialog),
      Command.resolve(Dialog.CloseDialog, Dialog.CompletedCloseDialog()),
      // Close cleanup: the cached frame is dropped and the URL revoked.
      Command.expectHas(RevokeExportUrl),
      Command.resolve(RevokeExportUrl, ExportUrlRevoked()),
      expect(text('EXPORT')).not.toExist(),
      Command.expectNone(),
    )
  })

  it('does nothing when there is no rendered frame', () => {
    scene(
      config,
      given(initialModel()),
      // Without an image the export button is disabled — no dialog, no
      // snapshot command.
      expect(selector('[aria-label^="Export"]')).toBeDisabled(),
      expect(text('EXPORT')).not.toExist(),
      Command.expectNone(),
    )
  })

  it('drops a snapshot that lands after the dialog closed', () => {
    // A pure update-level race test: the scene framework serializes
    // commands, but the readback can genuinely outlive a Cancel click.
    // Open, close (bypassing the dialog's own commands), then deliver the
    // snapshot — nothing may encode or retain a blob URL.
    let [model] = update(loadedModel(), ExportRequestedMessage())
    ;[model] = update(
      model,
      GotExportDialogMessage({ message: Dialog.RequestedClose() }),
    )
    ;[model] = update(
      model,
      GotExportDialogMessage({ message: Dialog.CompletedCloseDialog() }),
    )
    vitestExpect(model.exportDialog.isOpen).toBe(false)

    const [after, commands] = update(model, ExportSnapshotted({ image: exportImage }))
    vitestExpect(after.exportImage).toBeNull()
    vitestExpect(commands).toHaveLength(0)
  })

  it('revokes an encode that completes after the dialog closed — no download', () => {
    // The Export button blocks double-presses while encoding, but the dialog
    // can close mid-encode. A late result must not trigger a download.
    let [model] = update(loadedModel(), ExportRequestedMessage())
    ;[model] = update(model, ExportSnapshotted({ image: exportImage }))
    ;[model] = update(model, ExportDownloadRequestedMessage())
    vitestExpect(model.exportEncoding).toBe(true)

    // Close while the encode is in flight.
    ;[model] = update(
      model,
      GotExportDialogMessage({ message: Dialog.RequestedClose() }),
    )
    ;[model] = update(
      model,
      GotExportDialogMessage({ message: Dialog.CompletedCloseDialog() }),
    )

    const [after, commands] = update(model, ExportPrepared({ sizeBytes: 100, url: 'blob:late' }))
    vitestExpect(after.exportEncoding).toBe(false)
    vitestExpect(commands.map((c) => c.name)).toEqual(['RevokeExportUrl'])
    vitestExpect(after.exportUrl).toBeNull()
  })
})
