# Forgejo Actions Runner Setup for Relay Chat

This document describes the CI/CD setup for the Relay Chat project using Forgejo Actions.

## Overview

- **Forgejo Instance**: forge.brakke.cc (v13.0.3, Gitea 1.22 based)
- **Repository**: erik/relay-chat
- **Production Host**: svc-docker (192.168.68.54)
- **Runner Location**: svc-docker (192.168.68.54)
- **Runner Binary**: `/opt/forgejo-runner/forgejo-runner`

## What's Already Done

1. ✅ Forgejo Runner v11.0.0 installed on svc-docker at `/opt/forgejo-runner/`
2. ✅ Default configuration file generated at `/opt/forgejo-runner/config.yml`
3. ✅ CI/CD workflow created at `.forgejo/workflows/ci-cd.yml`

## What the CI/CD Does

### CI Pipeline (on every push/PR)
- Checks out code
- Installs Node.js 20
- Builds API (`cd api && npm ci && npm run build`)
- Builds Frontend (`cd frontend && npm ci && npm run build`)
- Runs TypeScript type checking on both

### CD Pipeline (on push to master only)
- Runs CI first (needs to pass)
- SSHs into svc-docker
- Pulls latest code
- Runs `docker compose -f docker-compose.prod.yml up -d --build`
- Verifies containers are running

## Steps to Complete Setup

### 1. Get Registration Token from Forgejo

1. Go to https://forge.brakke.cc/erik/relay-chat/settings/actions/runners
2. Click "Create new Runner"
3. Copy the registration token

### 2. Register the Runner

SSH into svc-docker and register:

```bash
ssh root@192.168.68.54
cd /opt/forgejo-runner

# Register the runner (paste your token when prompted)
./forgejo-runner register

# When prompted:
# - Instance URL: https://forge.brakke.cc
# - Token: [paste the token from step 1]
# - Runner name: relay-chat-runner (or whatever you prefer)
# - Labels: docker:docker://node:20-bookworm
```

This will create a `.runner` file with registration credentials.

### 3. Set Up SSH Keys for Deployment

The runner needs to SSH into svc-docker to deploy. Since the runner IS on svc-docker, we can either:

**Option A: Use localhost** (simplest)
- The runner can execute docker commands directly
- Modify the workflow to remove SSH and just run docker commands locally

**Option B: Set up SSH key**
```bash
# On svc-docker
ssh-keygen -t ed25519 -f /opt/forgejo-runner/.ssh/id_ed25519 -N ""
cat /opt/forgejo-runner/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

### 4. Configure the Runner

Edit `/opt/forgejo-runner/config.yml` if needed:

```yaml
runner:
  capacity: 2  # Can run 2 jobs concurrently
  labels:
    - "docker:docker://node:20-bookworm"
```

### 5. Create Systemd Service

Create `/etc/systemd/system/forgejo-runner.service`:

```ini
[Unit]
Description=Forgejo Actions Runner
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/forgejo-runner
ExecStart=/opt/forgejo-runner/forgejo-runner daemon --config /opt/forgejo-runner/config.yml
Restart=always
RestartSec=10
Environment="DOCKER_HOST=unix:///var/run/docker.sock"

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable forgejo-runner
systemctl start forgejo-runner
systemctl status forgejo-runner
```

### 6. Enable Actions in Repository

1. Go to https://forge.brakke.cc/erik/relay-chat/settings
2. Click "Units" → "Overview"
3. Make sure "Actions" checkbox is ticked

### 7. Commit and Push the Workflow

```bash
cd /root/.openclaw/workspace-acid_burn/relay-chat
git add .forgejo/workflows/ci-cd.yml
git commit -m "Add CI/CD pipeline with Forgejo Actions"
git push origin master
```

### 8. Verify

1. Go to https://forge.brakke.cc/erik/relay-chat/actions
2. You should see the workflow running
3. Check the logs to ensure everything works

## Simplified Deployment (Runner on Same Host)

Since the runner is on svc-docker (same as production), we can simplify the deployment:

```yaml
- name: Deploy to production
  run: |
    cd /root/relay-chat
    git pull origin master
    docker compose -f docker-compose.prod.yml up -d --build
```

This requires:
1. Cloning the repo to `/root/relay-chat` on svc-docker
2. Ensuring the runner user has access

## Troubleshooting

### Check runner logs
```bash
journalctl -u forgejo-runner -f
```

### Check runner status
```bash
systemctl status forgejo-runner
```

### Test runner connectivity
```bash
cd /opt/forgejo-runner
./forgejo-runner daemon --config config.yml
# Press Ctrl+C to stop
```

### View workflow logs
Go to: https://forge.brakke.cc/erik/relay-chat/actions

## Security Notes

1. **SSH Keys**: For production, use Forgejo secrets to store SSH private keys
2. **Docker Socket**: The runner needs access to Docker socket - this is a security consideration
3. **Secrets**: Store sensitive data (API keys, passwords) in Forgejo repository secrets

## Alternative: Using Forgejo Secrets for SSH

To use secrets for SSH deployment:

1. Generate SSH key:
   ```bash
   ssh-keygen -t ed25519 -f relay-chat-deploy -N ""
   ```

2. Add public key to svc-docker:
   ```bash
   cat relay-chat-deploy.pub >> ~/.ssh/authorized_keys
   ```

3. Add private key to Forgejo secrets:
   - Go to https://forge.brakke.cc/erik/relay-chat/settings/secrets
   - Add secret: `DEPLOY_SSH_KEY` = contents of relay-chat-deploy

4. Update workflow to use the secret:
   ```yaml
   - name: Setup SSH
     run: |
       mkdir -p ~/.ssh
       echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
       chmod 600 ~/.ssh/id_ed25519
   ```

## Maintenance

- Runner updates: Download new binary and restart service
- Check runner status in Forgejo web UI under repository settings
- Monitor workflow runs for failures
