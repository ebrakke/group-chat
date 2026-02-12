# Forgejo Actions Workflow - Deployment Complete

## ✅ What Was Done

### 1. Created Workflow File
**File:** `.forgejo/workflows/deploy.yml`

A complete CI/CD pipeline that runs on push to `master` or `main`:

**Job 1: Build and Test**
- Installs dependencies for root, API, and Frontend
- Builds API and Frontend
- Type-checks TypeScript code

**Job 2: E2E Tests**
- Installs Playwright with Chromium
- Starts services using `docker-compose.dev.yml`
- Runs full Playwright test suite from `tests/e2e/`
- Uploads test results and reports as artifacts (7-day retention)
- Cleans up Docker containers after tests

**Job 3: Deploy to Fly.io** (only after tests pass)
- Installs `flyctl` CLI
- Authenticates with `FLY_API_TOKEN` secret
- Deploys to `relay-chat` app on Fly.io
- Verifies deployment status

### 2. Created Setup Documentation
**File:** `FLY_DEPLOY_SETUP.md`

Complete documentation covering:
- How the workflow works
- Required manual setup steps
- Token generation instructions
- Troubleshooting guide
- Manual deployment fallback

### 3. Committed and Pushed
✅ Committed to master branch
✅ Pushed to GitHub (origin)
⚠️ Could not push to Forgejo (svc-forgejo not resolvable from this host)

## 🔧 Manual Steps Required

Erik needs to complete these steps:

### Step 1: Generate Fly.io Deploy Token
```bash
fly tokens create deploy -a relay-chat
```

Save the output token securely.

### Step 2: Add Secret to Forgejo Repository

1. Navigate to: **https://forge.brakke.cc/erik/relay-chat/settings/secrets**
2. Click **"Add Secret"**
3. Set:
   - **Name:** `FLY_API_TOKEN`
   - **Value:** The token from Step 1
4. Click **Save**

### Step 3: Sync Forgejo with GitHub (if needed)

If the workflow doesn't appear in Forgejo:

```bash
# On a machine that can reach svc-forgejo
cd /path/to/local/relay-chat
git fetch origin
git pull origin master
git push forge master
```

Or wait for Forgejo to auto-sync if mirroring is enabled.

### Step 4: Verify Runner

1. Go to: **https://forge.brakke.cc/erik/relay-chat/settings/runners**
2. Confirm runner with label `docker` is **Active**
   - Should be the runner on svc-docker (192.168.68.54)

### Step 5: Test the Workflow

Push a small change to master or manually trigger:

```bash
git commit --allow-empty -m "Test Forgejo Actions workflow"
git push origin master
```

Monitor at: **https://forge.brakke.cc/erik/relay-chat/actions**

## 📋 Workflow Features

- ✅ **Full CI/CD pipeline** - Build, test, deploy
- ✅ **E2E testing** - Playwright tests run before deployment
- ✅ **Artifact retention** - Test results saved for 7 days
- ✅ **Automatic deployment** - Only on master/main pushes
- ✅ **Deployment verification** - Checks Fly.io status after deploy
- ✅ **Secure secrets** - Uses Forgejo repository secrets
- ✅ **Docker runner** - Runs on existing svc-docker runner

## 📁 Files Modified/Created

```
.forgejo/workflows/deploy.yml          (NEW) - Main workflow
FLY_DEPLOY_SETUP.md                    (NEW) - Setup documentation
DEPLOYMENT_WORKFLOW_COMPLETE.md        (NEW) - This file
```

## 🔍 Testing Checklist

After setting the `FLY_API_TOKEN` secret:

- [ ] Push a commit to master
- [ ] Watch Actions run at forge.brakke.cc/erik/relay-chat/actions
- [ ] Verify Build job passes
- [ ] Verify E2E tests pass
- [ ] Verify Fly.io deployment succeeds
- [ ] Check site at https://chat.brakke.cc
- [ ] Verify Fly.io dashboard shows new deployment

## 🚨 Important Notes

1. **E2E Tests Required** - Deployment will NOT happen if tests fail
2. **Docker Required** - Runner must have Docker for E2E tests
3. **Secrets Required** - `FLY_API_TOKEN` MUST be set or deploy fails
4. **Branch Specific** - Only runs on `master` and `main` branches
5. **Remote Build** - Uses `--remote-only` flag for Fly.io builds

## 📞 Support

If issues arise:
- Check workflow logs at: https://forge.brakke.cc/erik/relay-chat/actions
- Review FLY_DEPLOY_SETUP.md for troubleshooting
- Verify runner status in repo settings
- Check Fly.io logs: `fly logs --app relay-chat`

---

**Completed:** 2026-02-12 06:20 MST  
**By:** Moss (subagent)  
**Pushed to:** GitHub (origin)  
**Next Action:** Erik must add FLY_API_TOKEN secret to Forgejo
