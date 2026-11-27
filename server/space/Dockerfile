# Hugging Face Space(Docker, 무료 CPU)에 이 파일과 README.md 두 개만 올리면 된다.
# 빌드할 때 GitHub 저장소의 최신 코드를 받아온다. 코드를 바꾼 뒤에는 Space 설정에서 "Factory rebuild".
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1 \
    TORCH_HOME=/home/user/.cache/torch OMP_NUM_THREADS=2
WORKDIR /home/user

# 1) 무거운 의존성 (requirements.txt 가 바뀔 때만 다시 설치)
ADD --chown=user https://raw.githubusercontent.com/metukss-bot/stem-stem/main/server/requirements.txt /home/user/requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

# 2) 모델 가중치를 미리 받아 둔다 (첫 분석이 느려지지 않게)
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs_6s')"

# 3) 앱 코드 (main 브랜치가 바뀌면 다시 받음)
ADD https://api.github.com/repos/metukss-bot/stem-stem/commits/main /tmp/main-commit.json
RUN git clone --depth 1 https://github.com/metukss-bot/stem-stem /home/user/app
WORKDIR /home/user/app

EXPOSE 7860
CMD ["python", "-m", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "7860"]
