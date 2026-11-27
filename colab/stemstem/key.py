"""조성(키) 감지: 크로마 평균 + Krumhansl-Kessler 프로파일 상관."""
from __future__ import annotations

import numpy as np

PITCHES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# Krumhansl-Kessler key profiles
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def key_from_chroma(chroma_mean: np.ndarray) -> dict:
    """12차원 평균 크로마로 가장 그럴듯한 키를 고른다."""
    chroma_mean = np.asarray(chroma_mean, dtype=float)
    if chroma_mean.shape != (12,):
        raise ValueError("chroma_mean must have shape (12,)")
    best = None
    scores = []
    for mode, profile in (("major", MAJOR), ("minor", MINOR)):
        for tonic in range(12):
            r = float(np.corrcoef(chroma_mean, np.roll(profile, tonic))[0, 1])
            scores.append(r)
            if best is None or r > best[0]:
                best = (r, tonic, mode)
    r, tonic, mode = best
    scores.sort(reverse=True)
    margin = scores[0] - scores[1]
    name = PITCHES[tonic] + ("m" if mode == "minor" else "")
    return {
        "tonic": PITCHES[tonic],
        "mode": mode,
        "name": name,
        "confidence": round(float(np.clip(margin * 5, 0, 1)), 3),
    }


def detect_key(y: np.ndarray, sr: int) -> dict:
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    return key_from_chroma(chroma.mean(axis=1))
