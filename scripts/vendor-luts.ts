// Vendors the Film-Luts mirror into `packages/frontend/public/luts/` as a
// plain committed copy (see docs/adr/0002-lut-library.md).
//
// Usage: bun scripts/vendor-luts.ts
// Refresh: bump PINNED_COMMIT (git rev-parse HEAD of the upstream repo),
// re-run, and commit the result.
//
// The script fetches the pinned tarball from GitHub, extracts it, copies
// `luts/`, `thumbnails/`, `film_luts.json`, and the upstream LICENSE into
// `packages/frontend/public/luts/`, writes a README + NOTICE, and verifies
// that every catalog entry resolves to a real file.

import { $ } from 'bun'
import { access, cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PINNED_COMMIT = 'af957b631a304e6be94778b96cb3395de3438e9f'
const REPO = 'YahiaAngelo/Film-Luts'
const OUT = 'packages/frontend/public/luts'
const TARBALL = `https://github.com/${REPO}/archive/${PINNED_COMMIT}.tar.gz`

const fail = (message: string): never => {
  process.stderr.write(`[vendor-luts] ${message}\n`)
  process.exit(1)
}

const main = async (): Promise<void> => {
  const cwd = process.cwd()
  const exists = async (path: string): Promise<void> => await access(join(cwd, path))
  try {
    await exists('package.json')
    await exists('packages/frontend')
  } catch {
    fail('run from the repo root')
  }

  const tmpDir = await mkdtemp(join(tmpdir(), 'film-luts-'))
  const tarballPath = join(tmpDir, 'film-luts.tar.gz')
  const extracted = join(tmpDir, 'extracted')

  try {
    process.stdout.write(`[vendor-luts] fetching ${REPO} @ ${PINNED_COMMIT.slice(0, 12)}\n`)
    const res = await fetch(TARBALL)
    if (!res.ok) {
      fail(`tarball fetch failed: ${res.status} ${res.statusText}`)
    }
    await Bun.write(tarballPath, res)

    process.stdout.write('[vendor-luts] extracting\n')
    await mkdir(extracted, { recursive: true })
    await $`tar -xzf ${tarballPath} -C ${extracted}`

    // GitHub tarballs extract to <repo>-<commit-sha>.
    const entries = await readdir(extracted)
    const srcDir =
      entries.find((e) => e.startsWith('Film-Luts-')) ?? fail('unexpected tarball layout')
    const src = join(extracted, srcDir)

    const expected = ['luts', 'thumbnails', 'film_luts.json', 'LICENSE']
    for (const name of expected) {
      try {
        await access(join(src, name))
      } catch {
        fail(`missing ${name} in upstream tree`)
      }
    }

    process.stdout.write(`[vendor-luts] copying into ${OUT}/\n`)
    await rm(OUT, { force: true, recursive: true })
    await mkdir(OUT, { recursive: true })
    await cp(join(src, 'luts'), join(OUT, 'luts'), { recursive: true })
    await cp(join(src, 'thumbnails'), join(OUT, 'thumbnails'), { recursive: true })
    await cp(join(src, 'film_luts.json'), join(OUT, 'film_luts.json'))
    await cp(join(src, 'LICENSE'), join(OUT, 'LICENSE'))

    await Bun.write(
      join(OUT, 'README.md'),
      `# Vendored LUT library

This directory is a vendored copy of the G'MIC film-emulation LUT collection
from https://github.com/YahiaAngelo/Film-Luts at commit
\`${PINNED_COMMIT}\`, placed here by \`scripts/vendor-luts.ts\`.

- \`film_luts.json\` — the catalog (name, category, lut_file, thumbnail)
- \`luts/\` — 296 \`.cube\` LUTs (13³), the runtime format
- \`thumbnails/\` — picker previews
- \`LICENSE\` — the upstream MIT license (preserved per its terms)
- \`NOTICE\` — attribution and provenance

Refresh: bump the pinned commit in \`scripts/vendor-luts.ts\` and run
\`bun scripts/vendor-luts.ts\`, then commit the result.
`,
    )

    await Bun.write(
      join(OUT, 'NOTICE'),
      `LUT library attribution

The LUT files in this directory originate from the G'MIC film-emulation color
presets (https://gmic.eu), mirrored by YahiaAngelo/Film-Luts
(https://github.com/YahiaAngelo/Film-Luts, MIT License, copyright YahiaAngelo).
The upstream README notes that the LUTs may reference trademarks of their
respective owners (film stock names), used for informational purposes only.

G'MIC (https://gmic.eu) is distributed under the CeCILL free software license.
See the upstream LICENSE file for the mirror's terms.
`,
    )

    const catalog: {
      filmLUTs: { name: string; lut_file: string; thumbnail: string }[]
    } = await Bun.file(join(OUT, 'film_luts.json')).json()
    const luts = catalog.filmLUTs
    let missing = 0
    for (const entry of luts) {
      const ok = await Bun.file(join(OUT, entry.lut_file)).exists()
      const thumbOk = await Bun.file(join(OUT, entry.thumbnail)).exists()
      if (!ok || !thumbOk) {
        process.stderr.write(`[vendor-luts] missing file for "${entry.name}": ${entry.lut_file}\n`)
        missing++
      }
    }
    if (missing > 0) {
      fail(`${missing} catalog entries unresolvable`)
    }

    const size = (await $`du -sh ${OUT}`.quiet().text()).trim()
    process.stdout.write(
      `[vendor-luts] vendored ${luts.length} LUTs into ${OUT}/ (${size}) — done\n`,
    )
  } finally {
    await rm(tmpDir, { force: true, recursive: true })
  }
}

await main()
