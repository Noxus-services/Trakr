# Trakr Prospector

Outil interne de prospection commerciale B2B pour entreprises nuisibles/hygiène en France.

## Stack

| Couche | Techno |
|---|---|
| Backend API | Python 3.12, FastAPI (async), SQLAlchemy 2.0 |
| Base de données | PostgreSQL 16 |
| Migrations | Alembic |
| Workers | Celery + Redis |
| Scraping | Playwright (PagesJaunes), httpx (Google, Sirène) |
| Frontend | React 18, TailwindCSS, shadcn/ui, Vite |
| Auth | JWT (Bearer token) |

## Démarrage rapide (Docker)

```bash
# 1. Cloner et configurer les variables d'env
cp backend/.env.example backend/.env
# Éditer backend/.env avec vos clés API

# 2. Lancer tous les services
docker-compose up -d

# 3. Créer un premier utilisateur admin
docker-compose exec backend python -c "
import asyncio
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User

async def create_admin():
    async with AsyncSessionLocal() as db:
        user = User(email='admin@exemple.fr', full_name='Admin', hashed_password=hash_password('admin123'), is_admin=True)
        db.add(user)
        await db.commit()

asyncio.run(create_admin())
"
```

L'application est accessible sur :
- Frontend : http://localhost:5173
- API docs : http://localhost:8000/api/docs
- Flower (Celery) : http://localhost:5555

## Démarrage local (développement)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# Éditer .env

# Lancer PostgreSQL et Redis (via Docker ou localement)
docker run -d -p 5432:5432 -e POSTGRES_USER=trakr -e POSTGRES_PASSWORD=trakr -e POSTGRES_DB=trakr_prospector postgres:16
docker run -d -p 6379:6379 redis:7

# Migrations
alembic upgrade head

# API
uvicorn app.main:app --reload --port 8000

# Worker (dans un autre terminal)
celery -A app.workers.celery_app worker --loglevel=info

# Scheduler Beat (dans un autre terminal)
celery -A app.workers.celery_app beat --loglevel=info
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Modules

### Module 1 — Collecte de prospects

| Source | Endpoint | Méthode |
|---|---|---|
| Google Places API | `POST /api/scraper/google-maps` | API officielle |
| PagesJaunes | `POST /api/scraper/pages-jaunes` | Playwright headless |
| Sirène INSEE | `POST /api/scraper/sirene` | API officielle |
| LinkedIn | `POST /api/scraper/linkedin/import` | Import CSV |

Toutes les tâches de scraping sont exécutées en arrière-plan via Celery.

### Module 2 — Déduplication & Normalisation

- Dédup par SIRET (clé primaire)
- Dédup fuzzy par (nom + ville) avec RapidFuzz (seuil 85%)
- Normalisation téléphone → E.164 (+33...)
- Géocodage via api-adresse.data.gouv.fr
- Score ICP automatique 0–100

### Module 3 — Enrichissement

- Hunter.io (email finder par domaine)
- Dropcontact (email + données entreprise)
- Vérification DNS MX (dnspython)
- Log complet dans `prospect_enrichment_logs`

### Module 4 — CRM Pipeline

- Vue Kanban drag & drop (dnd-kit)
- Vue liste avec filtres avancés
- Fiche prospect (drawer latéral) avec timeline

### Module 5 — Séquences email

- Séquences multi-étapes (email, tâche, appel)
- Templates Jinja2 avec variables prospects
- Tracking ouverture (pixel 1×1) et clic (redirect)
- Désinscription RGPD automatique

### Module 6 — Connecteur Odoo 18

- Push `res.partner` + `crm.lead`
- Webhook deal-closed → mise à jour statut
- Synchronisation batch des prospects "won"

### Module 7 — Dashboard & Analytics

- KPIs : total, taux contact/conversion, score ICP moyen
- Graphiques : NAF (donut), évolution (barres), templates (barres horizontales)

## Codes NAF ciblés

| Code | Secteur |
|---|---|
| 5610A | Restauration rapide |
| 5610C | Restauration traditionnelle |
| 5630Z | Débits de boissons |
| 5510Z | Hôtellerie |
| 4711D | Supermarchés |
| 1013A | IAA — Viande |
| 1089Z | IAA — Autres |

## Scoring ICP

| Critère | Points |
|---|---|
| Code NAF dans liste cible | +30 |
| Effectif 10–200 salariés | +20 |
| Établissement créé < 5 ans | +15 |
| Téléphone trouvé | +20 |
| Email trouvé | +15 |
| **Total max** | **100** |

## RGPD

- Lien de désinscription obligatoire dans chaque email
- Prospects désinscrits exclus de toutes les séquences
- Logging complet des actions avec `user_id`
- Enrichissement via APIs officielles uniquement
