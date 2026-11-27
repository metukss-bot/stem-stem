"""Demucs를 가짜로 바꿔 서버 흐름(업로드 → 분석 → 파일 내려받기)을 검사한다."""
import importlib
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "colab"))

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg 필요")


def fake_separate(src, workdir, device, bitrate=192, progress=None):
    from stemstem import pipeline

    out = workdir / pipeline.MODEL
    out.mkdir(parents=True)
    for i in range(0, 101, 50):
        if progress:
            progress("separate", i / 100)
    stems = {}
    for name in pipeline.STEMS:
        p = out / f"{name}.mp3"
        shutil.copy2(src, p)
        stems[name] = p
    return stems


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("STEMSTEM_DATA", str(tmp_path / "data"))
    from stemstem import pipeline

    monkeypatch.setattr(pipeline, "separate", fake_separate)
    import server.app as appmod

    appmod = importlib.reload(appmod)
    return TestClient(appmod.app)


def wait_done(client, jid, timeout=60):
    t = time.time()
    while time.time() - t < timeout:
        j = client.get(f"/jobs/{jid}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.2)
    raise AssertionError("timeout")


def test_upload_analyze_download(client, tmp_path):
    song = tmp_path / "합주곡.mp3"
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=5",
         "-ac", "2", str(song)],
        check=True,
    )
    assert client.get("/").json()["ok"]
    r = client.post("/jobs", files={"file": ("합주곡.mp3", song.read_bytes(), "audio/mpeg")})
    assert r.status_code == 200, r.text
    jid = r.json()["id"]
    j = wait_done(client, jid)
    assert j["status"] == "done", j
    a = j["analysis"]
    assert a["title"] == "합주곡"
    assert len(a["stems"]) == 6
    f = client.get(f"/jobs/{jid}/files/vocals.mp3")
    assert f.status_code == 200 and len(f.content) > 1000
    assert client.get(f"/jobs/{jid}/files/../../etc/passwd").status_code == 404
    # 같은 곡을 다시 올리면 바로 완료 상태
    again = client.post("/jobs", files={"file": ("x.mp3", song.read_bytes(), "audio/mpeg")}).json()
    assert again["id"] == jid and again["status"] == "done"


def test_rejects_non_audio(client):
    r = client.post("/jobs", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 400
