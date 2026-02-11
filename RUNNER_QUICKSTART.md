# Forgejo Runner Quick Start

The CI/CD infrastructure is ready! Just need to complete these final steps:

## ✅ What's Already Done

1. **Forgejo Runner** installed on svc-docker (192.168.68.54)
   - Binary: `/opt/forgejo-runner/forgejo-runner` (v11.0.0)
   - Config: `/opt/forgejo-runner/config.yml` (Docker access enabled)
   - Systemd service file installed

2. **CI/CD Workflow** committed to repo
   - File: `.forgejo/workflows/ci-cd.yml`
   - CI: Build & type-check API/Frontend
   - CD: Auto-deploy to production on master push

3. **Setup script** ready at `/opt/forgejo-runner/complete-runner-setup.sh`

## 🚀 Complete the Setup (5 minutes)

### Step 1: Get Registration Token

Go to: https://forge.brakke.cc/erik/relay-chat/settings/actions/runners

Click **"Create new Runner"** and copy the token.

### Step 2: Register and Start Runner

SSH into svc-docker and run the setup script:

```bash
ssh root@192.168.68.54
cd /opt/forgejo-runner
./complete-runner-setup.sh
```

When prompted:
- **Instance URL**: `https://forge.brakke.cc`
- **Token**: [paste the token from Step 1]
- **Runner name**: `relay-chat-runner`
- **Labels**: `docker:docker://node:20-bookworm`

The script will:
- Register the runner
- Configure Docker access
- Enable and start the systemd service

### Step 3: Enable Actions in Repository

1. Go to: https://forge.brakke.cc/erik/relay-chat/settings
2. Click **"Units"** → **"Overview"**
3. Check the **"Actions"** checkbox
4. Save

### Step 4: Push to Trigger Workflow

The workflow file is already committed but not pushed. Push it:

```bash
cd /root/.openclaw/workspace-acid_burn/relay-chat
git push origin master
```

### Step 5: Watch It Run

Go to: https://forge.brakke.cc/erik/relay-chat/actions

You should see:
- **CI job**: Building and type-checking
- **Deploy job**: Only runs on master, deploying to production

## 📝 How It Works

**On Every Push/PR:**
```
1. Checkout code
2. Setup Node.js 20
3. Build API (npm ci && npm run build)
4. Build Frontend (npm ci && npm run build)
5. Type-check both with TypeScript
```

**On Push to Master (after CI passes):**
```
1. Clone/update repo to /root/relay-chat on svc-docker
2. Run: docker compose -f docker-compose.prod.yml up -d --build
3. Wait for containers to start
4. Health check: verify all 4 containers running
```

## 🔍 Monitoring

**View runner status:**
```bash
ssh root@192.168.68.54 "systemctl status forgejo-runner"
```

**View runner logs:**
```bash
ssh root@192.168.68.54 "journalctl -u forgejo-runner -f"
```

**View workflow runs:**
https://forge.brakke.cc/erik/relay-chat/actions

## 🐛 Troubleshooting

**Runner not picking up jobs?**
- Check runner is registered: `cat /opt/forgejo-runner/.runner`
- Check runner is running: `systemctl status forgejo-runner`
- Check runner logs: `journalctl -u forgejo-runner -n 50`
- Verify runner appears in Forgejo UI: https://forge.brakke.cc/erik/relay-chat/settings/actions/runners

**Deployment failing?**
- Check Docker is running: `docker ps`
- Verify repo path: `ls -la /root/relay-chat`
- Check docker-compose.prod.yml exists
- View container logs: `docker logs relay-chat-api-1`

**Actions not showing up?**
- Ensure Actions are enabled in repository settings
- Check workflow file syntax: `.forgejo/workflows/ci-cd.yml`
- Verify runner has correct labels (`docker`)

## 🔐 Security Considerations

**Current Setup:**
- Runner runs as root on svc-docker
- Has full Docker socket access
- Can execute arbitrary code in containers

**For Production:**
1. Consider running runner as non-root user (add to docker group)
2. Use Forgejo secrets for sensitive data
3. Limit runner to specific repositories
4. Review workflow permissions

## 📚 Full Documentation

See `FORGEJO_RUNNER_SETUP.md` for:
- Detailed architecture
- Alternative deployment methods
- Using Forgejo secrets for SSH
- Advanced configuration

## 🎯 Next Steps

After setup:
1. Test by making a small change and pushing to a branch
2. Verify CI runs and passes
3. Merge to master and verify auto-deployment
4. Set up branch protection to require CI passing
5. Add tests to the workflow (when available)

---

**Need Help?**
- Forgejo Actions Docs: https://forgejo.org/docs/latest/user/actions/
- Runner Docs: https://forgejo.org/docs/latest/admin/actions/runner-installation/
- Workflow Syntax: Same as GitHub Actions
