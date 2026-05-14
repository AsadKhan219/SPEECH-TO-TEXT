import {
  MAX_FILE_SIZE,
  removeFiles,
  splitAudio,
  transcribe,
} from "../utils/transcription.js";
import { HttpError } from "../utils/httpError.js";
import { sendSuccess } from "../utils/response.js";

export async function transcribeHandler(req, res) {
  const filesToDelete = [];

  try {
    if (!req.file) {
      throw new HttpError(400, "Audio file required");
    }

    filesToDelete.push(req.file.path);

    let finalSegments = [];
consi
    if (req.file.size <= MAX_FILE_SIZE) {
      finalSegments = await transcribe(req.file.path);
      console.log("finalSegments", finalSegments);
    } else {
        console.log("Splitting audio into chunks");
      const chunks = await splitAudio(req.file.path);
      console.log("chunks", chunks);
      filesToDelete.push(...chunks);

      let offset = 0;

      for (const chunk of chunks) {
        const segments = await transcribe(chunk, offset);

        finalSegments.push(...segments);

        if (segments.length) {
          offset = segments[segments.length - 1].end;
        }
      }
    }

    return sendSuccess(res, {
      text: finalSegments.map((s) => s.text).join(" "),
      segments: finalSegments,
    });
  } catch (error) {
    console.log(error);

    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    return res.status(500).json({
      error: "Transcription failed",
    });
  } finally {
    await removeFiles(filesToDelete);
  }
}
