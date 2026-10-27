# imgutils: batch compressor and collage maker

## The decision

imgutils (`packages/imgutils`, deployed to `imgutils.elianiva.workers.dev`) is a second app in this monorepo, not a separate repository. It ports [elianiva/imgutils](https://github.com/elianiva/imgutils) — a plain-JS batch resizer, framer and collage maker — onto the stack the editor uses: foldkit TEA, Effect, Tailwind and the foldcn components.

- **One codec stack.** Encoding goes through the engine's `encodeImage` (jSquash), so imgutils gets every format the editor exports, AVIF included, and a codec fix lands in both apps. The pipeline does its own exact-size resize first and encodes with `scale: 1`.
- **One visual system.** imgutils imports the editor's tokens and primitives from `packages/frontend/src/materials.css` (docs/adr/0013-materials). Each app keeps its own `@import 'tailwindcss'`, so Tailwind scans that app's sources only. The deploy hash includes the engine sources and `materials.css`.
- **Bounded memory.** Image work runs in a fixed pool of module workers, an Effect service (`ImageWorkers`) that hands each job an idle worker from a queue. A decoded 24 MP photo costs ~96 MB, so the pool holds at most three.
- **Items are a state machine.** A batch item is `Working → Done | Failed`. A settings change marks `Done` items stale instead of reprocessing them, so dragging a slider never floods the pool; one action reprocesses the stale items (or retries the failures).
- **The collage preview is DOM, not canvas.** Each photo is an `<img>` cropped by its cell and positioned in percentages from the same `coverSourceRect` the export uses, so the preview and the exported file share one crop model and the view stays a pure function of the model.

## Consequences

- The frontend's `materials.css` is a shared contract: a token rename is a change to both apps.
- Collage zoom uses the slider; the reference's scroll-to-zoom is not ported.
