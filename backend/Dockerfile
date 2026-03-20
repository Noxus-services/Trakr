# Image officielle Playwright — Chromium + toutes les dépendances préinstallées
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Deps système pour psycopg2
RUN apt-get update && apt-get install -y \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium déjà installé dans l'image de base — on s'assure juste qu'il est dispo
RUN playwright install chromium

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
