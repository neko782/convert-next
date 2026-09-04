import CommonFormats from "src/CommonFormats.ts";
import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import { SimpleTTS } from "third_party/generated/espeakng.js/js/espeakng-simple.js";
import { WaveFile } from "wavefile";
import "third_party/generated/espeakng.js/js/espeakng.worker.data?url";
import espeakWorkerUrl from "third_party/generated/espeakng.js/js/espeakng.worker.js?url";

export class espeakngHandler implements FormatHandler {
  public name: string = "espeakng";
  public ready: boolean = true;
  #tts: SimpleTTS | undefined = undefined;

  public supportedFormats: FileFormat[] = [
    CommonFormats.TEXT.supported("text", true, false),
    CommonFormats.WAV.supported("wav", false, true),
  ];

  async init() {
    this.ready = true;
  }

  // here so we lazy load the TTS instead of waiting for it in `init`
  async getTTS(): Promise<SimpleTTS> {
    if (this.#tts == undefined) {
      await new Promise<void>((resolve) => {
        this.#tts = new SimpleTTS({
          workerPath: espeakWorkerUrl,
          defaultVoice: "en",
          defaultRate: 220,
          defaultPitch: 200,
          enhanceAudio: true,
        });
        this.#tts.onReady(() => {
          resolve();
        });
      });
    }
    return this.#tts!;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    const tts = await this.getTTS();
    return Promise.all(
      inputFiles.map(async (file) => {
        const samples = await new Promise<Float32Array>((resolve) => {
          tts.speak(
            new TextDecoder().decode(file.bytes),
            (audio: Float32Array) => resolve(audio),
          );
        });
        const wav = new WaveFile();
        // Increasing pitch doesn't seem to do anything, so instead we
        // decrease playback rate and increase playback sample rate
        wav.fromScratch(1, tts.sampleRate * 1.4, "32f", samples);
        return {
          name: file.name.split(".").slice(0, -1).join(".") + ".wav",
          bytes: wav.toBuffer(),
        };
      }),
    );
  }
}

export default espeakngHandler;
