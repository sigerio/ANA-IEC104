#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
cargo tauri build --target x86_64-pc-windows-msvc --ci
