# Convert-next

My fork of [p2r3's convert](https://github.com/p2r3/convert), focused on fast-paced development and correctness.

**Truly universal online file converter.**

Many online file conversion tools are **boring** and **insecure**. They only allow conversion between two formats in the same medium (images to images, videos to videos, etc.), and they require that you _upload your files to some server_.

This is not just terrible for privacy, it's also incredibly lame. What if you _really_ need to convert an AVI video to a PDF document? Try to find an online tool for that, I dare you.

[Convert-next](https://neko782.github.io/convert-next/) aims to be a tool that "just works". You're almost _guaranteed_ to get an output - perhaps not always the one you expected, but it'll try its best to not leave you hanging.

For a semi-technical overview of this tool, check out the video: https://youtu.be/btUbcsTbVA8

## Usage

1. Go to https://neko782.github.io/convert-next/
2. Click the big blue box to add your file (or just drag it on to the window).
3. An input format should have been automatically selected. If it wasn't, yikes! Try searching for it, or if it's really not there, see the "Issues" section below.
4. Select an output format from the second list. If you're on desktop, that's the one on the right side. If you're on mobile, it'll be somewhere lower down.
5. Click **Convert**!
6. Hopefully, after a bit (or a lot) of thinking, the program will spit out the file you wanted. If not, see the "Issues" section below.

## Issues

Ever since the YouTube video released, we've been getting spammed with issues suggesting the addition of all kinds of niche file formats. To keep things organized, I've decided to specify what counts as a valid issue and what doesn't.

> [!IMPORTANT]
> **SIMPLY ASKING FOR A FILE FORMAT TO BE ADDED IS NOT A MEANINGFUL ISSUE!**

There are thousands of file formats out there. It can take hours to add support for just one. The math is simple - we can't possibly support every single file. As such, simply listing your favorite file formats is not helpful. We already know that there are formats we don't support, we don't need tickets to tell us that.

When suggesting a file format, you must _at minimum_:

- Make sure that there isn't already an issue about the same thing, and that we don't already support the format.
- Explain what you expect the conversion to be like (what medium is it converting to/from). It's important to note here that simply parsing the underlying data is _not sufficient_. Imagine if we only treated SVG images as raw XML data and didn't support converting them to raster images - that would defeat the point. In other words, try to avoid crude "binary waterfalls".
- Provide links to existing browser-based solutions if possible, or at the very least a reference for implementing the format, and make sure the license is compatible with GPL-2.0.

If this seems like a lot, please remember - a developer will have to do 100x more work to actually implement the format. Doing a bit of research not only saves them precious time, it also weeds out "unserious" proposals that would only bloat our to-do list.

**If you're submitting a bug report,** you only need to do step 1 - check if the problem isn't already reported by someone else. Bug reports are generally quite important otherwise.

Though please note, "converting X to Y doesn't work" is **not** a bug report. However, "converting X to Y works but not how I expected" likely **is** a bug report.

## Deployment

### Local development (Bun + Bazel + Vite)

1. Clone this repository with `git clone https://github.com/neko782/convert-next`.
2. Install [Bun](https://bun.sh/) (the version in `.bun-version`).
3. Install [Bazelisk](https://github.com/bazelbuild/bazelisk). It reads `.bazelversion` and fetches the right Bazel automatically.
   - Alternatively, if you use Nix, `nix develop` provides everything.
4. Run `bun run dev` to start the development server.

### Building the format cache

When the page first loads, it initializes each handler to discover formats. This may take a long time in production, so you can generate `cache.json` in your deployment. I recommend only using it in production, your changes might not apply when a cache is present.

To generate the cache automatically, run `bun run cache:build`. Docker does it automatically.

### Docker (prebuilt image)

Docker compose files live in the `docker/` directory, so run compose with `-f` from the repository root:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Alternatively download the `docker-compose.yml` separately and start it by executing `docker compose up -d` in the same directory.

This runs the container on `http://localhost:8080/convert/`.

### Docker (local build for development)

Use the override file to build the image locally:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up --build -d
```

The first Docker build is expected to be slow because Chromium and related system packages are installed in the build stage (needed for puppeteer in `buildCache.js`). Later builds are usually much faster due to Docker layer caching.

## Contributing

The best way to contribute is by adding support for new file formats (duh). If you don't have a format to add but are eager to help, take a look at our issues. There are plenty of suggestions there.

Here's how adding a format works works:

### Creating a handler

Each "tool" used for conversion has to be normalized to a standard form - effectively a "wrapper" that abstracts away the internal processes. These wrappers are available in [src/handlers](src/handlers/).

Below is a super barebones handler that does absolutely nothing. You can use this as a starting point for adding a new format:

```ts
// file: dummy.ts

import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";

class dummyHandler implements FormatHandler {
  public name: string = "dummy";
  public supportedFormats: FileFormat[] = [
    // Example PNG format, with both input and output disabled
    CommonFormats.PNG.builder("png")
      .markLossless()
      .allowFrom(false)
      .allowTo(false),

    // Alternatively, if you need a custom format, define it like so:
    {
      name: "CompuServe Graphics Interchange Format (GIF)",
      format: "gif",
      extension: "gif",
      mime: "image/gif",
      from: false,
      to: false,
      internal: "gif",
      category: [Category.IMAGE, CATEGORY.VIDEO], // See src/CommonFormats.ts for valid categories
      lossless: false,
    },
  ];
  public ready: boolean = false;

  async init() {
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const outputFiles: FileData[] = [];
    return outputFiles;
  }
}

export default dummyHandler;
```

For more details on how all of these components work, refer to the doc comments in [src/FormatHandler.ts](src/FormatHandler.ts). You can also take a look at existing handlers to get a more practical example.

There are a few additional things that I want to point out in particular:

- Pay attention to the naming system. If your tool is called `dummy`, then the class should be called `dummyHandler`, and the file should be called `dummy.ts`.
- The handler is responsible for setting the output file's name. This is done to allow for flexibility in rare cases where the _full_ file name matters. Of course, in most cases, you'll only have to swap the file extension.
- The handler is also responsible for ensuring that any byte buffers that enter or exit the handler _do not get mutated_. If necessary, clone the buffer by wrapping it in `new Uint8Array()`.
- When handling MIME types, run them through [normalizeMimeType](src/normalizeMimeType.ts) first. One file can have multiple valid MIME types, which isn't great when you're trying to match them algorithmically.
- Your handler may run in a web worker. Try to not use DOM APIs (ex. OffscreenCanvas instead of HTMLCanvasElement) and, as a last resort, use `requiresMainThread`.
- When implementing/suggesting a new file format, please treat the file as the media that it represents, not the data that it contains. For example, if you were making an SVG handler, you should treat the file as an _image_, not as XML. In other words, avoid simple "binary waterfalls", as they're not semantically meaningful.

### Testing

This project currently uses two levels of tests:

- Broad project-level tests live directly in `test/` (for example graph traversal and end-to-end conversion smoke tests).
- Optional handler-specific unit tests live in `test/handlers/`, using the file name pattern `<handlerName>.test.ts`. These are a good fit for handlers with meaningful parsing, serialization, or file-naming logic that is hard to exercise reliably through traversal alone.

Not every handler needs a dedicated unit test, but handlers with non-trivial custom internal logic may benefit from having one.

### Adding dependencies

If your tool requires an external dependency (which it likely does), there are currently two well-established ways of going about this:

- If it's an `npm` package, just install it to the project like you normally would.
- If it's a Git repository or other project, add a pinned `http_archive` to [MODULE.bazel](MODULE.bazel) with a `third_party/<name>.BUILD.bazel` listing the files you need, plus a `vendor_tree` target in [third_party/BUILD.bazel](third_party/BUILD.bazel). Import the files as `third_party/generated/<name>/...`.

**Please try to avoid CDNs (Content Delivery Networks).** They're really cool on paper, but they don't work well with TypeScript, and each one introduces a tiny bit of instability. For a project that leans heavily on external dependencies, those bits of instability can add up fast.

- If you need to load a WebAssembly binary (or similar), use `import x from "folder/something.wasm?url"`.

### AI Usage Policy

If you intend to use an LLM, agent-enabled IDE, or other AI-driven tool for your contribution, please follow these guidelines:

- Clearly state that you've used an LLM, ideally in your pull request's description. Do not attempt to pass off an AI's work as your own.
- Explain what you (and the LLM) are doing, in a way that makes it clear that you understand the changes you're making.
- Do not write PR descriptions or issues with an LLM.

Not adhering to these rules will likely get your pull request closed.
