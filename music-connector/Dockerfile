FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN addgroup --system connector \
  && adduser --system --ingroup connector connector
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=connector:connector app ./app
USER connector
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-keep-alive", "5"]

