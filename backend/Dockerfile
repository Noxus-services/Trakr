# Image officielle Playwright — Chromium + toutes dépendances préinstallées
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Deps système pour psycopg2 (au cas où)
RUN apt-get update && apt-get install -y gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Chromium déjà dans l'image, on s'assure qu'il est accessible
RUN playwright install chromium

COPY . .

EXPOSE 8000

# Entrypoint léger : health + scraper uniquement (pas de DB requise)
CMD uvicorn main_scraper:app --host 0.0.0.0 --port ${PORT:-8000}
