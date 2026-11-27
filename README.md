# stem-stem

밴드 합주용 스템 분리 앱. 곡을 보컬, 기타, 베이스, 키보드, 드럼으로 나누고
폰에서 파트별 볼륨, 속도, 클릭을 조절하며 재생합니다. 전부 무료로 돌아갑니다.

```
폰 앱 ──곡 올리기──▶ 구글 드라이브 StemStem/inbox
                          │
     "분석하기" ──▶ Colab 노트북 (무료 GPU, "모두 실행" 한 번)
                          │  Demucs 6스템 분리 + 비트/BPM/키 분석
                          ▼
                   StemStem/songs/<곡>/ (스템 mp3 + analysis.json)
                          │
폰 앱 ◀──내려받아 폰에 저장── (이후 오프라인 재생)
```

- 앱(웹): https://metukss-bot.github.io/stem-stem/
- 안드로이드 앱: [StemStem.apk](https://github.com/metukss-bot/stem-stem/releases/latest/download/StemStem.apk) (설치 방법: [docs/android.md](docs/android.md))
- 처음 설정과 사용법: [docs/setup.md](docs/setup.md)

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `colab/` | 분석 노트북 `StemStem.ipynb` 와 파이썬 코드 (`stemstem/`) |
| `web/` | 폰용 웹앱 (React + TypeScript + Vite, PWA). `web/android/`는 안드로이드 앱(Capacitor) |
| `docs/` | 설정 안내 |

## 개발

```bash
# 웹앱
cd web && npm install && npm run dev   # http://localhost:5173
npm test

# 분석 코드 테스트 (Demucs 없이 흐름만 검사)
cd colab && pip install numpy librosa soundfile pytest && python -m pytest -q tests
```

## 진행 상황

- [x] 1단계: Colab 분석 (6스템, 비트/BPM/키), 드라이브 연동, 폰 플레이어 (믹서, 속도, 클릭)
- [ ] 2단계: 키(조성) 변경, 카운트인, A-B 구간 반복
- [ ] 3단계: 코드, 가사
- [ ] 4단계: 세트리스트, 완전 자동 분석 옵션
