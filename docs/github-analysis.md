# GitHub로 자동 분석 (무료)

폰 앱에서 "곡 분석하기"로 곡을 고르면, 비공개 데이터 저장소에 곡이 올라가고
그 저장소의 GitHub Actions가 6스템 분리 + BPM/키 분석을 해서 결과를 올려요.
앱은 결과가 생기면 알아서 내려받아요. Colab에 들어갈 필요가 없어요.

```
앱 ──곡 올리기──▶ stem-stem-data (비공개) / inbox/<id>.mp3
                    │  GitHub Actions: Demucs htdemucs_6s + BPM/키 (CPU, 곡당 10분쯤)
                    ▼
                 songs/<id>/ 스템 mp3 + analysis.json, library.json
앱 ◀──내려받아 폰에 저장── (이후 오프라인 재생)
```

- 비용: 무료 계정의 비공개 저장소는 한 달 Actions 2,000분이 무료예요 (곡당 약 10분이면 한 달 약 200곡).
- 곡과 결과는 비공개 저장소에만 있어요.
- 밴드원 폰에서는 "저장소 곡"에서 이미 분석된 곡을 바로 받을 수 있어요 (같은 토큰 필요).

## 처음 한 번 만들기

1. GitHub에서 **비공개** 저장소 `stem-stem-data` 만들기
2. 그 저장소에 [`server/data-repo/.github/workflows/analyze.yml`](../server/data-repo/.github/workflows/analyze.yml)을
   같은 경로(`.github/workflows/analyze.yml`)로 넣기
3. 토큰 만들기: GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
   - Repository access: Only select repositories → `stem-stem-data`
   - Permissions: **Contents: Read and write**, **Actions: Read-only**
4. 앱 설정에 저장소(`아이디/stem-stem-data`)와 토큰을 넣고 저장

## 알아둘 점

- 결과 mp3가 저장소에 쌓여요. 곡당 30MB쯤이라 30곡쯤 넘으면 오래된 곡 폴더(`songs/<id>`)를 지우는 게 좋아요.
- 토큰은 그 폰에만 저장돼요. 토큰이 새면 GitHub에서 바로 지우고 새로 만들면 돼요.
