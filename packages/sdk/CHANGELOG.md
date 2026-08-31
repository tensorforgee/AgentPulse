# Changelog

## Unreleased

- Added bounded transient retries, request timeouts, safe retry diagnostics,
  and scoped `withTrace` / `withSpan` lifecycle helpers.
- Added a dependency-free, non-streaming OpenAI-compatible chat-completion
  helper built on the existing trace/span lifecycle.
- Exported every public type used in SDK method and helper signatures.

## 0.0.1 - Pending first authorized release

- Prepared the SDK as a bundled CommonJS, ES module, and TypeScript package
  with no runtime dependencies.
