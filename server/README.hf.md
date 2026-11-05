---
title: PartitUp OMR
emoji: 🎵
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# PartitUp OMR backend

Optical Music Recognition API for [PartitUp](https://github.com/ieje1-ua/partitup).
Accepts an image or PDF of a choral score and returns MusicXML.
This image sets `OMR_ENGINE=audiveris` (oemer does not fit the free CPU tier).
The server default without that variable is `auto`: Audiveris for PDF, oemer
for photos, with the other engine as fallback when it is installed.

Endpoints:
- `POST /api/omr` — multipart form field `file` (PNG/JPG/PDF) → `{ status, musicXml }`
- `POST /api/omr/jobs` — same upload, returns a job id; poll `GET /api/omr/jobs/:id`
- `DELETE /api/omr/jobs/:id` — cancel a job between pages
- `GET /health` — liveness plus configured engine and versions

This Space runs on the free CPU Basic tier (2 vCPU / 16GB RAM) and sleeps after
48h of inactivity; the first request after sleeping wakes it (~30-60s cold start).

> Deployed from the `server/` directory of the PartitUp repo. `Dockerfile.hf`
> is renamed to `Dockerfile` and this file to `README.md` in the Space repo.
