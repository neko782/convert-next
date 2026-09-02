#!/bin/sh
# usage: export.sh <runfile path>=<checkout path>...
#
# Copies build outputs out of Bazel into the checkout, for tools that expect
# them there (electron-builder, docker, static hosting).
set -eu

runfiles="${RUNFILES_DIR:-$0.runfiles}/_main"
manifest="${RUNFILES_MANIFEST_FILE:-$0.runfiles/MANIFEST}"

# rlocation <path>: runfiles tree where it exists, otherwise (Windows, no
# --enable_runfiles) look the path up in the runfiles manifest.
rlocation() {
  path="$1"
  # $(rootpath) may yield "./foo" on some hosts; manifest keys never have "./".
  while [ "${path#./}" != "$path" ]; do path="${path#./}"; done
  if [ -e "$runfiles/$path" ]; then
    echo "$runfiles/$path"
  elif [ -f "$manifest" ]; then
    case "$path" in
      ../*) key="${path#../}" ;;   # external repository
      *) key="_main/$path" ;;
    esac
    grep "^$key " "$manifest" | cut -d' ' -f2- | head -n1 | tr -d '\r'
  fi
}

cd "$BUILD_WORKSPACE_DIRECTORY"

for pair in "$@"; do
  src="$(rlocation "${pair%%=*}")"
  [ -n "$src" ] || {
    echo "export.sh: ${pair%%=*} not in runfiles (runfiles=$runfiles manifest=$manifest)" >&2
    exit 1
  }
  dest="${pair#*=}"
  [ -e "$dest" ] && chmod -R u+w "$dest"
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  cp -rL "$src" "$dest"
  chmod -R u+w "$dest" # bazel outputs are read-only
  echo "exported $dest"
done
