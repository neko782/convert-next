#!/bin/sh
# usage: dev.sh <@npm package.json> <generated path>... -- [bun args]
#
# Runs bun in the checkout (not the sandbox) with Bazel's node_modules and
# generated files linked into the places the source tree expects them.
# Without bun args, starts the vite dev server.
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

# link <target> <path>: place a symlink at <path>, leaving real files alone
link() {
  if [ -e "$2" ] && [ ! -L "$2" ]; then
    echo "dev.sh: $2 exists, leaving it alone" >&2
    return
  fi
  mkdir -p "$(dirname "$2")"
  ln -sfn "$1" "$2"
}

link "$(dirname "$(readlink -f "$(rlocation "$1")")")/node_modules" node_modules
shift
while [ "$1" != "--" ]; do
  link "$(readlink -f "$(rlocation "$1")")" "$1"
  shift
done
shift

if [ "$#" -eq 0 ]; then
  set -- node_modules/vite/bin/vite.js
fi

# --no-install: never fall back to fetching packages from the registry
exec bun --no-install "$@"
