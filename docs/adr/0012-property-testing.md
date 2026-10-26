# Property testing

## One generator, derived from the Schemas

Property tests generate through Effect's `Arbitrary` and run through `@effect/vitest`, not a third-party generator library. Every generated value comes from a Schema that also describes a real boundary of the application, so a counterexample is a value the app could actually receive.

- `Arbitrary.schema(SomeSchema)` derives generation and shrinking from the Schema. Use it for domain values (`Layer`, `ExportSettings`, `Edit` fields) rather than hand-written record generators.
- Compose with `Arbitrary.all` (records and tuples), `Arbitrary.array`, `Arbitrary.map`, `Arbitrary.flatMap` (dependent shapes, such as "a cube with exactly `size³ × 3` texels"), and `Arbitrary.Constant`.
- Register with `it.prop(name, arbitraries, property)` from `@effect/vitest`. Property tests that need to await application code register with `it.effect.prop` and return an `Effect`.
- `fast-check` is not a dependency of any package. `fc.commands`-style model-based tests are expressed as a generated sequence of operations applied to both the real service and a reference model.

**Why derived rather than hand-written**: the bounds a generator must respect (a quality in `0..100`, a scale in `0.01..1`, a LUT cube size of `2..16`) already exist as Schema checks. Keeping generation in the Schema means one place to change when a bound moves, and shrinking stays valid against that Schema.

## Constraints that follow

- **Bounds belong in the Schema, not in a filter.** `Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))` generates in range. `Arbitrary.filter` discards instead, and discarded attempts do not advance the generation size, so a filter that rejects the smallest generated value (an empty string, an empty array) exhausts the run instead of progressing. Filter only for rare rejections.
- **A precondition belongs in the generator.** Where a property needs a specific shape — a chain whose LUT id is missing, a chain whose LUTs all resolve — generate that shape (`Arbitrary.map`, `Arbitrary.flatMap`) instead of asserting the precondition inside the property. A generator that guarantees the shape tests every run; a precondition wastes runs and can exhaust.
- **Generation must produce encodable values where the property encodes.** A Schema that carries a refinement (the UUID check on `EditIdSchema`) cannot be inverted by derivation, so a value that must round-trip through that refinement is generated from the parts and constructed through the brand (`EditId(generated)`).

## Budgets

Run counts stay low enough for CI on small machines, and a property that materializes a large fixture says so at its call site: `{ arbitrary: { runs: 10 } }` for a 16³ LUT cube, and a `timeout` beside it when wall-clock headroom is needed.
