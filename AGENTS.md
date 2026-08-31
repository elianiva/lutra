# Important

- We're using Effect v4 beta
- We're using foldkit which uses TEA
- Everything should be modeled using Effect idiomatic pattern and state machines for robustness
- Use jj instead of git for version control
- Docs: ADRs (`docs/adr/`) are the permanent record — no plans directory, fold decisions straight into an ADR

## Cursor Cloud specific instructions

- The base image ships Node 22 and the pinned pnpm. `.cursor/install.sh` (wired via `.cursor/environment.json`) also installs `bun`, which `pnpm build` and the icon/service-worker/LUT/RAW scripts need.
- The dev server runs directly as Vite on a fixed port (`http://localhost:5173`), not through `pnpm dev`. `pnpm dev` uses portless, which needs a privileged local proxy that does not fit the cloud port-forward model. `.cursor/environment.json` starts `vite --host 0.0.0.0 --port 5173` in a terminal.
- Running the app requires WebGPU, and cloud VMs have no hardware GPU. To load past the "WebGPU required" gate, the computer-use Chrome must launch with `--enable-unsafe-webgpu --enable-unsafe-swiftshader` (SwiftShader software adapter). Add these to the Chrome launch flags (e.g. the VM's `/usr/local/bin/google-chrome` wrapper and `/usr/share/applications/google-chrome.desktop`).
- With those flags a WebGPU adapter is exposed, so the app boots and the UI/state flow (open photo, add layers) is verifiable. But the WebGPU **render pipeline cannot be validated in this environment**: the swapchain canvas does not composite under SwiftShader (the main preview stays black and a canvas readback is empty). The LUT filmstrip thumbnails are **not** WebGPU — they are produced on the CPU by `applyLutCpu` (`packages/frontend/src/thumbs/worker.ts`), so they validate LUT/app correctness, not the GPU pipeline. To validate WebGPU compute/render specifically, use hardware GPU or a GPU-targeted test; do not infer GPU health from the thumbnails or treat the black main canvas as a failure here.
