-- ═══════════════════════════════════════════
-- Trakr Prospector — Migration initiale Supabase
-- Coller dans l'éditeur SQL de https://supabase.com/dashboard
-- ═══════════════════════════════════════════

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ── Enum types ─────────────────────────────────────────────────────────────────
create type prospect_source as enum (
  'google_maps', 'pages_jaunes', 'sirene', 'linkedin', 'manual'
);

create type prospect_status as enum (
  'new', 'contacted', 'interested', 'demo', 'won', 'lost'
);

-- ── Table prospects ────────────────────────────────────────────────────────────
create table prospects (
  id               bigserial primary key,
  siret            varchar(14) unique,
  raison_sociale   varchar(255) not null,
  nom_commercial   varchar(255),
  adresse          varchar(500),
  code_postal      varchar(10),
  ville            varchar(150),
  lat              float,
  lng              float,
  tel              varchar(30),
  email            varchar(255),
  email_verified   boolean default false,
  unsubscribed     boolean default false,
  site_web         varchar(500),
  linkedin_url     varchar(500),
  code_naf         varchar(10),
  effectif         integer,
  date_creation    timestamptz,
  contact_prenom   varchar(100),
  contact_nom      varchar(100),
  contact_titre    varchar(200),
  icp_score        integer default 0,
  source           prospect_source default 'manual',
  status           prospect_status default 'new',
  notes            text,
  tags             text[],
  last_contacted_at timestamptz,
  odoo_partner_id  integer,
  google_place_id  varchar(255),
  google_rating    float,
  assigned_to      uuid references auth.users(id) on delete set null,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index idx_prospects_status      on prospects(status);
create index idx_prospects_ville       on prospects(ville);
create index idx_prospects_code_naf    on prospects(code_naf);
create index idx_prospects_icp         on prospects(icp_score desc);
create index idx_prospects_raison_trgm on prospects using gin (raison_sociale gin_trgm_ops);

-- ── Table sequences ────────────────────────────────────────────────────────────
create table sequences (
  id             bigserial primary key,
  name           varchar(255) not null,
  trigger_status varchar(50),
  steps          jsonb default '[]',
  is_active      boolean default true,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ── Table email_templates ──────────────────────────────────────────────────────
create table email_templates (
  id         bigserial primary key,
  name       varchar(255) unique not null,
  subject    varchar(500) not null,
  body_html  text not null,
  created_at timestamptz default now()
);

-- ── Table sequence_enrollments ─────────────────────────────────────────────────
create table sequence_enrollments (
  id           bigserial primary key,
  prospect_id  bigint references prospects(id) on delete cascade,
  sequence_id  bigint references sequences(id) on delete cascade,
  current_step integer default 0,
  is_active    boolean default true,
  enrolled_at  timestamptz default now(),
  last_step_at timestamptz
);

-- ── Table prospect_actions (timeline CRM) ─────────────────────────────────────
create table prospect_actions (
  id           bigserial primary key,
  prospect_id  bigint references prospects(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  action_type  varchar(100) not null,
  description  text,
  scheduled_at timestamptz,
  created_at   timestamptz default now()
);

-- ── Table enrichment_logs ──────────────────────────────────────────────────────
create table enrichment_logs (
  id            bigserial primary key,
  prospect_id   bigint references prospects(id) on delete cascade,
  source        varchar(100) not null,
  field_updated varchar(100) not null,
  old_value     text,
  new_value     text,
  confidence    float,
  created_at    timestamptz default now()
);

-- ── Table outreach_logs ────────────────────────────────────────────────────────
create table outreach_logs (
  id              bigserial primary key,
  prospect_id     bigint references prospects(id) on delete cascade,
  sequence_id     bigint references sequences(id) on delete set null,
  step_index      integer,
  type            varchar(50) not null,
  template_name   varchar(255),
  tracking_id     varchar(255) unique,
  sent_at         timestamptz,
  opened_at       timestamptz,
  clicked_at      timestamptz,
  replied_at      timestamptz,
  unsubscribed_at timestamptz,
  created_at      timestamptz default now()
);

-- ── Trigger updated_at ─────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger prospects_updated_at
  before update on prospects
  for each row execute function update_updated_at();

create trigger sequences_updated_at
  before update on sequences
  for each row execute function update_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────────
alter table prospects          enable row level security;
alter table sequences          enable row level security;
alter table email_templates    enable row level security;
alter table sequence_enrollments enable row level security;
alter table prospect_actions   enable row level security;
alter table enrichment_logs    enable row level security;
alter table outreach_logs      enable row level security;

-- Politique : tout utilisateur authentifié peut tout voir/modifier
-- (multi-tenant à affiner selon vos besoins)
create policy "Authenticated full access — prospects"
  on prospects for all to authenticated using (true) with check (true);

create policy "Authenticated full access — sequences"
  on sequences for all to authenticated using (true) with check (true);

create policy "Authenticated full access — templates"
  on email_templates for all to authenticated using (true) with check (true);

create policy "Authenticated full access — enrollments"
  on sequence_enrollments for all to authenticated using (true) with check (true);

create policy "Authenticated full access — actions"
  on prospect_actions for all to authenticated using (true) with check (true);

create policy "Authenticated full access — enrichment"
  on enrichment_logs for all to authenticated using (true) with check (true);

create policy "Authenticated full access — outreach"
  on outreach_logs for all to authenticated using (true) with check (true);

-- ── Données initiales — Templates email ────────────────────────────────────────
insert into email_templates (name, subject, body_html) values
(
  'intro_nuisibles',
  'Protégez votre établissement contre les nuisibles — {{raison_sociale}}',
  '<p>Bonjour,</p>
<p>Votre établissement <strong>{{raison_sociale}}</strong> à {{ville}} nous a été signalé comme un potentiel bénéficiaire de nos services de lutte contre les nuisibles.</p>
<p>Nous proposons :</p>
<ul>
  <li>Diagnostic gratuit de vos locaux</li>
  <li>Traitement préventif et curatif (HACCP)</li>
  <li>Certification conforme aux normes sanitaires</li>
</ul>
<p>Seriez-vous disponible pour un échange rapide cette semaine ?</p>
<p>Cordialement,<br>L''équipe commerciale</p>'
),
(
  'suivi_1',
  'Suite à notre message — {{raison_sociale}}',
  '<p>Bonjour,</p>
<p>Je reviens vers vous concernant la protection sanitaire de votre établissement {{raison_sociale}}.</p>
<p>Avez-vous eu le temps de consulter notre proposition ?</p>
<p>Cordialement</p>'
),
(
  'derniere_chance',
  'Dernière relance — offre spéciale pour {{raison_sociale}}',
  '<p>Bonjour,</p>
<p>C''est mon dernier message concernant nos services pour <strong>{{raison_sociale}}</strong>.</p>
<p>Pour tout établissement contacté ce mois-ci, nous offrons un <strong>diagnostic gratuit</strong>.</p>
<p>Cette offre expire dans 7 jours.</p>
<p>Cordialement</p>'
);

-- ── Séquences initiales ────────────────────────────────────────────────────────
insert into sequences (name, trigger_status, steps) values
(
  'Séquence Restauration',
  'new',
  '[
    {"day": 0, "type": "email", "template": "intro_nuisibles"},
    {"day": 3, "type": "email", "template": "suivi_1"},
    {"day": 7, "type": "task", "description": "Appel téléphonique"},
    {"day": 14, "type": "email", "template": "derniere_chance"}
  ]'::jsonb
),
(
  'Séquence Hôtellerie',
  'new',
  '[
    {"day": 0, "type": "email", "template": "intro_nuisibles"},
    {"day": 5, "type": "call", "description": "Appel de présentation"},
    {"day": 10, "type": "email", "template": "suivi_1"}
  ]'::jsonb
);
