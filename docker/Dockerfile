FROM oven/bun:1 AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    git \
    && rm -rf /var/lib/apt/lists/*

# Dependencies are installed by Bazel with `bun install --ignore-scripts`, so
# puppeteer never downloads its own browser; point it at the system one.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN bun add --global @bazel/bazelisk
RUN printf 'common --curses=no --color=no --noshow_progress\ncommon --experimental_repository_downloader_retries=10\n' > /root/.bazelrc

# Fetch external repositories (node_modules, vendored sources) in their own
# layer so source changes don't re-run `bun install`. Only the files these
# repository rules read are copied here.
COPY .bazelrc .bazelversion .npmrc BUILD.bazel MODULE.bazel MODULE.bazel.lock \
    bun.lock package.json ./
COPY tools ./tools
COPY third_party ./third_party
COPY scripts ./scripts
COPY base.css buildCache.js favicon.ico index.html style.css tsconfig.json vite.config.js ./
# Fetch every repository the build targets need (not just our own three) so
# nothing is downloaded during analysis later; the network inside the build
# container is slow and those late downloads looked like a hang.
RUN bazel fetch --noincompatible_disallow_empty_glob //:export //:export_cache

COPY . .

RUN bun run build
RUN bun run cache:build

FROM nginx:stable-alpine AS runtime

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/convert

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
