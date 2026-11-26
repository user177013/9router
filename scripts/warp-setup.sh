#!/usr/bin/env bash
# Backward-compatible Linux entry point. The cross-platform implementation is
# scripts/warp-setup.mjs; run it with `node scripts/warp-setup.mjs` anywhere.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/warp-setup.mjs" "$@"
