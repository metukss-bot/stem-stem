"""Demucs를 가짜로 바꿔 드라이브 폴더 흐름(inbox → songs, library.json)을 검사한다."""
import json
import shutil
import subprocess

import pytest

from stemstem import pipeline

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg 필요")


def make_tone(path, freq, seconds=6):
    # 100 BPM 클릭 + C장조 화음 비슷한 신호
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}",
         "-f", "lavfi", "-i", f"sine=frequency={freq * 1.26}:duration={seconds}",
         "-f", "lavfi", "-i", f"sine=frequency={freq * 1.5}:duration={seconds}",
         "-filter_complex", "amix=inputs=3,volume='if(lt(mod(t,0.6),0.05),3,1)':eval=frame",
         "-ac", "2", str(path)],
        check=True,
    )


def fake_separate(src, workdir, device, bitrate=192, progress=None):
    out = workdir / pipeline.MODEL
    out.mkdir(parents=True)
    stems = {}
    for name in pipeline.STEMS:
        p = out / f"{name}.mp3"
        shutil.copy2(src, p)
        stems[name] = p
    return stems


def test_process_inbox(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "separate", fake_separate)
    root = tmp_path / "StemStem"
    (root / "inbox").mkdir(parents=True)
    make_tone(root / "inbox" / "연습곡.mp3", 261.63)

    done = pipeline.process_inbox(root, device="cpu")

    assert len(done) == 1
    song = root / "songs" / done[0]
    a = json.loads((song / "analysis.json").read_text(encoding="utf-8"))
    assert a["title"] == "연습곡"
    assert 5.5 < a["duration"] < 6.5
    assert [s["id"] for s in a["stems"]] == pipeline.STEMS
    assert all((song / s["file"]).exists() for s in a["stems"])
    assert (song / "original.mp3").exists()
    assert not list((root / "inbox").iterdir())
    assert a["key"]["tonic"] in ("C", "A", "E", "G", "F")  # 화음 기반이라 근접 조성 허용
    lib = json.loads((root / "library.json").read_text(encoding="utf-8"))
    assert lib["songs"][0]["id"] == done[0]

    # 다시 실행해도 아무 일 없음
    assert pipeline.process_inbox(root, device="cpu") == []
