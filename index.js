import express from "express";
import multer from "multer";
import path from "path";
import { randomBytes } from "crypto";

import { TEMP_DIR } from "./src/utils/transcription.js";
import { transcribeHandler } from "./src/controllers/transcribe.js";

const app = express();

const PORT = process.env.PORT || 4100;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, TEMP_DIR);
    },

    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);

      cb(
        null,
        `${Date.now()}-${randomBytes(5).toString(
          "hex"
        )}${ext}`
      );
    },
  }),
});

app.post(
  "/transcribe",
  upload.single("audio"),
  transcribeHandler
);

app.listen(PORT, () => {
  console.log(
    `Server running on ${PORT}`
  );
});
