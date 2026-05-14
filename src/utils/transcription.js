import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import path from "path";
import { unlink } from "fs/promises";

import { openai } from "./openai.js";

ffmpeg.setFfmpegPath(ffmpegPath);

export const TEMP_DIR = path.join(process.cwd(), "temp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export const MAX_FILE_SIZE = 2 * 1024 * 1024;

export async function removeFiles(files) {
  for (const file of files) {
    try {
      await unlink(file);
    } catch { }
  }
}

export function splitAudio(filePath) {
  return new Promise((resolve, reject) => {
    const chunkFolder = path.join(
      TEMP_DIR,
      `chunks-${Date.now()}`
    );

    fs.mkdirSync(chunkFolder);

    ffmpeg(filePath)
      .output(
        `${chunkFolder}/chunk-%03d.mp3`
      )
      .outputOptions([
        "-f segment",
        "-segment_time 300",
      ])
      .on("end", () => {
        const chunks = fs
          .readdirSync(chunkFolder)
          .sort()
          .map((file) =>
            path.join(chunkFolder, file)
          );

        resolve(chunks);
      })
      .on("error", reject)
      .run();
  });
}

export async function transcribe(
  filePath,
  offset = 0
) {
  const response =
    await openai.audio.transcriptions.create(
      {
        file: fs.createReadStream(
          filePath
        ),
        model: "whisper-1",
        response_format:
          "verbose_json",
      }
    );

  const segments =
    response.segments || [];

  return segments.map(
    (segment) => ({
      start:
        segment.start + offset,

      end:
        segment.end + offset,

      text: segment.text,
    })
  );
}
