# stem-stem

밴드 합주용 스템 분리 앱. 곡을 보컬, 기타, 베이스, 키보드, 드럼으로 나누고
폰에서 파트별 볼륨, 속도, 클릭을 조절하며 재생합니다. 전부 무료로 돌아갑니다.

```
폰 앱 ──"곡 분석하기"──▶ 비공개 저장소 stem-stem-data (GitHub Actions, 무료)
                          │  Demucs 6스템 분리 + 비트/BPM/키 분석
                          ▼
폰 앱 ◀──스템 mp3 + analysis.json── (폰에 저장, 이후 오프라인 재생)
```

예전 방식(구글 드라이브 + Colab 노트북)도 앱의 "예전 방식" 메뉴에 남아 있어요.

- 앱(웹): https://metukss-bot.github.io/stem-stem/
- 안드로이드 앱: [StemStem.apk](https://github.com/metukss-bot/stem-stem/releases/latest/download/StemStem.apk) (설치 방법: [docs/android.md](docs/android.md))
- 자동 분석 설정 (GitHub, 무료): [docs/github-analysis.md](docs/github-analysis.md)
- 분석 서버 (Hugging Face, 유료 플랜 필요): [docs/server.md](docs/server.md)
- 예전 방식(드라이브 + Colab) 설정: [docs/setup.md](docs/setup.md)

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `colab/` | 분석 파이썬 코드 (`stemstem/`)와 Colab 노트북 |
| `server/` | 자동 분석: GitHub Actions용 `batch.py`와 `data-repo/` 워크플로, Hugging Face용 서버 |
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
- [x] 안드로이드 앱(APK), 자동 분석 서버
- [ ] 4단계: 세트리스트
