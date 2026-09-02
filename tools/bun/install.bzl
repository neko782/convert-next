"""Repository rule that runs `bun install` and exposes the resulting node_modules."""

_BUILD = """\
package(default_visibility = ["//visibility:public"])

exports_files(["package.json"])

filegroup(
    name = "node_modules",
    srcs = glob(["node_modules/**"]),
)
"""

def _bun_install_impl(rctx):
    bun = rctx.which("bun")
    if not bun:
        fail("bun_install: `bun` not found on PATH")

    # re-run when the host bun is replaced (e.g. version upgrade)
    rctx.watch(bun.realpath)

    for label in [rctx.attr.package_json, rctx.attr.lockfile] + rctx.attr.extra_files:
        # copy rather than symlink so bun can never touch the workspace files
        rctx.file(label.name, rctx.read(rctx.path(label)))

    # --ignore-scripts also skips binary downloads (puppeteer's chromium,
    # electron); the browser comes from PUPPETEER_EXECUTABLE_PATH instead.
    result = rctx.execute(
        [bun, "install", "--frozen-lockfile", "--ignore-scripts", "--no-progress"],
        quiet = False,
        timeout = 1200,
    )
    if result.return_code != 0:
        fail("bun install failed:\n%s%s" % (result.stdout, result.stderr))

    # npm packages occasionally ship Bazel files; they would turn directories
    # into packages and break the glob above.
    result = rctx.execute([
        "find",
        "node_modules",
        "(",
        "-name",
        "BUILD",
        "-o",
        "-name",
        "BUILD.bazel",
        "-o",
        "-name",
        "WORKSPACE",
        "-o",
        "-name",
        "MODULE.bazel",
        ")",
        "-type",
        "f",
        "-delete",
    ])
    if result.return_code != 0:
        fail("cleaning node_modules failed:\n%s" % result.stderr)

    rctx.file("BUILD.bazel", _BUILD)

bun_install = repository_rule(
    implementation = _bun_install_impl,
    attrs = {
        "package_json": attr.label(mandatory = True, allow_single_file = True),
        "lockfile": attr.label(mandatory = True, allow_single_file = True),
        "extra_files": attr.label_list(allow_files = True, doc = "e.g. .npmrc"),
    },
    local = False,
    doc = "Runs `bun install --frozen-lockfile` with the host bun; not hermetic " +
          "(the resulting node_modules depends on the host platform and bun version).",
)
