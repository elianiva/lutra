# Landing page and the `/app` split

## The decision

The site's front door is a landing page at `/`. The whole app moves under `/app`.

| Route   | URL                 | Owner            |
| ------- | ------------------- | ---------------- |
| Landing | `/`                 | Landing Submodel |
| Gallery | `/app`              | Gallery Submodel |
| Editor  | `/app/edit/:editId` | Editor Submodel  |
| Tools   | `/app/tools`        | Tools Submodel   |

- **A route, not a document.** The landing page is a Submodel (`packages/frontend/src/landing/`) behind a `GotLandingMessage` boundary, like the Gallery and Tools. Opening the app is a URL push, so the visitor never reloads or re-downloads the shell.
- **No WebGPU gate.** The landing page is plain HTML and CSS. The root's capability gate covers only the app routes, so a visitor on a browser without WebGPU still sees the page.
- **No offline fill on the landing page.** A visitor who never opens the app should not download the film library. Boot on `/` skips `StartOfflineFill`; the first `ChangedRoute` from Landing to an app route starts it (unless the device asked for reduced data).
- **The app's style, a broken layout.** The page uses the app's own language: hairline rules with "+" markers, a square grid, soft surfaces, red pill keys, Chakra Petch and the editor's tokens (light and dark). What breaks is the layout: cards hang over the rails and the row below, sit off the grid, and tilt a degree or two. Its content is the app's real components (nav pill, range rows, switches, tabs, badges, buttons).
- **Grain is the real algorithm.** The engine's grain shader (`shaders/bodies/grain.ts`, profile 1, the engine's noise and luma weighting, tuned fine and subtle: amount 0.45, chroma 0.15, a 1024px print) is ported to a one-off script and baked into a second set of prints (`public/landing/*-grain.jpg`); the Grain key fades it in. Grain, not the LUT alone, is what makes the prints read as film.
- **A demo without a GPU.** The film strip uses the real LUT thumbnails (each is the actual LUT applied to one sample photo). The slider fades between the plain photo and the film look. It is a preview of what a film look can do, not a second editor.
- **Old URLs.** `/tools` and `/edit/:id` are not redirected. Nothing public linked to them yet. The PWA manifest's `start_url` is `/app`, so an installed app opens the gallery.

## Consequences

- Deep links need the single-page fallback for `/app/*` as well as `/` (`notFoundHandling: 'single-page-application'` already covers it).
- `pageUrl` and the root's `NavigateToEdit` are the only places that build app URLs.
- **SEO.** The shell `index.html` carries the title, description, canonical URL, Open Graph and Twitter tags, JSON-LD (`WebApplication`) and a `<noscript>` summary, because crawlers and link unfurlers read the static document, not the Submodel's view. The landing route sets the document title at runtime. `public/og.jpg` (1200×630) is the share image; `robots.txt` keeps crawlers out of `/app`, and `sitemap.xml` lists only `/`.
