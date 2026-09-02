#!/bin/sh
# usage: export.sh <runfile path>=<checkout path>...
#
# Copies build outputs out of Bazel into the checkout, for tools that expect
# them there (electron-builder, docker, static hosting).
set -eu

runfiles="$0.runfiles/_main"
manifest="${RUNFILES_MANIFEST_FILE:-$0.runfiles/MANIFEST}"

# rlocation <path>: runfiles tree where it exists, otherwise (Windows, no
# --enable_runfiles) look the path up in the runfiles manifest.
rlocation() {
  if [ -e "$runfiles/$1" ]; then
    echo "$runfiles/$1"
  else
    case "$1" in
      ../*) key="${1#../}" ;;   # external repository
      *) key="_main/$1" ;;
    esac
    grep "^$key " "$manifest" | cut -d' ' -f2- | head -n1
  fi
}

cd "$BUILD_WORKSPACE_DIRECTORY"

for pair in "$@"; do
  src="$(rlocation "${pair%%=*}")"
  [ -n "$src" ] || { echo "export.sh: ${pair%%=*} not in runfiles" >&2; exit 1; }
  dest="${pair#*=}"
  [ -e "$dest" ] && chmod -R u+w "$dest"
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -rL "$src" "$dest"
  chmod -R u+w "$dest" # bazel outputs are read-only
  echo "exported $dest"
done
