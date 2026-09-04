import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import normalizeMimeType from "../normalizeMimeType.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { WaveFile } from "wavefile";
import initReflo, {
  decode as refloDecode,
  encode as refloEncode,
  get_flo_file_info,
} from "@flo-audio/reflo";
import refloWasmUrl from "node_modules/@flo-audio/reflo/reflo_bg.wasm?url";

type Pcm = { samples: Float32Array; sampleRate: number; channels: number };

function baseName(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

function wavToPcm(bytes: Uint8Array): Pcm {
  const wav = new WaveFile(bytes);
  const fmt = wav.fmt as { numChannels: number; sampleRate: number };
  // 32-bit float, interleaved, normalized to -1..1
  wav.toBitDepth("32f");
  const samples = wav.getSamples(true, Float32Array) as unknown as Float32Array;
  return { samples, sampleRate: fmt.sampleRate, channels: fmt.numChannels };
}

function pcmToWav(pcm: Pcm): Uint8Array {
  const wav = new WaveFile();
  wav.fromScratch(pcm.channels, pcm.sampleRate, "32f", pcm.samples);
  return wav.toBuffer();
}

class floHandler implements FormatHandler {
  public name: string = "floHandler";
  public supportedFormats: FileFormat[] = [
    {
      name: "Flo Audio",
      format: "flo",
      extension: "flo",
      mime: normalizeMimeType("audio/flo"),
      from: true,
      to: true,
      internal: "flo",
      category: Category.AUDIO,
      lossless: false,
    },
    CommonFormats.WAV.builder("wav").allowFrom().allowTo().markLossless(),
    {
      name: "Raw PCM Float32LE",
      format: "f32le",
      extension: "pcm",
      mime: normalizeMimeType("video/f32le"),
      from: true,
      to: true,
      internal: "f32le",
      category: Category.AUDIO,
      lossless: true,
    },
  ];
  public ready: boolean = false;

  async init() {
    await initReflo(refloWasmUrl);
    this.ready = true;
  }

  async doConvert(
    inputFiles: FileData[],
    inputFormat: FileFormat,
    outputFormat: FileFormat,
  ): Promise<FileData[]> {
    if (!inputFiles || inputFiles.length === 0)
      throw new RangeError("No input files.");

    const inputIsFlo = inputFormat.internal === "flo";
    const outputIsFlo = outputFormat.internal === "flo";
    if (inputIsFlo === outputIsFlo) {
      throw new TypeError(
        `floHandler: unsupported conversion ${inputFormat.format} -> ${outputFormat.format}`,
      );
    }

    const outputFiles: FileData[] = [];
    for (const file of inputFiles) {
      const bytes = new Uint8Array(file.bytes);
      const name = baseName(file.name);

      if (inputIsFlo) {
        const samples = refloDecode(bytes);
        const info = get_flo_file_info(bytes);
        const pcm: Pcm = {
          samples,
          sampleRate: info.sample_rate,
          channels: info.channels,
        };

        if (outputFormat.internal === "wav") {
          outputFiles.push({ bytes: pcmToWav(pcm), name: name + ".wav" });
        } else if (outputFormat.internal === "f32le") {
          outputFiles.push({
            bytes: new Uint8Array(
              samples.buffer,
              samples.byteOffset,
              samples.byteLength,
            ),
            name: name + ".pcm",
          });
        } else {
          throw new TypeError(
            `floHandler: unsupported target ${outputFormat.format}`,
          );
        }
      } else {
        let pcm: Pcm;
        if (inputFormat.internal === "wav") {
          pcm = wavToPcm(bytes);
        } else if (inputFormat.internal === "f32le") {
          // Raw float32 has no header; assume 44.1kHz mono.
          const aligned = bytes.byteLength - (bytes.byteLength % 4);
          pcm = {
            samples: new Float32Array(bytes.buffer.slice(0, aligned)),
            sampleRate: 44100,
            channels: 1,
          };
        } else {
          throw new TypeError(
            `floHandler: unsupported source ${inputFormat.format}`,
          );
        }
        const flo = refloEncode(
          pcm.samples,
          pcm.sampleRate,
          pcm.channels,
          32,
          null,
        );
        outputFiles.push({ bytes: flo, name: name + ".flo" });
      }
    }
    return outputFiles;
  }
}

export default floHandler;
