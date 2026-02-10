#!/bin/bash
# Pre-push build check for Clown Roast Battle frontend
# Run this before pushing to catch type errors locally

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

echo "🤡 Clown Roast Battle - Build Check"
echo "===================================="

cd "$FRONTEND_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🔍 Running TypeScript type check..."
npx tsc --noEmit

echo ""
echo "🏗️  Running production build..."
npm run build

echo ""
echo "✅ Build check passed! Safe to push."
