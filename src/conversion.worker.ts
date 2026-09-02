/// <reference lib="webworker" />

import type { FileData, FileFormat } from "./FormatHandler.js";
import type { LogLevel } from "./ui/ProgressStore.js";

type ConvertRequest = {
  id: number;
  handler: string;
  files: FileData[];
  inputFormat: FileFormat;
  outputFormat: FileFormat;
  args?: string[];
};

const scope = self as DedicatedWorkerGlobalScope;
(globalThis as unknown as { window: unknown }).window = globalThis;
const handlersPromise = import("./handlers/index.js").then(
  (module) => module.default,
);

scope.onmessage = async (event: MessageEvent<ConvertRequest>) => {
  const request = event.data;
  const handlers = await handlersPromise;
  const handler = handlers.find(
    (candidate) =>
      candidate.name === request.handler && !candidate.requiresMainThread,
  );
  if (!handler) {
    scope.postMessage({
      id: request.id,
      type: "error",
      error: new Error(
        `Handler "${request.handler}" is not available in the conversion worker.`,
      ),
    });
    return;
  }

  try {
    if (!handler.ready) await handler.init();
    let currentProgress = 0;
    const ctx = {
      progress(
        message: string,
        value: number | ((previous: number) => number),
      ) {
        currentProgress =
          typeof value === "function" ? value(currentProgress) : value;
        scope.postMessage({
          id: request.id,
          type: "progress",
          message,
          value: currentProgress,
        });
      },
      log(message: string, level: LogLevel = "log") {
        scope.postMessage({ id: request.id, type: "log", message, level });
      },
      signal: new AbortController().signal,
      throwIfAborted() {},
    };
    const files = await handler.doConvert(
      request.files,
      request.inputFormat,
      request.outputFormat,
      request.args,
      ctx,
    );
    scope.postMessage({ id: request.id, type: "result", files });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      type: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
};
