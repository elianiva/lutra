# Tools: batch compressor and collage maker

## The decision

The tools page (`/app/tools`) is a second page of the Lutra site, reached from the nav pill. It ports [elianiva/imgutils](https://github.com/elianiva/imgutils) — a batch resizer, framer and collage maker — onto the editor's stack: foldkit TEA, Effect, Tailwind and the foldcn components.

- **A route, not a document.** Tools is the `/app/tools` route of the one foldkit application, owned by a Tools Submodel (`packages/frontend/src/tools/`) next to the Gallery and Editor. One worker, one origin, one service worker, and a half-built batch survives a visit to the gallery. Moving between Edits and Tools pushes the URL inside a view transition (`navigate.ts`): the nav's pill slides and the page slides in the direction of travel. The tools need no WebGPU, but the root's capability gate still covers them.
- **One codec stack.** Encoding goes through the engine's `encodeImage` (jSquash), so the tools get every format the editor exports, AVIF included. The pipeline does its own exact-size resize first and encodes with `scale: 1`.
- **One visual system.** The page uses the editor's `styles.css`, materials (docs/adr/0013-materials) and foldcn components as they are.
- **RAW in, like the editor.** The image workers decode through `decodeImage` (docs/adr/0008-raw-decode) with the inline RAW engine, since they are workers already, so the tools accept every format the editor does. They decode at full size: no `longEdge`.
- **Bounded memory.** Image work runs in a fixed pool of module workers, an Effect service (`ImageWorkers`) that hands each job an idle worker from a queue. A decoded 24 MP photo costs ~96 MB, so the pool holds at most three.
- **Items are a state machine.** A batch item is `Working → Done | Failed`. A settings change marks `Done` items stale instead of reprocessing them, so dragging a slider never floods the pool; one action reprocesses the stale items (or retries the failures).
- **The collage preview is DOM, not canvas.** Each photo is an `<img>` cropped by its cell and positioned in percentages from the same `coverSourceRect` the export uses, so the preview and the exported file share one crop model and the view stays a pure function of the model.

## Consequences

- The tools work offline like the editor (docs/adr/0007-offline): `/app/tools` falls back to the one app shell.
- Collage zoom uses the slider; the reference's scroll-to-zoom is not ported.
