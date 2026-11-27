"""비트/다운비트/BPM 분석. GPU가 있으면 beat_this, 없으면 librosa로 대체."""
from __future__ import annotations

import numpy as np


def bpm_from_beats(beats) -> float | None:
    beats = np.asarray(beats, dtype=float)
    if beats.size < 2:
        return None
    ibi = np.diff(beats)
    ibi = ibi[ibi > 0]
    if ibi.size == 0:
        return None
    return round(float(60.0 / np.median(ibi)), 1)


def _beat_this(path: str, device: str):
    from beat_this.inference import File2Beats

    f2b = File2Beats(checkpoint_path="final0", device=device, dbn=False)
    beats, downbeats = f2b(path)
    return np.asarray(beats, float), np.asarray(downbeats, float)


def _librosa(path: str):
    import librosa

    y, sr = librosa.load(path, sr=22050, mono=True)
    _, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beats = librosa.frames_to_time(frames, sr=sr)
    # librosa는 다운비트를 주지 않으므로 4/4 가정으로 4박마다 표시
    downbeats = beats[::4]
    return np.asarray(beats, float), np.asarray(downbeats, float)


def analyze_beats(path: str, device: str = "cpu") -> dict:
    method = "beat_this"
    try:
        beats, downbeats = _beat_this(path, device)
    except Exception as exc:  # beat_this 미설치 또는 실패
        print(f"[beats] beat_this 사용 불가 ({exc!r}), librosa로 분석합니다")
        method = "librosa"
        beats, downbeats = _librosa(path)
    return {
        "method": method,
        "bpm": bpm_from_beats(beats),
        "beats": [round(float(b), 3) for b in beats],
        "downbeats": [round(float(b), 3) for b in downbeats],
    }
