# Speech-to-text API

Small **Node.js + Express** service that accepts an audio upload, transcribes it with **OpenAI Whisper** (`whisper-1`), and returns full text plus timed **segments**.

---

## Quick start

```bash
npm install
```

Create a `.env` file:

```env
OPENAI_API_KEY=sk-...
```

Optional:

```env
PORT=4100
```

```bash
npm run dev
# or
npm start
```

---

## API

### `POST /transcribe`

| Part | Value |
|------|--------|
| Content-Type | `multipart/form-data` |
| Field name | `audio` (single file) |

**Success (200)** — shape from `sendSuccess`:

```json
{
  "success": true,
  "text": "…",
  "segments": [
    { "start": 0, "end": 2.5, "text": "…" }
  ]
}
```

**Client errors** — JSON body includes an `error` string (e.g. missing file, unsupported extension, file too large).

---

## Architecture (high level)

```
Client → Express → Multer (disk) → transcribe controller
                                        ↓
                         [small file] → OpenAI transcription (one call)
                         [large file] → FFmpeg segment → OpenAI per chunk → merge + offset
                                        ↓
                              finally: delete temp files
```

- **`index.js`** — HTTP server, multer configuration, upload error handling.
- **`src/controllers/transcribe.js`** — Orchestrates “single call vs split”, aggregates segments, guarantees cleanup.
- **`src/utils/transcription.js`** — FFmpeg splitting, OpenAI call, temp directory, size threshold constant.
- **`src/utils/openai.js`** — Shared OpenAI client + `dotenv` load.

---

## Design decisions

### 1. Two different size limits on purpose

| Constant | Location | Role |
|----------|----------|------|
| **512 MB** (`MAX_UPLOAD_BYTES`) | `index.js` | Hard cap on what the server will accept over HTTP. Stops abuse and unbounded disk use per request. |
| **25 MB** (`MAX_FILE_SIZE`) | `transcription.js` | Threshold for **splitting** before calling Whisper. Files at or below this size are sent in **one** API call; larger files are chunked with FFmpeg first. |

Rationale: Whisper/API and practical reliability favor bounded request payloads per call, while product requirements may still allow **large** uploads (e.g. long recordings) that are processed as multiple smaller transcriptions.

### 2. Disk storage (Multer) instead of memory

Uploads are written under `temp/` via `multer.diskStorage`. For a **512 MB** max upload, buffering the whole body in RAM would be risky on small instances. Disk trades I/O for predictable memory use.

Files are named with a timestamp and random suffix to avoid collisions; the stored extension is **normalized to lowercase** so downstream tools see a consistent suffix.

### 3. Extension allowlist at upload

Only a fixed set of extensions is accepted (see `ALLOWED_AUDIO_EXTENSIONS` in `index.js`). This is a **cheap first gate**: wrong kinds of uploads fail fast before FFmpeg or OpenAI run.

**Trade-off:** extension checks are not cryptographic proof of format (clients can rename files). They are paired with FFmpeg/OpenAI behavior in practice; tightening further would mean magic-byte sniffing or stricter MIME rules, which was not required for this service’s scope.

### 4. FFmpeg chunking: 300-second segments

Large files are split with **segment muxer** (`-f segment -segment_time 300`) into numbered **MP3** chunks under a per-job folder. Design goals:

- Keep each Whisper request on a **manageable** audio duration and file size.
- Use a **static** `ffmpeg` binary via `ffmpeg-static` so deployment does not depend on system FFmpeg being installed.

### 5. Segment timestamps across chunks (`offset`)

Whisper returns segment times **relative to each chunk**. The controller passes an **offset** into `transcribe()` so returned `start` / `end` are shifted to a **single global timeline** for the original file. After each chunk, the offset is advanced using the last segment’s `end` so the next chunk continues the timeline without overlap bugs in the common case.

### 6. `verbose_json` from Whisper

The API uses `response_format: "verbose_json"` to obtain **structured segments** (not only plain text). That enables the merged `segments` array in the response and correct offset math when stitching chunks.

### 7. Cleanup in `finally`

Uploaded paths and generated chunk paths are collected in `filesToDelete` and removed in a **`finally`** block so **failed** transcriptions or mid-stream errors still delete temp files where possible. `removeFiles` swallows unlink errors so cleanup does not mask the original failure.

### 8. Thin controller, utilities for I/O and vendor calls

Business flow lives in the controller, but **FFmpeg** and **OpenAI** details stay in `transcription.js` / `openai.js` to keep the HTTP layer readable and to reuse the same transcription primitive for both whole files and chunks.

### 9. Error response shape (intentional simplicity)

Upload middleware returns `{ "error": "…" }` with appropriate HTTP status (e.g. **413** for oversize). The transcribe handler uses the same `error` field for `HttpError` and generic failures. This is **not** a strict `{ success, message, data }` envelope everywhere; success responses use `success: true` plus payload fields for this small API.

---

## Operational notes

- **`temp/`** is created at startup if missing (`transcription.js`).
- Ensure **`OPENAI_API_KEY`** is set; missing or invalid keys surface as transcription failures (500 / logged error) from the OpenAI SDK.
- Long files imply **multiple** Whisper calls and longer wall-clock time; consider timeouts on reverse proxies and clients.

---

## Tech stack

- **Express** — HTTP server  
- **Multer** — multipart uploads, limits, file filter  
- **OpenAI SDK** — `whisper-1` transcriptions  
- **fluent-ffmpeg** + **ffmpeg-static** — audio segmentation  
