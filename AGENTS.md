# Important

- We're using Effect v4 beta
- We're using foldkit which uses TEA
- Everything should be modeled using Effect idiomatic pattern and state machines for robustness
- Use jj instead of git for version control
- Docs: ADRs (`docs/adr/`) are the permanent record — no plans directory, fold decisions straight into an ADR

## Orbs

- `.agents/setup` prepares a fresh orb: it checks the Node toolchain, installs `bun` when missing, raises `vm.overcommit_memory` so lint can reserve its arenas, and runs `pnpm install --frozen-lockfile`. Dependencies are already installed when a thread starts — do not reinstall them.
- The dev server is declared in `.amp/services.yaml`. Start it with `amp orb services ensure` and share the portal URL it prints; never `nohup`, `&`, or a bare `pnpm dev` on port 5173, and never start it from `.agents/setup`.
- Open the app in Chrome with `--enable-unsafe-webgpu --enable-unsafe-swiftshader` so the WebGPU gate passes. The main canvas stays black under SwiftShader: verify UI, state, and thumbnails, not the GPU render.
- `pnpm lint` (`vp lint`) and `pnpm typecheck` (`tsrs --noEmit --fast`) both run the tsrs compiler, so a type error fails either gate (docs/adr/0016-lint-and-typecheck). In an orb, Oxlint's JS plugin host aborts with `panicked at ... oxc_allocator/src/pool/fixed_size.rs` because the sandbox's memory commit limit is smaller than the 4 GiB arena Oxlint reserves per lint thread. `.agents/setup` raises `vm.overcommit_memory` for this, but it is kernel state: if lint still aborts, run `sudo sh -c 'echo 1 > /proc/sys/vm/overcommit_memory'` once. Without sudo, use `pnpm typecheck` and `pnpm test` for local signal and let CI be the lint gate.

## Cursor Cloud specific instructions

- The base image ships Node 22 and the pinned pnpm. `.cursor/install.sh` (wired via `.cursor/environment.json`) also installs `bun`, which `pnpm build` and the icon/service-worker/LUT scripts need.
- The dev server runs via `pnpm dev` on `http://localhost:5173` (Vite). `.cursor/environment.json` starts it in a terminal.
- Running the app requires WebGPU, and cloud VMs have no hardware GPU. To load past the "WebGPU required" gate, the computer-use Chrome must launch with `--enable-unsafe-webgpu --enable-unsafe-swiftshader` (SwiftShader software adapter). Add these to the Chrome launch flags (e.g. the VM's `/usr/local/bin/google-chrome` wrapper and `/usr/share/applications/google-chrome.desktop`).
- With those flags a WebGPU adapter is exposed, so the app boots and the UI/state flow (open photo, add layers) is verifiable. But the WebGPU **render pipeline cannot be validated in this environment**: the swapchain canvas does not composite under SwiftShader (the main preview stays black and a canvas readback is empty). The LUT filmstrip thumbnails are **not** WebGPU — they are produced on the CPU by `applyLutCpu` (`packages/frontend/src/thumbs/worker.ts`), so they validate LUT/app correctness, not the GPU pipeline. To validate WebGPU compute/render specifically, use hardware GPU or a GPU-targeted test; do not infer GPU health from the thumbnails or treat the black main canvas as a failure here.
