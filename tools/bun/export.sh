#!/bin/sh
# usage: export.sh <runfile path>=<checkout path>...
#
# Copies build outputs out of Bazel into the checkout, for tools that expect
# them there (electron-builder, docker, static hosting).
set -eu

runfiles="$0.runfiles/_main"
cd "$BUILD_WORKSPACE_DIRECTORY"

for pair in "$@"; do
  src="$runfiles/${pair%%=*}"
  dest="${pair#*=}"
  [ -e "$dest" ] && chmod -R u+w "$dest"
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -rL "$src" "$dest"
  chmod -R u+w "$dest" # bazel outputs are read-only
  echo "exported $dest"
done
