# 자동 분석 서버 (Hugging Face Spaces)

> 2026-11 기준 Hugging Face는 Gradio/Docker Space에 유료 플랜(PRO)이 필요해요.
> 무료로 쓰려면 [GitHub로 자동 분석](github-analysis.md)을 쓰세요.

폰 앱에서 "곡 분석하기"로 곡을 고르면, 이 서버가 알아서 6스템 분리와 BPM/키 분석을 해요.
Colab에 들어갈 필요가 없어요. 무료 CPU라서 한 곡에 5~10분쯤 걸려요.

```
앱 ──곡 올리기──▶ Space (server/app.py)
                  대기열 → Demucs htdemucs_6s → BPM/키
앱 ◀──스템 mp3 + analysis.json── (폰에 저장, 오프라인 재생)
```

## 처음 한 번 만들기

1. <https://huggingface.co/join> 에서 가입 (무료)
2. <https://huggingface.co/new-space> 에서 Space 만들기
   - 이름 `stemstem`, SDK **Docker** (Blank), 하드웨어 **CPU basic (무료)**, 공개(Public)
3. Space의 Files 탭에서 [`server/space/Dockerfile`](../server/space/Dockerfile)과
   [`server/space/README.md`](../server/space/README.md) 두 파일을 같은 이름으로 만들어 붙여넣기
4. 빌드가 끝나면(10~20분) 주소는 `https://<아이디>-stemstem.hf.space`
5. 앱 설정의 "분석 서버 주소"에 그 주소 넣기

## 알아둘 점

- 48시간 동안 안 쓰면 서버가 잠들어요. 앱이 알아서 깨우며, 1~3분 더 걸려요.
- 올린 곡과 결과는 서버에 24시간만 남고, 서버가 다시 시작되면 사라져요. 결과는 폰에 저장돼요.
- 공개 Space라 주소를 아는 사람은 누구나 쓸 수 있어요.
- 코드를 바꾼 뒤에는 Space 설정에서 **Factory rebuild** 를 누르면 GitHub 최신 코드로 다시 만들어요.

## 로컬 실행

```bash
pip install -r server/requirements.txt
python -m uvicorn server.app:app --port 7860
```
