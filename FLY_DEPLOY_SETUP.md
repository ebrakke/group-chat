# Fly.io Deployment via Forgejo Actions

This document explains the CI/CD workflow for deploying Relay Chat to Fly.io using Forgejo Actions.

## Overview

The workflow at `.forgejo/workflows/deploy.yml` automatically deploys to Fly.io when code is pushed to `master` or `main` branches.

### Workflow Steps

1. **Build and Test** - Compiles TypeScript, type-checks API and Frontend
2. **E2E Tests** - Runs Playwright tests against `docker-compose.dev.yml`
3. **Deploy to Fly.io** - If tests pass, deploys to `relay-chat` app on Fly.io

## Required Setup

### 1. Generate Fly.io Deploy Token

On a machine with the Fly CLI authenticated:

```bash
fly tokens create deploy -a relay-chat
```

This generates a deploy-scoped token for the `relay-chat` app.

**Save this token securely** - you'll need it in the next step.

### 2. Add Secret to Forgejo Repository

1. Go to: https://forge.brakke.cc/erik/relay-chat/settings/secrets
2. Click **"Add Secret"**
3. Enter:
   - **Name:** `FLY_API_TOKEN`
   - **Value:** The token from step 1
4. Click **Save**

### 3. Verify Runner is Ready

The workflow uses the `docker` runner label. Confirm the runner on `svc-docker` (192.168.68.54) is active:

1. Go to: https://forge.brakke.cc/erik/relay-chat/settings/runners
2. Confirm a runner with label `docker` is showing as **Active**

## How It Works

### On Every Push to Master/Main:

1. **Build Job** - Installs dependencies, builds API and frontend, type-checks code
2. **E2E Job** - Starts dev environment with Docker Compose, runs all Playwright tests
3. **Deploy Job** - If tests pass:
   - Installs `flyctl` in CI container
   - Authenticates using `FLY_API_TOKEN` secret
   - Runs `fly deploy --app relay-chat --remote-only`
   - Verifies deployment status

### E2E Test Details

Tests run against `docker-compose.dev.yml`:
- All containers start fresh for each test run
- Tests located at `tests/e2e/tests/*.spec.ts`
- Test results and reports are uploaded as artifacts (7-day retention)

## Troubleshooting

### "FLY_API_TOKEN not found" Error

- The secret is not set in Forgejo repo settings
- Follow step 2 above to add it

### Flyctl Installation Fails

The workflow downloads flyctl fresh each run. If the Fly.io install script is unreachable:
- Check runner internet connectivity
- Verify https://fly.io/install.sh is accessible

### E2E Tests Fail

- Check test results artifact in the Forgejo Actions run
- Verify `docker-compose.dev.yml` services start correctly
- Tests expect services on specific ports (check `docker-compose.dev.yml`)

### Deployment Succeeds but Site is Down

- Check Fly.io dashboard: https://fly.io/apps/relay-chat
- Verify secrets are set on Fly app: `fly secrets list --app relay-chat`
- Check Fly logs: `fly logs --app relay-chat`

## Manual Deployment

To deploy manually (bypassing CI):

```bash
cd /root/.openclaw/workspace-acid_burn/relay-chat
fly deploy --app relay-chat
```

## Files

- `.forgejo/workflows/deploy.yml` - Main CI/CD workflow
- `.forgejo/workflows/ci-cd.yml` - Original workflow (can be removed or kept for non-deploy branches)
- `Dockerfile.fly` - Fly.io Dockerfile
- `fly.toml` - Fly.io app configuration

## Next Steps

1. ✅ Generate deploy token: `fly tokens create deploy -a relay-chat`
2. ✅ Add `FLY_API_TOKEN` to Forgejo secrets
3. ✅ Push to master branch to trigger first automated deploy
4. ✅ Monitor the Actions run at: https://forge.brakke.cc/erik/relay-chat/actions

---

**Created:** 2026-02-12  
**App:** relay-chat  
**Forgejo:** forge.brakke.cc/erik/relay-chat  
**Fly.io:** https://fly.io/apps/relay-chat
