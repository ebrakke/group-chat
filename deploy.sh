#!/bin/bash
set -e

# Relay Chat Fly.io Deployment Script
# This script deploys all 4 services in the correct order

echo "🚀 Relay Chat Fly.io Deployment"
echo "================================"
echo ""

# Configuration
ORG="${FLY_ORG:-}"
REGION="${FLY_REGION:-iad}"
REPO_PATH="${REPO_PATH:-/root/.openclaw/workspace-acid_burn/relay-chat}"

if [ -z "$ORG" ]; then
  echo "❌ Error: FLY_ORG environment variable not set"
  echo "   Set it with: export FLY_ORG=your-org-name"
  exit 1
fi

if [ ! -d "$REPO_PATH" ]; then
  echo "❌ Error: Repository not found at $REPO_PATH"
  echo "   Set REPO_PATH to the relay-chat directory"
  exit 1
fi

echo "📋 Configuration:"
echo "   Organization: $ORG"
echo "   Region: $REGION"
echo "   Repository: $REPO_PATH"
echo ""

# Check if secrets are set
echo "🔑 Checking secrets..."
if [ -z "$SESSION_SECRET" ] || [ -z "$KEY_ENCRYPTION_SECRET" ]; then
  echo "⚠️  Secrets not found in environment"
  echo "   Generating random secrets..."
  SESSION_SECRET=$(openssl rand -hex 32)
  KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32)
  echo "   ✅ Generated SESSION_SECRET and KEY_ENCRYPTION_SECRET"
fi

if [ -z "$SERVER_PRIVKEY" ] || [ -z "$RELAY_PRIVKEY" ]; then
  echo "⚠️  Nostr keypairs not found in environment"
  echo "   Please run: node check-keys.js"
  echo "   Then set: export SERVER_PRIVKEY=... and export RELAY_PRIVKEY=..."
  exit 1
fi

if [ -z "$SERVER_PUBKEY" ]; then
  echo "⚠️  SERVER_PUBKEY not set (needed for ALLOWED_PUBKEYS)"
  echo "   Please set: export SERVER_PUBKEY=..."
  exit 1
fi

echo ""
echo "🔨 Step 1: Deploy API (relay-chat-api)"
echo "========================================"
cd "$REPO_PATH"

# Create the API app
echo "Creating app..."
fly apps create relay-chat-api --org "$ORG" || echo "App already exists"

# Create volume
echo "Creating volume..."
fly volumes create api_data --region "$REGION" --size 1 --app relay-chat-api || echo "Volume may already exist"

# Set secrets
echo "Setting secrets..."
fly secrets set \
  SESSION_SECRET="$SESSION_SECRET" \
  KEY_ENCRYPTION_SECRET="$KEY_ENCRYPTION_SECRET" \
  SERVER_PRIVKEY="$SERVER_PRIVKEY" \
  --app relay-chat-api

# Copy fly.toml
cp /root/.openclaw/workspace-flyio/relay-chat-configs/fly.api.toml fly.toml
cp /root/.openclaw/workspace-flyio/relay-chat-configs/Dockerfile.api api/Dockerfile

# Deploy
echo "Deploying..."
fly deploy --app relay-chat-api

echo "✅ API deployed"
echo ""

echo "🔨 Step 2: Deploy Relay (relay-chat-relay)"
echo "==========================================="

# Create the Relay app
echo "Creating app..."
fly apps create relay-chat-relay --org "$ORG" || echo "App already exists"

# Create volume
echo "Creating volume..."
fly volumes create relay_data --region "$REGION" --size 1 --app relay-chat-relay || echo "Volume may already exist"

# Set secrets
echo "Setting secrets..."
fly secrets set \
  RELAY_PRIVKEY="$RELAY_PRIVKEY" \
  ALLOWED_PUBKEYS="$SERVER_PUBKEY" \
  --app relay-chat-relay

# Copy fly.toml
cp /root/.openclaw/workspace-flyio/relay-chat-configs/fly.relay.toml fly.toml
cp /root/.openclaw/workspace-flyio/relay-chat-configs/Dockerfile.relay relay/Dockerfile

# Deploy
echo "Deploying..."
fly deploy --app relay-chat-relay

echo "✅ Relay deployed"
echo ""

echo "🔨 Step 3: Deploy Blossom (relay-chat-blossom)"
echo "==============================================="

# Create the Blossom app
echo "Creating app..."
fly apps create relay-chat-blossom --org "$ORG" || echo "App already exists"

# Create volume
echo "Creating volume..."
fly volumes create blossom_data --region "$REGION" --size 5 --app relay-chat-blossom || echo "Volume may already exist"

# Copy fly.toml
cp /root/.openclaw/workspace-flyio/relay-chat-configs/fly.blossom.toml fly.toml

# Deploy (uses pre-built image)
echo "Deploying..."
fly deploy --app relay-chat-blossom

echo "✅ Blossom deployed"
echo ""

echo "🔨 Step 4: Deploy Frontend (relay-chat-frontend)"
echo "================================================="

# Create the Frontend app
echo "Creating app..."
fly apps create relay-chat-frontend --org "$ORG" || echo "App already exists"

# Copy fly.toml and updated files
cp /root/.openclaw/workspace-flyio/relay-chat-configs/fly.frontend.toml fly.toml
cp /root/.openclaw/workspace-flyio/relay-chat-configs/Dockerfile.frontend frontend/Dockerfile
cp /root/.openclaw/workspace-flyio/relay-chat-configs/hooks.server.ts frontend/src/hooks.server.ts

# Deploy
echo "Deploying..."
fly deploy --app relay-chat-frontend

echo "✅ Frontend deployed"
echo ""

echo "🌐 Step 5: Configure Domain"
echo "============================"
echo "Run the following command to add your custom domain:"
echo ""
echo "  fly certs create chat.brakke.cc --app relay-chat-frontend"
echo ""
echo "Then add the DNS records provided by Fly.io to your DNS provider."
echo ""

echo "✅ Deployment Complete!"
echo "======================="
echo ""
echo "📊 Check status:"
echo "  fly status --app relay-chat-frontend"
echo "  fly status --app relay-chat-api"
echo "  fly status --app relay-chat-relay"
echo "  fly status --app relay-chat-blossom"
echo ""
echo "📋 View logs:"
echo "  fly logs --app relay-chat-api"
echo ""
echo "🔍 Test health:"
echo "  fly ssh console --app relay-chat-api"
echo "  curl http://relay-chat-api.flycast:4000/health"
echo ""
echo "🌍 Access your app (after DNS is configured):"
echo "  https://chat.brakke.cc"
echo ""
