"""GitHub Actions용 일괄 분석: 데이터 저장소의 inbox/ 에 들어온 곡을 songs/<id>/ 로 분석한다.

    python server/batch.py <데이터 저장소 경로>

폰 앱이 inbox/<id>.<확장자> 로 곡을 올리면 (id = 내용 sha1 앞 16자리),
결과는 songs/<id>/{스템 mp3, analysis.json} 에 저장되고 library.json 이 갱신된다.
실패하면 songs/<id>/error.json 에 이유를 남긴다. 처리한 inbox 파일은 지운다.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "colab"))
from stemstem import pipeline  # noqa: E402


def title_for(src: Path) -> str:
    meta = src.with_suffix(".json")
    if meta.exists():
        try:
            return json.loads(meta.read_text(encoding="utf-8")).get("title") or src.stem
        except Exception:
            pass
    return src.stem


def main(root: Path) -> int:
    inbox = root / "inbox"
    songs = root / "songs"
    songs.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in inbox.glob("*") if p.suffix.lower() in pipeline.AUDIO_EXTS) if inbox.exists() else []
    print(f"inbox: {len(files)}곡")
    for src in files:
        sid = src.stem
        out = songs / sid
        title = title_for(src)
        print(f"\n=== {title} -> songs/{sid} ===", flush=True)
        if not (out / "analysis.json").exists():
            try:
                a = pipeline.analyze_song(src, out, device=pipeline.get_device(), title=title)
                print(f"완료: BPM {a['bpm']}, 키 {a['key']['name']}, {a['elapsedSec']}초")
                (out / "error.json").unlink(missing_ok=True)
            except Exception as e:
                print(f"실패: {e}")
                out.mkdir(parents=True, exist_ok=True)
                (out / "error.json").write_text(
                    json.dumps({"error": str(e)[:500], "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                               ensure_ascii=False),
                    encoding="utf-8",
                )
        src.unlink(missing_ok=True)
        src.with_suffix(".json").unlink(missing_ok=True)
    pipeline.update_library(root)
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else ".")))
