# The Python ML job (ml/README.md), for `docker compose --profile ml run --rm ml`
# and the Kubernetes ML job (deploy/helm). It runs as a non-root user; docker
# compose runs it as root instead, so --plot can write the mounted ml/out folder.
FROM python:3.14-slim
WORKDIR /app
COPY ml/requirements.txt ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt
COPY ml ml
ENV HOME=/tmp MPLCONFIGDIR=/tmp/matplotlib
USER 1000
CMD ["python", "ml/score.py"]
