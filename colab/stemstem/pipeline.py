"""드라이브 inbox의 곡을 분석해 songs/<id>/ 에 스템과 analysis.json을 저장한다.

드라이브 폴더 구조 (root = MyDrive/StemStem):

    inbox/                 폰 앱이 올린 원곡
    songs/<song_id>/       분석 결과
        vocals.mp3 drums.mp3 bass.mp3 guitar.mp3 piano.mp3 other.mp3
        analysis.json
        original.<ext>
    library.json           곡 목록 (앱이 읽음)
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from . import __version__

AUDIO_EXTS = {".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".mp4"}
MODEL = "htdemucs_6s"
STEMS = ["vocals", "drums", "bass", "guitar", "piano", "other"]
STEM_LABELS = {
    "vocals": "보컬",
    "drums": "드럼",
    "bass": "베이스",
    "guitar": "기타",
    "piano": "키보드",
    "other": "나머지",
}


def song_id_for(path: Path) -> str:
    """파일 이름 + 내용 해시로 안정적인 id를 만든다."""
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    slug = re.sub(r"[^0-9A-Za-z가-힣]+", "-", path.stem).strip("-")[:40] or "song"
    return f"{slug}-{h.hexdigest()[:8]}"


def get_device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def separate(src: Path, workdir: Path, device: str, bitrate: int = 192) -> dict[str, Path]:
    """Demucs로 6스템 분리, mp3로 저장."""
    cmd = [
        sys.executable, "-m", "demucs",
        "-n", MODEL,
        "-d", device,
        "--mp3", "--mp3-bitrate", str(bitrate),
        "-o", str(workdir),
        "--filename", "{stem}.{ext}",
        str(src),
    ]
    print("[demucs]", " ".join(cmd))
    subprocess.run(cmd, check=True)
    outdir = workdir / MODEL
    stems = {name: outdir / f"{name}.mp3" for name in STEMS}
    missing = [n for n, p in stems.items() if not p.exists()]
    if missing:
        raise RuntimeError(f"Demucs 출력에 스템이 없습니다: {missing}")
    return stems


def audio_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        check=True, capture_output=True, text=True,
    )
    return round(float(out.stdout.strip()), 3)


def harmonic_mix(stems: dict[str, Path], sr: int = 22050):
    """드럼과 보컬을 뺀 화성 파트(베이스+기타+피아노+나머지)를 섞어 키 분석에 쓴다."""
    import librosa
    import numpy as np

    mix = None
    for name in ("bass", "guitar", "piano", "other"):
        y, _ = librosa.load(str(stems[name]), sr=sr, mono=True)
        mix = y if mix is None else mix[: len(y)] + y[: len(mix)]
    return np.asarray(mix), sr


def analyze_song(src: Path, out_dir: Path, device: str | None = None) -> dict:
    from .beats import analyze_beats
    from .key import detect_key

    device = device or get_device()
    out_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        local_src = tmp / f"input{src.suffix.lower()}"
        shutil.copy2(src, local_src)
        stems = separate(local_src, tmp / "sep", device)
        print("[beats] 비트 분석 중...")
        beats = analyze_beats(str(local_src), device=device)
        print("[key] 키 분석 중...")
        y, sr = harmonic_mix(stems)
        key = detect_key(y, sr)
        for name, p in stems.items():
            shutil.copy2(p, out_dir / f"{name}.mp3")
        duration = audio_duration(local_src)

    analysis = {
        "version": 1,
        "title": src.stem,
        "duration": duration,
        "bpm": beats["bpm"],
        "beats": beats["beats"],
        "downbeats": beats["downbeats"],
        "beatMethod": beats["method"],
        "key": key,
        "stems": [
            {"id": n, "label": STEM_LABELS[n], "file": f"{n}.mp3"} for n in STEMS
        ],
        "model": MODEL,
        "analyzer": __version__,
        "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsedSec": round(time.time() - t0, 1),
    }
    (out_dir / "analysis.json").write_text(
        json.dumps(analysis, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return analysis


def update_library(root: Path) -> list[dict]:
    songs = []
    for a in sorted((root / "songs").glob("*/analysis.json")):
        try:
            data = json.loads(a.read_text(encoding="utf-8"))
        except Exception:
            continue
        songs.append({
            "id": a.parent.name,
            "title": data.get("title", a.parent.name),
            "duration": data.get("duration"),
            "bpm": data.get("bpm"),
            "key": (data.get("key") or {}).get("name"),
            "analyzedAt": data.get("analyzedAt"),
        })
    songs.sort(key=lambda s: s.get("analyzedAt") or "", reverse=True)
    (root / "library.json").write_text(
        json.dumps({"version": 1, "songs": songs}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    return songs


def process_inbox(root: str | Path, device: str | None = None) -> list[str]:
    """inbox의 모든 곡을 분석한다. 분석이 끝난 원곡은 songs/<id>/original.* 로 옮긴다."""
    root = Path(root)
    inbox = root / "inbox"
    for d in (inbox, root / "songs"):
        d.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in inbox.iterdir() if p.suffix.lower() in AUDIO_EXTS)
    if not files:
        print("inbox에 새 곡이 없습니다. 폰 앱에서 곡을 올린 뒤 다시 실행하세요.")
    done = []
    for i, src in enumerate(files, 1):
        sid = song_id_for(src)
        out_dir = root / "songs" / sid
        print(f"\n=== [{i}/{len(files)}] {src.name} -> songs/{sid} ===")
        if (out_dir / "analysis.json").exists():
            print("이미 분석된 곡입니다. 건너뜁니다.")
        else:
            a = analyze_song(src, out_dir, device)
            print(f"완료: BPM {a['bpm']}, 키 {a['key']['name']}, {a['elapsedSec']}초")
        shutil.move(str(src), str(out_dir / f"original{src.suffix.lower()}"))
        done.append(sid)
    update_library(root)
    return done
