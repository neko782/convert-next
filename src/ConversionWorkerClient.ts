import type { FileData, FileFormat, FormatHandler } from "./FormatHandler.js";
import { cloneFormat } from "./FormatHandler.js";
import type { ConvertContext, LogLevel } from "./ui/ProgressStore.js";

type WorkerRequest = {
  id: number;
  handler: string;
  files: FileData[];
  inputFormat: FileFormat;
  outputFormat: FileFormat;
  args?: string[];
};

type WorkerResponse =
  | { id: number; type: "progress"; message: string; value: number }
  | { id: number; type: "log"; message: string; level: LogLevel }
  | { id: number; type: "result"; files: FileData[] }
  | { id: number; type: "error"; error: Error };

let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL("./conversion.worker.ts", import.meta.url), {
    type: "module",
  });
  return worker;
}

export async function convertInWorker(
  handler: FormatHandler,
  files: FileData[],
  inputFormat: FileFormat,
  outputFormat: FileFormat,
  args: string[] | undefined,
  ctx: ConvertContext,
): Promise<FileData[]> {
  ctx.throwIfAborted();
  const activeWorker = getWorker();
  const id = ++nextId;

  return new Promise<FileData[]>((resolve, reject) => {
    const cleanup = () => {
      activeWorker.removeEventListener("message", onMessage);
      activeWorker.removeEventListener("error", onWorkerError);
      ctx.signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      activeWorker.terminate();
      if (worker === activeWorker) worker = undefined;
      reject(new DOMException("Conversion cancelled", "AbortError"));
    };
    const onWorkerError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "Conversion worker failed"));
    };
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.id !== id) return;
      if (response.type === "progress") {
        ctx.progress(response.message, response.value);
      } else if (response.type === "log") {
        ctx.log(response.message, response.level);
      } else if (response.type === "result") {
        cleanup();
        resolve(response.files);
      } else if (response.type === "error") {
        cleanup();
        reject(response.error);
      }
    };

    activeWorker.addEventListener("message", onMessage);
    activeWorker.addEventListener("error", onWorkerError);
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    activeWorker.postMessage({
      id,
      handler: handler.name,
      files,
      inputFormat: cloneFormat(inputFormat),
      outputFormat: cloneFormat(outputFormat),
      args,
    } satisfies WorkerRequest);
  });
}
