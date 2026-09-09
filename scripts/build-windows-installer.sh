#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
cargo tauri build --target x86_64-pc-windows-msvc --ci

app_version=$(node -p "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json', 'utf8')).version")
build_dir="src-tauri/target/x86_64-pc-windows-msvc/release"
release_dir="release/$app_version"
mkdir -p "$release_dir"
cp "$build_dir/ana-iec104.exe" "$release_dir/ANA-IEC104_${app_version}_x64.exe"
cp "$build_dir/bundle/nsis/ANA IEC104_${app_version}_x64-setup.exe" "$release_dir/ANA-IEC104_${app_version}_x64-setup.exe"
(
  cd "$release_dir"
  sha256sum "ANA-IEC104_${app_version}_x64.exe" "ANA-IEC104_${app_version}_x64-setup.exe" > SHA256SUMS.txt
  sha256sum --check SHA256SUMS.txt
)
printf '\n打包完成：%s/%s\n' "$PWD" "$release_dir"
