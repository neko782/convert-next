import type { FileData, FileFormat, FormatHandler } from "../FormatHandler.ts";
import CommonFormats, { Category } from "src/CommonFormats.ts";
import { QOAEncoder, QOADecoder, QOABase } from "qoa-fu";
import { WaveFile } from "wavefile";
import { BadMagicError, EOFError, InitializationError } from "src/errors.ts";

class uint8ArrayQOADecoder extends QOADecoder {
  private data: Uint8Array;
  private pos = 0;

  constructor(data: Uint8Array) {
    super();
    this.data = data;
  }

  protected readByte(): number {
    if (this.pos >= this.data.length) {
      return -1;
    }
    return this.data[this.pos++];
  }

  protected seekToByte(position: number): void {
    this.pos = position;
  }
}

class uint8ArrayQOAEncoder extends QOAEncoder {
  private buffer: Uint8Array;
  private pos = 0;

  constructor(estimatedSize: number) {
    super();
    this.buffer = new Uint8Array(estimatedSize);
  }

  protected writeLong(l: bigint): boolean {
    for (let i = 7; i >= 0; i--) {
      this.buffer[this.pos++] = Number((l >> BigInt(i * 8)) & 0xffn);
    }
    return true;
  }

  public getData(): Uint8Array {
    return this.buffer.subarray(0, this.pos);
  }
}

class qoaFuHandler implements FormatHandler {
  public name: string = "qoa-fu";
  public supportedFormats: FileFormat[] = [
    {
      name: "Quite OK Audio",
      format: "qoa",
      extension: "qoa",
      mime: "audio/x-qoa", // I have to put something here
      from: true,
      to: true,
      internal: "qoa",
      category: Category.AUDIO,
      lossless: false,
    },
    CommonFormats.WAV.builder("wav").allowFrom(true).allowTo(true),
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
    if (!this.ready) {
      throw new InitializationError("Handler not initialized.");
    }

    const outputFiles: FileData[] = [];

    const inputIsQOA = inputFormat.internal === "qoa";
    const outputIsQOA = outputFormat.internal === "qoa";

    if (inputIsQOA === outputIsQOA) {
      throw new TypeError(
        `Unsupported conversion path: ${inputFormat.internal} -> ${outputFormat.internal}`,
      );
    }

    if (inputIsQOA) {
      // QOA => WAV
      for (const inputFile of inputFiles) {
        const decoder = new uint8ArrayQOADecoder(inputFile.bytes);
        if (!decoder.readHeader()) {
          throw new Error("Invalid QOA header.");
        }
        const audioData = new Int16Array(
          decoder.getTotalSamples() * decoder.getChannels(),
        );
        let pos = 0;
        while (!decoder.isEnd()) {
          pos +=
            decoder.readFrame(
              audioData.subarray(
                pos,
                Math.min(
                  QOABase.MAX_FRAME_SAMPLES * decoder.getChannels() + pos,
                  decoder.getTotalSamples() * decoder.getChannels(),
                ),
              ),
            ) * decoder.getChannels();
        }

        const wav = new WaveFile();
        wav.fromScratch(
          decoder.getChannels(),
          decoder.getSampleRate(),
          "16",
          audioData,
        );

        const wavBytes = wav.toBuffer();
        const name = inputFile.name.split(".").slice(0, -1).join(".") + ".wav";
        outputFiles.push({ bytes: wavBytes, name });
      }
    } else {
      // WAV => QOA
      for (const inputFile of inputFiles) {
        const wav = new WaveFile(new Uint8Array(inputFile.bytes));
        const fmt = wav.fmt as { numChannels: number; sampleRate: number };
        const channels = fmt.numChannels;
        const sampleRate = fmt.sampleRate;
        // QOA is 16-bit; let wavefile handle the conversion from any depth.
        wav.toBitDepth("16");
        const interleaved = wav.getSamples(
          true,
          Int16Array,
        ) as unknown as Int16Array;
        const totalSamples = Math.floor(interleaved.length / channels);

        const encoder = new uint8ArrayQOAEncoder(
          (totalSamples * channels * 4) / 8 + 4096,
        );
        if (!encoder.writeHeader(totalSamples, channels, sampleRate)) {
          throw new Error("Failed to write QOA header.");
        }

        let offset = 0;
        while (offset < totalSamples) {
          const frameSamples = Math.min(
            QOABase.MAX_FRAME_SAMPLES,
            totalSamples - offset,
          );
          const frameBuffer = interleaved.subarray(
            offset * channels,
            (offset + frameSamples) * channels,
          );

          if (!encoder.writeFrame(frameBuffer, frameSamples)) {
            throw new Error("Failed to write QOA frame.");
          }

          offset += frameSamples;
        }

        const qoaBytes = encoder.getData();
        const name = inputFile.name.split(".").slice(0, -1).join(".") + ".qoa";
        outputFiles.push({ bytes: qoaBytes, name });
      }
    }

    return outputFiles;
  }
}

export default qoaFuHandler;
