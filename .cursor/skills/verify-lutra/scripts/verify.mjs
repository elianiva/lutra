#!/usr/bin/env node
// Lutra verification harness.
//
// Launches its OWN isolated Chrome (private profile + debug port + software
// WebGPU flags), drives the real app over the Chrome DevTools Protocol using
// stable ARIA/data handles, captures screenshots + a JSON result, and tears
// down only the Chrome it started. It does NOT touch the computer-use browser.
//
// Usage:
//   node scripts/verify.mjs [--scenario smoke] [--url http://localhost:5173/]
//                           [--image fixtures/sample.png] [--out <dir>]
//                           [--keep-open]
//
// Exit code 0 = all assertions passed, non-zero = a checked step failed.

import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = resolve(HERE, '..')

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)
const SCENARIO = opt('scenario', 'smoke')
const APP = opt('url', process.env.LUTRA_URL || 'http://localhost:5173/')
const IMAGE = resolve(opt('image', join(SKILL_DIR, 'fixtures', 'sample.png')))
const OUT = resolve(
  opt('out', process.env.VERIFY_OUT || (existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts/verify-lutra' : join(process.cwd(), '.verify-artifacts'))),
)
const KEEP_OPEN = has('keep-open')
const DISPLAY = process.env.DISPLAY || ':1'
mkdirSync(OUT, { recursive: true })

// ---- locate ws (pnpm store layout varies) --------------------------------
function loadWs() {
  const bases = [process.cwd(), SKILL_DIR, '/workspace']
  for (const b of bases) {
    try { return createRequire(join(b, 'noop.js'))('ws') } catch {}
  }
  // Fallback: scan the pnpm virtual store for any ws@* copy.
  for (const b of bases) {
    const store = join(b, 'node_modules', '.pnpm')
    if (!existsSync(store)) continue
    const hit = readdirSync(store).find((d) => d.startsWith('ws@'))
    if (hit) {
      try { return createRequire(join(store, hit, 'node_modules', 'ws', 'index.js'))('.') } catch {}
    }
  }
  throw new Error('could not resolve the "ws" module; run pnpm install first')
}
const WebSocket = loadWs()

// ---- locate chrome -------------------------------------------------------
function findChrome() {
  const cands = ['google-chrome', 'google-chrome-stable', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome']
  for (const c of cands) {
    const r = spawnSync(c, ['--version'], { stdio: 'ignore' })
    if (!r.error) return c
  }
  throw new Error('no Google Chrome binary found on PATH')
}
const CHROME = findChrome()

// ---- chrome launch (software WebGPU) -------------------------------------
const profileDir = mkdtempSync(join(tmpdir(), 'verify-lutra-'))
const port = 9000 + Math.floor(Math.random() * 900)
const chromeFlags = [
  '--ozone-platform=x11',
  '--no-sandbox',
  '--test-type',
  '--disable-dev-shm-usage',
  '--use-gl=angle',
  '--use-angle=swiftshader-webgl',
  // GPU-less VMs have no hardware adapter; these expose a SwiftShader one so
  // the app loads past its "WebGPU required" gate. Harmless on real GPUs.
  '--enable-unsafe-webgpu',
  '--enable-unsafe-swiftshader',
  '--window-size=1600,1000',
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${port}`,
  APP,
]
const chrome = spawn(CHROME, chromeFlags, { stdio: 'ignore', env: { ...process.env, DISPLAY } })

// ---- minimal CDP client --------------------------------------------------
async function getPageWs() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (p) return p.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint never came up')
}

const result = { scenario: SCENARIO, url: APP, image: IMAGE, out: OUT, steps: [], consoleErrors: [], ok: false }
const record = (name, ok, detail) => { result.steps.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

let ws
try {
  const wsUrl = await getPageWs()
  ws = new WebSocket(wsUrl)
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j) })
  let id = 0
  const pending = new Map()
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString())
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    else if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
      const t = (m.params.entry.text || '').slice(0, 200)
      if (!/apple-mobile-web-app-capable|willReadFrequently/.test(t)) result.consoleErrors.push(`[${m.params.entry.level}] ${t}`)
    }
    else if (m.method === 'Runtime.exceptionThrown') result.consoleErrors.push('[exception] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 200))
  })
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })) })
  const evalp = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true })
    if (r.result?.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) }
    return { value: r.result?.result?.value }
  }
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(OUT, `${SCENARIO}-${name}.png`)
    writeFileSync(file, Buffer.from(r.result.data, 'base64'))
    console.log('SHOT', file)
    return file
  }
  // click the first element whose accessible name / text matches a regex
  const clickByName = async (re) => (await evalp(`(() => {
    const rx = ${re};
    const els = [...document.querySelectorAll('button,[role=button],a,[aria-label],[title]')];
    const hit = els.find(e => rx.test((e.getAttribute&&(e.getAttribute('aria-label')||e.getAttribute('title'))||'') + ' ' + (e.innerText||'')));
    if (hit) { hit.click(); return (hit.getAttribute&&hit.getAttribute('aria-label'))||hit.innerText||'(clicked)'; }
    return null;
  })()`)).value

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await sleep(4000)

  // --- WebGPU adapter present? (proves the environment is set up) ---
  const adapter = await evalp(`(async () => { if(!navigator.gpu) return 'no-navigator.gpu'; const a = await navigator.gpu.requestAdapter(); return a ? ('ok:'+((a.info&&a.info.architecture)||'?')) : 'null-adapter'; })()`)
  record('webgpu-adapter', String(adapter.value).startsWith('ok:'), String(adapter.value ?? adapter.error))

  // --- gallery loaded past the WebGPU gate ---
  const body = (await evalp(`(document.body.innerText||'').replace(/\\n/g,' | ').slice(0,160)`)).value || ''
  record('gallery-loaded', !/WebGPU required/i.test(body) && /Open a photo|No saved edits|drop images/i.test(body), body.slice(0, 80))
  await shot('gallery')

  const NEEDS_EDITOR = ['smoke', 'open', 'lut', 'adjust'].includes(SCENARIO)
  if (NEEDS_EDITOR) {
    // --- open a photo via the reliable drop path ---
    const b64 = readFileSync(IMAGE).toString('base64')
    const drop = await evalp(`(() => {
      const bin = atob(${JSON.stringify(b64)});
      const arr = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
      const file = new File([arr], 'sample.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const el = document.querySelector('[data-gallery-drop-zone]') || document.body;
      for (const t of ['dragenter','dragover','drop']) el.dispatchEvent(new DragEvent(t,{dataTransfer:dt,bubbles:true,cancelable:true}));
      return dt.files.length;
    })()`)
    await sleep(9000)
    const url = (await evalp('location.href')).value || ''
    record('open-photo', /\/edit\//.test(url), url)
    const canvases = (await evalp(`JSON.stringify([...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height})))`)).value
    record('editor-canvas', /"w":\s*\d+/.test(String(canvases)), String(canvases))
    await shot('editor')
  }

  if (SCENARIO === 'smoke' || SCENARIO === 'lut') {
    // --- apply a LUT (film emulation) ---
    const lutTool = await clickByName('/Add LUT adjustment/i')
    record('lut-tool-open', !!lutTool, lutTool || 'no LUT tool button')
    await sleep(3500)
    const preset = await clickByName('/^Apply /i')
    record('lut-preset-applied', !!preset, preset || 'no LUT thumbnail')
    await sleep(4000)
    // the applied layer shows up in the right-hand LAYERS panel
    const layerText = (await evalp(`(document.body.innerText||'')`)).value || ''
    record('lut-layer-present', /STRENGTH/i.test(layerText) && /LUT/i.test(layerText), 'LAYERS shows a LUT layer with STRENGTH')
    await shot('lut-applied')
  }

  if (SCENARIO === 'adjust') {
    const tool = await clickByName('/Add Exposure adjustment/i')
    record('exposure-tool-open', !!tool, tool || 'no Exposure tool')
    await sleep(2500)
    const panel = (await evalp(`(document.body.innerText||'')`)).value || ''
    record('exposure-panel', /EXPOSURE/i.test(panel), 'EXPOSURE control visible')
    await shot('exposure')
  }

  record('no-console-errors', result.consoleErrors.length === 0, result.consoleErrors.slice(0, 3).join(' ; ') || 'clean')

  result.ok = result.steps.every((s) => s.ok)
} catch (e) {
  record('harness', false, e.message)
} finally {
  const summary = join(OUT, `${SCENARIO}-result.json`)
  writeFileSync(summary, JSON.stringify(result, null, 2))
  console.log('RESULT', summary, '=>', result.ok ? 'OK' : 'FAILED')
  if (ws) try { ws.close() } catch {}
  if (!KEEP_OPEN) { try { chrome.kill('SIGKILL') } catch {} }
  else console.log('Chrome left open (pid', chrome.pid + ') on', DISPLAY, 'debug port', port)
  await sleep(300)
  process.exit(result.ok ? 0 : 1)
}
