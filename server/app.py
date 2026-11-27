"""StemStem 자동 분석 서버 (Hugging Face Spaces 무료 CPU에서 실행).

폰 앱이 곡을 올리면 대기열에 넣고 하나씩 Demucs 6스템 분리 + 비트/키 분석을 한다.
앱은 상태를 주기적으로 물어보고, 끝나면 스템과 analysis.json을 내려받는다.

    POST /jobs                 (multipart: file, title?)  -> {id, status}
    GET  /jobs/{id}            -> {id, status, stage, progress, position, error, analysis}
    GET  /jobs/{id}/files/{f}  -> 스템 mp3 또는 analysis.json
    GET  /                     -> 서버 상태

결과는 서버 임시 저장소에 24시간만 보관된다 (서버가 재시작되면 사라짐).
"""
from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import shutil
import sys
import threading
import time
import traceback
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "colab"))
from stemstem import __version__  # noqa: E402
from stemstem import pipeline  # noqa: E402

DATA = Path(os.environ.get("STEMSTEM_DATA", "/tmp/stemstem"))
KEEP_SEC = 24 * 3600
MAX_BYTES = 60 * 1024 * 1024
ALLOWED_FILES = {f"{s}.mp3" for s in pipeline.STEMS} | {"analysis.json"}
ID_RE = re.compile(r"^[0-9a-f]{16}$")

app = FastAPI(title="StemStem")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

jobs: dict[str, dict] = {}
order: list[str] = []
q: queue.Queue[str] = queue.Queue()
lock = threading.Lock()


def job_dir(jid: str) -> Path:
    return DATA / jid


def public(job: dict) -> dict:
    out = {k: job.get(k) for k in ("id", "title", "status", "stage", "progress", "error")}
    if job["status"] == "queued":
        with lock:
            waiting = [j for j in order if jobs[j]["status"] in ("queued", "running")]
        out["position"] = waiting.index(job["id"]) if job["id"] in waiting else 0
    if job["status"] == "done":
        out["analysis"] = job.get("analysis")
    return out


def cleanup() -> None:
    now = time.time()
    with lock:
        old = [j for j, v in jobs.items() if v["status"] in ("done", "error") and now - v["updated"] > KEEP_SEC]
        for j in old:
            jobs.pop(j, None)
            if j in order:
                order.remove(j)
    for j in old:
        shutil.rmtree(job_dir(j), ignore_errors=True)


def worker() -> None:
    while True:
        jid = q.get()
        job = jobs.get(jid)
        if not job:
            continue
        job.update(status="running", stage="separate", progress=0.0, updated=time.time())

        def progress(stage: str, p: float) -> None:
            job.update(stage=stage, progress=round(p, 3), updated=time.time())

        d = job_dir(jid)
        try:
            src = next(d.glob("input.*"))
            analysis = pipeline.analyze_song(
                src, d / "out", device=pipeline.get_device(), title=job["title"], progress=progress
            )
            job.update(status="done", stage="done", progress=1.0, analysis=analysis)
            src.unlink(missing_ok=True)
        except Exception as e:  # 실패 원인을 앱에 보여준다
            traceback.print_exc()
            job.update(status="error", error=str(e)[:500])
        job["updated"] = time.time()
        cleanup()


threading.Thread(target=worker, daemon=True).start()


@app.get("/")
def health() -> dict:
    with lock:
        busy = sum(1 for v in jobs.values() if v["status"] in ("queued", "running"))
    return {"ok": True, "service": "stemstem", "version": __version__, "model": pipeline.MODEL, "waiting": busy}


@app.post("/jobs")
async def create_job(file: UploadFile = File(...), title: str = Form("")) -> dict:
    name = file.filename or "song.mp3"
    ext = Path(name).suffix.lower()
    if ext not in pipeline.AUDIO_EXTS:
        raise HTTPException(400, f"지원하지 않는 파일 형식이에요: {ext}")
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = DATA / f"upload-{time.time_ns()}{ext}"
    h = hashlib.sha1()
    size = 0
    with open(tmp, "wb") as f:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > MAX_BYTES:
                f.close()
                tmp.unlink(missing_ok=True)
                raise HTTPException(413, "파일이 너무 커요 (최대 60MB)")
            h.update(chunk)
            f.write(chunk)
    jid = h.hexdigest()[:16]
    title = (title or Path(name).stem).strip()[:120]
    with lock:
        existing = jobs.get(jid)
        if existing and existing["status"] != "error":
            tmp.unlink(missing_ok=True)
            return public(existing)
        d = job_dir(jid)
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True)
        tmp.rename(d / f"input{ext}")
        jobs[jid] = {"id": jid, "title": title, "status": "queued", "stage": "queued",
                     "progress": 0.0, "error": None, "updated": time.time()}
        if jid in order:
            order.remove(jid)
        order.append(jid)
    q.put(jid)
    return public(jobs[jid])


@app.get("/jobs/{jid}")
def get_job(jid: str) -> dict:
    job = jobs.get(jid) if ID_RE.match(jid) else None
    if not job:
        raise HTTPException(404, "작업을 찾을 수 없어요 (서버가 다시 시작됐을 수 있어요)")
    return public(job)


@app.get("/jobs/{jid}/files/{name}")
def get_file(jid: str, name: str):
    job = jobs.get(jid) if ID_RE.match(jid) else None
    if not job or job["status"] != "done" or name not in ALLOWED_FILES:
        raise HTTPException(404, "파일이 없어요")
    path = job_dir(jid) / "out" / name
    if not path.exists():
        raise HTTPException(404, "파일이 없어요")
    media = "application/json" if name.endswith(".json") else "audio/mpeg"
    return FileResponse(path, media_type=media)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))
