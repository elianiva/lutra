# Contributing to Lutra

Thanks for picking this up! Lutra is a color-grading app for film simulation — Web-first, client-side only, all image processing runs locally via WebGPU shaders. This doc covers the implicit stuff you won't get from just browsing the tree.

## Prerequisites

- Node ≥ 22, pnpm 11+, bun (the frontend build scripts need it)
- A browser with WebGPU (Chrome / Edge / Safari). Cloud VMs without a GPU can boot the app with `--enable-unsafe-webgpu --enable-unsafe-swiftshader`, but the swapchain canvas stays black there — CPU-side LUT thumbnails still validate correctness.

```bash
git clone git@github.com:elianiva/lutra.git
cd lutra
pnpm install
```

## How it fits together

- **`@lutra/engine`** (`packages/engine/`) — pure computational core: layer registry, WGSL shader bodies, chain source assembly, colorspace conversions. No WebGPU pipeline, no DOM, no UI. Just math and shaders.
- **`@lutra/frontend`** (`packages/frontend/`) — the web app: WebGPU pipeline setup, TEA-based UI via foldkit, all browser concerns. Consumes engine as a library.
- **`@lutra/store`** (`packages/store/`) — persistence seam: Edit / Edit summary schemas, Edit store service contract, IndexedDB implementation. A future server store swaps in behind the same interface.

Check `docs/adr/` for architecture decisions — they are the permanent record.

## Conventions

- **Effect v4 beta + foldkit TEA.** Everything is modeled with Effect idioms and state machines for robustness. Root Submodel owns the route; Gallery and Editor are Submodels per route arm.
- **Non-destructive ordered layers.** Each adjustment layer consumes the previous layer's output. Order matters; keep it that way.
- **No `as`, no `any`.** The oxlint `anti-slop` rules enforce this (plus no conditional empty-object spreads, no runtime `typeof`, etc.). Run `pnpm lint` — it must be clean.
- **Vendored LUTs** live under the frontend assets; `pnpm vendor:luts` refreshes them via `scripts/vendor-luts.ts`.

## Loop

```bash
pnpm dev          # web app at http://localhost:5173
pnpm fmt          # format (lefthook runs this on pre-commit)
pnpm lint         # oxlint, type-aware
pnpm typecheck
pnpm test
pnpm build        # turbo build across packages
```

Hooks (lefthook, installed via `pnpm prepare`): pre-commit runs `fmt` then `lint`; pre-push runs `build` + `typecheck`. CI runs format check, lint, typecheck, test. Deploy to Cloudflare via `pnpm infra:deploy` happens automatically on `master`.

## Submitting

Fork, branch, keep commits focused, run `pnpm fmt && pnpm lint && pnpm typecheck && pnpm test`, open a PR with what/why.

Issues → [github.com/elianiva/lutra/issues](https://github.com/elianiva/lutra/issues)

## License

By contributing, you agree your contributions are [MIT](LICENSE).
