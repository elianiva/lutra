# Lint and type checking on Oxlint with tsrs

## The decision

Oxlint lints and **tsrs** type checks, for both type-aware rules and the `pnpm typecheck` gate. No `tsc`, no separate typescript-eslint stack.

- **One compiler, two consumers.** `vite.config.ts` keeps `lint.options.typeAware` and `lint.options.typeCheck`. `pnpm lint` (`vp lint`) runs type-aware rules and TypeScript diagnostics in one pass, and `pnpm typecheck` (turbo, then `tsrs --noEmit --fast` per package) runs the same Rust compiler standalone.
- **tsrs comes with Vite+.** `vite-plus` 1.7.0 depends on `tsrs` and drops `oxlint-tsgolint`, so `vp lint` uses tsrs as the type-aware backend. The workspace also declares `tsrs` directly: that is what puts `tsrs` and `tsrs-lint` on `PATH`, for the package `typecheck` scripts and for a direct `oxlint` run. Pin it to the exact version `vite-plus` depends on, and bump both together.
- **Oxlint and its plugin API move in lockstep with Vite+.** A JS plugin runs inside Oxlint's host and imports `@oxlint/plugins`, so `oxlint` and `@oxlint/plugins` stay exact-pinned to the versions `vite-plus` bundles. A mismatch surfaces as a plugin that fails to load, not as a clear version error.
- **`typescript` is not a dependency.** Nothing compiles with `tsc`; `tsrs` is the compiler. Editors use their own language service, and the packages that still peer-depend on `typescript` resolve it transitively.
- **The JS plugin host needs address space, not memory.** Oxlint parses into fixed-size 4 GiB arenas, one per lint thread, and reserves them up front. On Linux that is virtual address space under overcommit; a sandbox with a hard commit limit (such as an Amp orb) aborts with an allocator panic in `crates/oxc_allocator/src/pool/fixed_size.rs` until overcommit is permissive. This constrains the environment, not the code: `.agents/setup` raises `vm.overcommit_memory`, which is kernel state and so never travels in a snapshot.

## Consequences

- A rule that needs types and a compile error both come from one compiler version, so the lint and typecheck gates cannot disagree about types.
- Adding or changing a type-aware rule needs no extra project configuration: `typeAware` and `typeCheck` are already on.
- Bumping `vite-plus` means re-pinning `oxlint`, `@oxlint/plugins` and `tsrs` to the versions it bundles.
- `tsrs` is a prerelease (`7.1.0-beta.tsrs2`), versioned against the TypeScript release it ports; treat a TypeScript-level change as a compiler change.
