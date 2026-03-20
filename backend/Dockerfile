FROM python:3.11-slim

WORKDIR /app

# Dépendances système pour Playwright Chromium sur Debian Bookworm
RUN apt-get update && apt-get install -y \
    wget curl gnupg ca-certificates \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    fonts-liberation libappindicator3-1 libxss1 \
    && rm -rf /var/lib/apt/lists/*

# Installer uniquement les dépendances du scraper
COPY requirements_scraper.txt .
RUN pip install --no-cache-dir -r requirements_scraper.txt

# Installer Chromium via Playwright
RUN playwright install chromium

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main_scraper:app --host 0.0.0.0 --port ${PORT:-8000}"]
