"""bun_run: run a bun command over the workspace sources as a Bazel action.

The action stages a private copy of the workspace: `srcs` are copied (bun and
friends resolve imports from the real path of a file, so symlinks would escape
the build tree), `node_modules` and generated inputs (`gen_srcs`) are linked
into the position they have in a checkout. `cmd` then runs inside that copy.

Invoke package binaries by path (`bun node_modules/vite/bin/vite.js`), never
through `bunx`, which silently auto-installs anything it cannot find.

Substitutions available in `cmd`:
  $(OUT_DIR)      absolute path of the `out_dir` tree artifact
  $(OUTS)         absolute paths of `outs`, space separated
  $(location ..)  usual Bazel location expansion over srcs/gen_srcs/data;
                  these are relative to the execroot, prefix with $EXECROOT/
"""

_SCRIPT = """\
#!/bin/sh
set -eu

EXECROOT="$PWD"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

while read -r f; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp -L "$f" "$STAGE/$f"
done <<'EOF'
{srcs}
EOF

while read -r dest && read -r src; do
  mkdir -p "$STAGE/$(dirname "$dest")"
  ln -s "$EXECROOT/$src" "$STAGE/$dest"
done <<'EOF'
{links}
EOF

cd "$STAGE"

# never fall back to fetching packages from the registry
bun() {{
  command bun --no-install "$@"
}}

{cmd}
"""

def _bun_run_impl(ctx):
    outputs = []
    subs = {}

    if ctx.attr.out_dir:
        out_dir = ctx.actions.declare_directory(ctx.attr.out_dir)
        outputs.append(out_dir)
        subs["$(OUT_DIR)"] = "$EXECROOT/" + out_dir.path
    subs["$(OUTS)"] = " ".join(["$EXECROOT/" + f.path for f in ctx.outputs.outs])
    outputs.extend(ctx.outputs.outs)
    if not outputs:
        fail("bun_run needs `out_dir` and/or `outs`")

    cmd = ctx.expand_location(ctx.attr.cmd, ctx.attr.srcs + ctx.attr.gen_srcs + ctx.attr.data)
    for key, value in subs.items():
        cmd = cmd.replace(key, value)

    for f in ctx.files.srcs:
        if f.short_path.startswith("../"):
            fail("srcs must belong to the main repository: %s" % f.short_path)

    node_modules = None
    for f in ctx.files.node_modules:
        idx = f.path.find("/node_modules/")
        if idx != -1:
            node_modules = f.path[:idx + len("/node_modules")]
            break
    if not node_modules:
        fail("node_modules attr does not contain a node_modules directory")

    links = {"node_modules": node_modules}
    for f in ctx.files.gen_srcs:
        if f.is_source or f.short_path.startswith("../"):
            fail("gen_srcs must be generated files of the main repository: %s" % f.short_path)
        links[f.short_path] = f.path

    script = ctx.actions.declare_file(ctx.label.name + ".sh")
    ctx.actions.write(
        output = script,
        is_executable = True,
        content = _SCRIPT.format(
            srcs = "\n".join([f.path for f in ctx.files.srcs]),
            links = "\n".join(["%s\n%s" % (dest, src) for dest, src in links.items()]),
            cmd = cmd,
        ),
    )

    ctx.actions.run(
        executable = script,
        inputs = depset(
            ctx.files.srcs + ctx.files.gen_srcs + ctx.files.data + ctx.files.node_modules,
        ),
        outputs = outputs,
        env = ctx.attr.env,
        use_default_shell_env = True,
        mnemonic = "BunRun",
        progress_message = "bun: %s" % ctx.attr.cmd,
    )

    return DefaultInfo(files = depset(outputs))

bun_run = rule(
    implementation = _bun_run_impl,
    attrs = {
        "cmd": attr.string(mandatory = True),
        "srcs": attr.label_list(allow_files = True),
        "gen_srcs": attr.label_list(
            allow_files = True,
            doc = "Generated files, linked into their source-tree position before running",
        ),
        "data": attr.label_list(allow_files = True),
        "node_modules": attr.label(mandatory = True, allow_files = True),
        "out_dir": attr.string(),
        "outs": attr.output_list(),
        "env": attr.string_dict(),
    },
)
