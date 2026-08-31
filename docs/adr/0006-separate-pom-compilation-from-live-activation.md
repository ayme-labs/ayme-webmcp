---
status: accepted
---

# Separate POM compilation from live activation

TypeScript contains the visibility, parameter, and type information needed to derive POM metadata, but that information does not survive normal JavaScript compilation. Shipping the TypeScript compiler to the browser or generating companion files in consumer repositories would make the runtime and setup heavier.

## Considered options

- OC1: Derive POM metadata through browser runtime reflection.
- OC2: Generate companion files in the consumer repository.
- OC3: Derive metadata at build time, transport it through the bundler, and activate live POM instances at runtime.

## Decision

Derive POM metadata from TypeScript at build time.

Bundler integrations carry the compiled metadata into the browser bundle without creating generated files in the consumer repository.

Runtime activation binds compiled metadata to currently live POM instances and owns their lifetime.

Keep compiler derivation, bundler transport, and runtime activation as separate responsibilities.

## Consequences

The browser runtime does not ship the TypeScript compiler.

Bundler adapters can share compiler logic without defining the runtime lifecycle.

Activation APIs may evolve without changing the compiler and bundler boundaries.
