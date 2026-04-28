#!/bin/bash

# deploy_agent.sh - Deploy EcoGuard Rust Agent as a systemd service (Fedora)
# Needs sudo to create service files and manage systemd

set -e

PROJECT_ROOT=$(pwd)
AGENT_DIR="$PROJECT_ROOT/ecoguard-agent"
SERVICE_NAME="ecoguard-agent.service"
BINARY_NAME="ecoguard-agent"
BINARY_PATH="$AGENT_DIR/target/release/$BINARY_NAME"

echo "🚀 Starting deployment of EcoGuard Agent..."

# 1. Compile in release mode
echo "📦 Compiling agent in release mode..."
cd "$AGENT_DIR"
cargo build --release

# 2. Create the systemd unit file
echo "⚙️  Creating systemd unit file..."
cat <<EOF | sudo tee /etc/systemd/system/$SERVICE_NAME
[Unit]
Description=EcoGuard Intelligent Edge Agent
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$AGENT_DIR
ExecStart=$BINARY_PATH
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 3. Reload systemd and start service
echo "🔄 Reloading systemd and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable $SERVICE_NAME
sudo systemctl restart $SERVICE_NAME

echo "✅ Deployment complete! Check status with: sudo systemctl status $SERVICE_NAME"
echo "📜 Logs can be viewed with: journalctl -u $SERVICE_NAME -f"
