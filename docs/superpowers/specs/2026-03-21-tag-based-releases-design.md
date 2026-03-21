# Tag-Based Release Pipeline

## Summary

Change the Docker image tagging strategy so pushes to master produce a `:dev` image, and version tags (e.g. `v1.2.3`) produce `:latest` plus the version-specific tag. This enables running two Once instances — one tracking `:dev` for testing, one tracking `:latest` for production.

## Current behavior

- Push to `master` → builds and pushes `ghcr.io/ebrakke/group-chat:latest` + `:<sha>`
- No tag-based workflow
- Binary version is always `dev` (hardcoded default in ldflags)

## New behavior

### Push to `master`

- Builds and pushes `ghcr.io/ebrakke/group-chat:dev`
- Binary version: `dev` (unchanged default)

### Push a version tag (`v*`)

- Builds and pushes:
  - `ghcr.io/ebrakke/group-chat:latest`
  - `ghcr.io/ebrakke/group-chat:v1.2.3` (the tag itself)
- Binary version: `v1.2.3` (extracted from git tag, passed via `--build-arg VERSION=v1.2.3`)

## Changes

### 1. Update Forgejo workflow

**File:** `.forgejo/workflows/docker-publish.yml`

Update the trigger to also fire on version tags:

```yaml
on:
  push:
    branches:
      - master
      - main
    tags:
      - 'v*'
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - 'LICENSE'
```

Update the build-and-push step to conditionally tag based on trigger type:

- If triggered by a tag (`v*`): tag as `:latest` and `:<tag-name>`, pass `VERSION=<tag-name>` build arg
- If triggered by branch push: tag as `:dev`, no version override (defaults to `dev`)

### 2. Pass VERSION build arg for tagged builds

The `Dockerfile.once` already accepts `ARG VERSION=dev` and injects it via ldflags. The workflow just needs to pass `--build-arg VERSION=<tag>` when building from a tag trigger.

## What stays unchanged

- `Dockerfile.once` — no changes needed (already supports `ARG VERSION`)
- `Makefile` / `scripts/release.sh` — unchanged
- Once deployment config — just point dev instance at `:dev` and prod at `:latest`
- `paths-ignore` — docs/markdown changes still skip CI

## Deployment setup

- **Dev Once instance:** pull `ghcr.io/ebrakke/group-chat:dev`
- **Prod Once instance:** pull `ghcr.io/ebrakke/group-chat:latest`

## Workflow

1. Develop on master (or feature branches merged to master)
2. Push to master → CI builds `:dev` → dev Once instance picks it up
3. Test on dev instance
4. When satisfied: `git tag v1.2.3 && git push --tags`
5. CI builds `:latest` + `:v1.2.3` → prod Once instance picks it up
