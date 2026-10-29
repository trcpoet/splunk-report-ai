# The Python ML job (ml/README.md), for `docker compose --profile ml run --rm ml`.
# It runs once and exits, so it keeps the image's default user, which can write
# the chart into the mounted ml/out folder.
FROM python:3.14-slim
WORKDIR /app
COPY ml/requirements.txt ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt
COPY ml ml
CMD ["python", "ml/score.py"]
