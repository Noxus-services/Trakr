# Image officielle Playwright — Chromium + toutes dépendances préinstallées
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app

# Installer uniquement les dépendances du scraper (rapide + fiable)
COPY requirements_scraper.txt .
RUN pip install --no-cache-dir -r requirements_scraper.txt

# Copier tout le repo (Chromium déjà dans l'image, pas besoin de playwright install)
COPY . .

EXPOSE 8000

# Shell form pour que ${PORT} soit bien substitué par Railway
CMD ["sh", "-c", "uvicorn main_scraper:app --host 0.0.0.0 --port ${PORT:-8000}"]
