import express from "express";
import multer from "multer";
import path from "path";
import { randomBytes } from "crypto";

import { TEMP_DIR } from "./src/utils/transcription.js";
import { transcribeHandler } from "./src/controllers/transcribe.js";

const app = express();

const PORT = process.env.PORT || 4100;

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".webm",
  ".ogg",
  ".flac",
  ".mp4",
  ".mpeg",
  ".aac",
  ".opus",
]);

const upload = multer({
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ext || !ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      return cb(
        new Error(
          "Unsupported audio format. Allowed: mp3, wav, m4a, webm, ogg, flac, mp4, mpeg, aac, opus"
        )
      );
    }
    cb(null, true);
  },
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, TEMP_DIR);
    },

    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();

      cb(
        null,
        `${Date.now()}-${randomBytes(5).toString(
          "hex"
        )}${ext}`
      );
    },
  }),
});

function handleAudioUpload(req, res, next) {
  upload.single("audio")(req, res, (err) => {
    if (!err) {
      return next();
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "File exceeds maximum size of 512 MB",
        });
      }
      return res.status(400).json({
        error: err.message || err.code,
      });
    }
    return res.status(400).json({
      error: err.message || "Upload failed",
    });
  });
}

app.post("/transcribe", handleAudioUpload, transcribeHandler);

app.listen(PORT, () => {
  console.log(
    `Server running on ${PORT}`
  );
});
