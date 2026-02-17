# Distribution Guide

This document is for **maintainers** who want to distribute the OpenClaw Relay Chat plugin to others.

## Creating a Distribution Package

### 1. Build the plugin

```bash
npm install
npm run build
```

This compiles TypeScript source to JavaScript in `dist/`.

### 2. Create the distribution zip

```bash
zip -r openclaw-plugin-relaychat.zip \
  dist/ \
  package.json \
  openclaw.plugin.json \
  install.sh \
  README.md \
  QUICKSTART.md
```

This creates `openclaw-plugin-relaychat.zip` (~84KB) containing:
- Compiled plugin code (`dist/`)
- Plugin metadata (`package.json`, `openclaw.plugin.json`)
- Installation script (`install.sh`)
- Documentation (`README.md`, `QUICKSTART.md`)

### 3. Distribute to users

Share the zip file with:

**Required information:**
- Relay-chat server URL (e.g., `https://chat.example.com`)
- Bot username they should use
- Link to relay-chat admin panel for creating bot tokens

**Installation instructions to include:**

```
1. Extract the zip file
2. Run ./install.sh
3. Get a bot token from the relay-chat admin panel
4. Edit ~/.openclaw/openclaw.json with your server details
5. Restart OpenClaw
```

## What Users Need

### From You (the distributor)

- ✅ The plugin zip file
- ✅ Relay-chat server URL
- ✅ Bot username to use (or let them choose)

### From Their Relay-chat Admin

- ✅ Bot token (created in admin panel)
- ✅ Bot bound to appropriate channels

### On Their System

- ✅ OpenClaw installed and running
- ✅ Network access to relay-chat server

## Sample Distribution Email

```
Subject: OpenClaw Relay Chat Plugin

Hi [Name],

Attached is the OpenClaw plugin for connecting to our relay-chat server.

Server Details:
- URL: https://chat.example.com
- Suggested bot username: openclaw

Installation:
1. Extract the attached zip file
2. cd openclaw-plugin-relaychat
3. ./install.sh
4. Get a bot token from [admin panel URL]
5. Edit ~/.openclaw/openclaw.json with the token
6. Restart OpenClaw

See QUICKSTART.md for detailed instructions.

Let me know if you run into any issues!
```

## Testing Before Distribution

Before distributing, test the plugin:

1. **Build fresh**:
   ```bash
   rm -rf dist/
   npm run build
   ```

2. **Create test zip**:
   ```bash
   zip -r test-plugin.zip dist/ package.json openclaw.plugin.json install.sh README.md QUICKSTART.md
   ```

3. **Test installation in clean environment**:
   ```bash
   # In a test directory
   unzip test-plugin.zip
   ./install.sh
   # Verify it prompts for configuration
   ```

4. **Test on production relay-chat**:
   - Configure with real bot token
   - Send @mention
   - Verify reply appears

## Version Management

When releasing updates:

1. **Update version** in `package.json`
2. **Update CHANGELOG** (if you maintain one)
3. **Rebuild**: `npm run build`
4. **Create new zip** with version in filename:
   ```bash
   zip -r openclaw-plugin-relaychat-v1.0.1.zip dist/ package.json openclaw.plugin.json install.sh README.md QUICKSTART.md
   ```

## Security Notes

⚠️ **Do NOT include** in distribution zip:
- Bot tokens (users must create their own)
- Production server URLs (unless public)
- Any `.env` files or secrets

✅ **Safe to include**:
- All files listed in zip creation command above
- Documentation
- Example configurations (with placeholders)
