# CI/CD Setup Status - Relay Chat

**Date**: 2026-02-11  
**Status**: 95% Complete - Ready for final registration

## ✅ Infrastructure Complete

### Forgejo Runner on svc-docker (192.168.68.54)
- [x] Downloaded forgejo-runner v11.0.0
- [x] Installed to `/opt/forgejo-runner/`
- [x] Generated config at `/opt/forgejo-runner/config.yml`
- [x] Configured Docker access (`docker_host: automount`)
- [x] Created systemd service file
- [x] Created automated setup script

**To verify:**
```bash
ssh root@192.168.68.54 "ls -la /opt/forgejo-runner/"
```

### CI/CD Workflow
- [x] Created `.forgejo/workflows/ci-cd.yml`
- [x] CI: Build & type-check on all pushes/PRs
- [x] CD: Auto-deploy to production on master
- [x] Committed to repository (not pushed yet)

**To verify:**
```bash
cd /root/.openclaw/workspace-acid_burn/relay-chat
cat .forgejo/workflows/ci-cd.yml
```

### Documentation
- [x] `FORGEJO_RUNNER_SETUP.md` - Detailed setup guide
- [x] `RUNNER_QUICKSTART.md` - 5-minute quick start
- [x] `CI_CD_SETUP_STATUS.md` - This status file

## ⏳ Remaining Manual Steps

### 1. Register Runner (~3 minutes)
```bash
# Get token from: https://forge.brakke.cc/erik/relay-chat/settings/actions/runners
# Then run:
ssh root@192.168.68.54
cd /opt/forgejo-runner
./complete-runner-setup.sh
```

**Required info:**
- Instance URL: `https://forge.brakke.cc`
- Token: [from web UI]
- Runner name: `relay-chat-runner`
- Labels: `docker:docker://node:20-bookworm`

### 2. Enable Actions in Repository (~1 minute)
```
1. Visit: https://forge.brakke.cc/erik/relay-chat/settings
2. Go to: Units → Overview
3. Check: "Actions" checkbox
4. Click: Save
```

### 3. Push Workflow (~1 minute)
```bash
cd /root/.openclaw/workspace-acid_burn/relay-chat
git push origin master
```

### 4. Verify Deployment (~2 minutes)
```
1. Visit: https://forge.brakke.cc/erik/relay-chat/actions
2. Watch workflow run
3. Verify deployment succeeds
4. Check: https://chat.brakke.cc
```

## 🎯 What Happens Next

Once you push to master, the workflow will:

1. **CI Job** (runs on all pushes):
   - Checkout code
   - Setup Node.js 20
   - Install dependencies
   - Build API: `cd api && npm ci && npm run build`
   - Build Frontend: `cd frontend && npm ci && npm run build`
   - Type-check API: `npx tsc --noEmit`
   - Type-check Frontend: `npx tsc --noEmit`

2. **Deploy Job** (only on master, after CI passes):
   - Checkout code
   - Clone/pull repo to `/root/relay-chat` on svc-docker
   - Run: `docker compose -f docker-compose.prod.yml up -d --build`
   - Wait 10 seconds
   - Health check: Verify all 4 containers running
   - Report success/failure

## 📊 Current State

| Component | Status | Location |
|-----------|--------|----------|
| Runner Binary | ✅ Installed | svc-docker:/opt/forgejo-runner/ |
| Runner Config | ✅ Configured | svc-docker:/opt/forgejo-runner/config.yml |
| Systemd Service | ✅ Created | svc-docker:/etc/systemd/system/forgejo-runner.service |
| Setup Script | ✅ Ready | svc-docker:/opt/forgejo-runner/complete-runner-setup.sh |
| CI Workflow | ✅ Committed | .forgejo/workflows/ci-cd.yml |
| Documentation | ✅ Complete | FORGEJO_RUNNER_SETUP.md, RUNNER_QUICKSTART.md |
| Runner Registration | ❌ Pending | Needs manual token from web UI |
| Actions Enabled | ❌ Pending | Needs checkbox in repo settings |
| Workflow Pushed | ❌ Pending | Ready to push |

## 🔍 Quick Verification Commands

**Check runner files exist:**
```bash
ssh root@192.168.68.54 "ls -la /opt/forgejo-runner/"
```

**Check systemd service:**
```bash
ssh root@192.168.68.54 "cat /etc/systemd/system/forgejo-runner.service"
```

**Check workflow file:**
```bash
cat .forgejo/workflows/ci-cd.yml
```

**Check what's committed:**
```bash
git log --oneline -5
git status
```

## 🚀 Next Action

**YOU SHOULD DO:** Run the setup script to complete registration

```bash
# Step 1: Get token from web UI
# https://forge.brakke.cc/erik/relay-chat/settings/actions/runners

# Step 2: Run setup
ssh root@192.168.68.54 "/opt/forgejo-runner/complete-runner-setup.sh"

# Step 3: Enable Actions in repo settings
# https://forge.brakke.cc/erik/relay-chat/settings → Units → Actions ✓

# Step 4: Push and watch
cd /root/.openclaw/workspace-acid_burn/relay-chat
git push origin master

# Step 5: Watch it run
# https://forge.brakke.cc/erik/relay-chat/actions
```

## 📚 Reference

**Quick start guide**: `RUNNER_QUICKSTART.md`  
**Detailed docs**: `FORGEJO_RUNNER_SETUP.md`  
**Workflow file**: `.forgejo/workflows/ci-cd.yml`

**Forgejo instance**: https://forge.brakke.cc  
**Repository**: https://forge.brakke.cc/erik/relay-chat  
**Production site**: https://chat.brakke.cc

---

**Estimated time to complete**: 5-7 minutes  
**Setup progress**: 95% ✅
