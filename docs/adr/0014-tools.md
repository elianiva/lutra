# Tools: batch compressor and collage maker

## The decision

The tools page (`/tools/`) is a second page of the Lutra site, reached from the gallery header. It ports [elianiva/imgutils](https://github.com/elianiva/imgutils) — a batch resizer, framer and collage maker — onto the editor's stack: foldkit TEA, Effect, Tailwind and the foldcn components.

- **A page, not a route.** The tools live in `packages/frontend/src/tools/` with their own document (`tools/index.html`) and their own foldkit application. Vite builds both pages in one build, so one worker serves both and they share an origin: one deploy, one appearance setting, one service worker. The gallery opens the page with a full load (`OpenTools`), because the editor's router does not own it. The tools page needs no WebGPU, so it sits outside the editor's capability gate.
- **One codec stack.** Encoding goes through the engine's `encodeImage` (jSquash), so the tools get every format the editor exports, AVIF included. The pipeline does its own exact-size resize first and encodes with `scale: 1`.
- **One visual system.** The page uses the editor's `styles.css`, materials (docs/adr/0013-materials) and foldcn components as they are.
- **Bounded memory.** Image work runs in a fixed pool of module workers, an Effect service (`ImageWorkers`) that hands each job an idle worker from a queue. A decoded 24 MP photo costs ~96 MB, so the pool holds at most three.
- **Items are a state machine.** A batch item is `Working → Done | Failed`. A settings change marks `Done` items stale instead of reprocessing them, so dragging a slider never floods the pool; one action reprocesses the stale items (or retries the failures).
- **The collage preview is DOM, not canvas.** Each photo is an `<img>` cropped by its cell and positioned in percentages from the same `coverSourceRect` the export uses, so the preview and the exported file share one crop model and the view stays a pure function of the model.

## Consequences

- The service worker precaches `/tools/index.html` and falls back to it for `/tools` navigations, so the tools work offline like the editor (docs/adr/0007-offline).
- Collage zoom uses the slider; the reference's scroll-to-zoom is not ported.
