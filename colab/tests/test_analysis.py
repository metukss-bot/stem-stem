import numpy as np

from stemstem.beats import bpm_from_beats
from stemstem.key import MAJOR, MINOR, PITCHES, key_from_chroma
from stemstem.pipeline import song_id_for


def test_bpm_from_beats():
    beats = np.arange(0, 30, 0.5)  # 120 BPM
    assert bpm_from_beats(beats) == 120.0
    assert bpm_from_beats([1.0]) is None


def test_key_from_profile_major_and_minor():
    for tonic in range(12):
        assert key_from_chroma(np.roll(MAJOR, tonic))["name"] == PITCHES[tonic]
        assert key_from_chroma(np.roll(MINOR, tonic))["name"] == PITCHES[tonic] + "m"


def test_song_id_is_stable(tmp_path):
    p = tmp_path / "우리 노래 (live).mp3"
    p.write_bytes(b"abc")
    a = song_id_for(p)
    assert a == song_id_for(p)
    assert a.startswith("우리-노래-live-")
