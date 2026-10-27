/** Human-readable sizes and output file names. */

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

const baseName = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export const outputFileName = (name: string, extension: string): string =>
  `${baseName(name)}.${extension}`

/** `name`, or `name-2`, `name-3`… when an earlier entry already took it. */
export const uniqueName = (taken: ReadonlySet<string>, name: string): string => {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  let index = 2
  while (taken.has(`${stem}-${index}${extension}`)) index += 1
  return `${stem}-${index}${extension}`
}

/** `YYYYMMDD-HHMM` in local time, for archive and collage names. */
export const timestamp = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

export const isImageFile = (file: File): boolean =>
  file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name)
