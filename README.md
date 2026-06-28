# Vidotools Backend

Express + TypeScript API for the Video Downloader app. Handles URL validation,
direct media downloads, temporary file storage, and automatic cleanup.

See [`../BACKEND.md`](../BACKEND.md) for the full design spec.

## Setup

```bash
npm install
cp .env.example .env   # then edit values
```

`npm install` also runs `playwright install chromium` (Playwright is scaffolded
for future use but not used in the MVP request path).

## Scripts

```bash
npm run dev     # ts-node-dev with reload
npm run build   # compile to dist/
npm start       # run compiled dist/index.js
```

## Environment

| Variable             | Description                                  | Default                  |
| -------------------- | -------------------------------------------- | ------------------------ |
| `PORT`               | Port the server listens on                   | `5000`                   |
| `FRONTEND_URL`       | Allowed CORS origin                          | `http://localhost:3000`  |
| `BASE_URL`           | Public base URL used to build download links | `http://localhost:5000`  |
| `DOWNLOAD_DIR`       | Where temp files are stored                  | `public/downloads`       |
| `MAX_FILE_SIZE_MB`   | Max download size                            | `200`                    |
| `FILE_EXPIRE_MINUTES`| Age before files are auto-deleted            | `60`                     |

## API

### `GET /health`

```json
{ "success": true, "message": "Backend is running" }
```

### `POST /download`

Request: `{ "url": "https://example.com/video.mp4" }`

Success:

```json
{
  "success": true,
  "title": "video.mp4",
  "thumbnail": "",
  "downloadUrl": "https://api-domain-kamu.com/downloads/abc123.mp4"
}
```

Error:

```json
{ "success": false, "error": "URL tidak valid atau video tidak bisa diproses" }
```

## MVP scope

Supports direct `.mp4`, `.webm`, `.mov`, `.mkv` URLs only. URLs that are empty,
non-http(s), localhost, private IPs, or otherwise internal are rejected to
prevent SSRF.
