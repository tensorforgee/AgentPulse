# SDK release process

This checklist prepares `@agentpulse/sdk` for a public npm release without
publishing it. Run it from a clean checkout at the reviewed release revision.

## External prerequisites

- A repository owner must authorize public distribution under the package's
  current `UNLICENSED` metadata or approve a separate licensing change. Do not
  infer or change the license during a release.
- The publisher needs access to the `@agentpulse` npm scope, an authenticated
  npm session, and any organization-required two-factor authentication.
- The intended package version must be unused on npm. No npm credentials are
  stored in this repository.

## Version and verify

Before `1.0.0`, AgentPulse uses patch releases for backwards-compatible fixes
and minor releases for additive features. A pre-1.0 breaking change requires a
minor release, an explicit changelog entry, and migration notes. Every release
updates `packages/sdk/CHANGELOG.md`; reaching `1.0.0` requires a separate
stability decision.

1. Choose a semantic version and update only `version` in
   `packages/sdk/package.json`. Run `pnpm install --lockfile-only` so the
   workspace lockfile records the same version if needed.
2. Move the release's user-visible entries from `Unreleased` into a dated
   version section in `packages/sdk/CHANGELOG.md`. Do not claim support beyond
   the checked-in tests and documentation.
3. Install from the lockfile and run the focused checks:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm --filter @agentpulse/sdk typecheck
   pnpm --filter @agentpulse/sdk test
   pnpm --filter @agentpulse/demo-agent test
   pnpm --filter @agentpulse/support-rag-agent-example test
   ```

4. Remove generated `packages/shared/dist` and `packages/sdk/dist`, then verify
   both the standalone build and prepack lifecycle recreate what they need:

   ```powershell
   pnpm --filter @agentpulse/sdk build
   pnpm --filter @agentpulse/sdk pack
   Push-Location packages/sdk
   npm pack --dry-run
   Pop-Location
   ```

5. Inspect the generated tarball before installing it into a temporary
   directory:

   ```powershell
   tar -tf agentpulse-sdk-<version>.tgz
   npm install C:\absolute\path\to\agentpulse-sdk-<version>.tgz
   ```

   The archive must contain only `package.json`, `README.md`, and `dist` runtime
   and declaration files. Its manifest must have no runtime dependencies or
   `workspace:` references. Confirm CommonJS `require`, ESM `import`, and a
   strict TypeScript compile from the temporary project. Check that no tests,
   source maps, internal packages, environment files, credentials, or secrets
   are present.

## Publish gate

Only after review, licensing authorization, npm access, version availability,
and all checks above are confirmed may an authorized maintainer publish the
reviewed tarball:

```powershell
npm publish .\agentpulse-sdk-<version>.tgz --access public
```

Publishing is intentionally manual and is not performed by the verification
steps in this guide. After publication, install the exact released version in a
new external project, send a test trace to a non-production AgentPulse project,
and verify that the trace appears under **Runs** before announcing the release.
