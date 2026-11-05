-- =====================================================================
--  Baby Shower App — esquema Supabase
--  Pegar TODO en Supabase → SQL Editor → Run.
--  ⚠️ ANTES: cambiá el email de abajo por el que vas a usar para el admin.
-- =====================================================================

create table if not exists admins (email text primary key);
insert into admins (email) values (lower('CAMBIAR@EMAIL.COM')) on conflict do nothing;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function is_admin() to anon, authenticated;

-- ---------------------------------------------------------------- Asistencia
create table if not exists rsvps (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 120),
  attending boolean not null,
  adults int not null default 1 check (adults between 0 and 20),
  kids int not null default 0 check (kids between 0 and 20),
  phone text check (length(phone) <= 40),
  message text check (length(message) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Regalos
create table if not exists gifts (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  link text,
  qty int not null default 1 check (qty >= 1),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists gift_reservations (
  id bigint generated always as identity primary key,
  gift_id bigint not null references gifts on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create or replace view gifts_public as
  select g.id, g.name, g.description, g.link, g.qty, g.sort,
         (select count(*) from gift_reservations r where r.gift_id = g.id)::int as reserved
  from gifts g;

create or replace function reserve_gift(p_gift bigint, p_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare q int; c int;
begin
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 120 then
    raise exception 'Nombre inválido';
  end if;
  select qty into q from gifts where id = p_gift for update;
  if q is null then raise exception 'El regalo no existe'; end if;
  select count(*) into c from gift_reservations where gift_id = p_gift;
  if c >= q then return false; end if;
  insert into gift_reservations (gift_id, name) values (p_gift, trim(p_name));
  return true;
end $$;
grant execute on function reserve_gift(bigint, text) to anon, authenticated;

-- ---------------------------------------------------------------- Pre-evento
create table if not exists baby_submissions (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 120),
  path text not null,
  created_at timestamptz not null default now()
);
create table if not exists predictions (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 120),
  birth_date date,
  weight_kg numeric(4,2),
  height_cm numeric(4,1),
  sex text, hair text, eyes text, looks_like text, first_word text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Juegos
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  created_at timestamptz not null default now()
);
create table if not exists questions (
  id bigint generated always as identity primary key,
  kind text not null default 'trivia' check (kind in ('trivia','bebe','encuesta')),
  prompt text not null,
  options jsonb not null default '[]',
  correct int,
  revealed boolean not null default false,
  image_path text,
  hint text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists answers (
  id bigint generated always as identity primary key,
  question_id bigint not null references questions on delete cascade,
  player_id uuid not null references players on delete cascade,
  choice int not null,
  created_at timestamptz not null default now(),
  unique (question_id, player_id)
);
create table if not exists state (
  id int primary key check (id = 1),
  mode text not null default 'bienvenida',
  question_id bigint references questions on delete set null,
  accepting boolean not null default false,
  reveal boolean not null default false,
  correct int,
  auto_approve_photos boolean not null default true,
  auto_approve_wishes boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into state (id) values (1) on conflict do nothing;

create table if not exists photos (
  id bigint generated always as identity primary key,
  path text not null,
  uploader text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists wishes (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 120),
  text text not null check (length(text) between 1 and 600),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace view scores as
  select p.id, p.name,
         coalesce(sum(case when q.correct is not null and a.choice = q.correct then 100 else 0 end), 0)::int as points
  from players p
  left join answers a on a.player_id = p.id
  left join questions q on q.id = a.question_id and q.revealed and q.kind <> 'encuesta'
  group by p.id, p.name;

-- ---------------------------------------------------------------- Permisos (RLS)
alter table admins enable row level security;
alter table rsvps enable row level security;
alter table gifts enable row level security;
alter table gift_reservations enable row level security;
alter table baby_submissions enable row level security;
alter table predictions enable row level security;
alter table players enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;
alter table state enable row level security;
alter table photos enable row level security;
alter table wishes enable row level security;

-- admin: todo
do $$ declare t text; begin
  foreach t in array array['admins','rsvps','gifts','gift_reservations','baby_submissions','predictions',
                           'players','questions','answers','state','photos','wishes'] loop
    execute format('drop policy if exists admin_all on %I', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- invitados (anon)
create policy rsvps_insert on rsvps for insert to anon, authenticated with check (true);
create policy baby_insert on baby_submissions for insert to anon, authenticated with check (true);
create policy pred_insert on predictions for insert to anon, authenticated with check (true);
create policy pred_select on predictions for select to anon, authenticated using (true);
create policy players_insert on players for insert to anon, authenticated with check (true);
create policy players_select on players for select to anon, authenticated using (true);
create policy questions_select on questions for select to anon, authenticated using (true);
create policy state_select on state for select to anon, authenticated using (true);
create policy answers_select on answers for select to anon, authenticated using (true);
create policy answers_insert on answers for insert to anon, authenticated with check (
  exists (select 1 from state s where s.id = 1 and s.accepting and s.question_id = answers.question_id)
);
create policy photos_select on photos for select to anon, authenticated using (approved);
create policy photos_insert on photos for insert to anon, authenticated with check (
  approved = false or (select auto_approve_photos from state where id = 1)
);
create policy wishes_select on wishes for select to anon, authenticated using (approved);
create policy wishes_insert on wishes for insert to anon, authenticated with check (
  approved = false or (select auto_approve_wishes from state where id = 1)
);

-- los invitados no pueden ver la respuesta correcta
revoke select on questions from anon;
grant select (id, kind, prompt, options, image_path, hint, sort) on questions to anon;

grant select on gifts_public, scores to anon, authenticated;

-- ---------------------------------------------------------------- Storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "fotos_insert" on storage.objects;
drop policy if exists "fotos_admin_delete" on storage.objects;
create policy "fotos_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'fotos');
create policy "fotos_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.is_admin());

-- ---------------------------------------------------------------- Realtime
alter publication supabase_realtime add table state, answers, photos, wishes;

-- ---------------------------------------------------------------- Datos iniciales
insert into gifts (name, description, qty, sort) values
  ('Pañales RN (recién nacido)', 'Cualquier marca', 6, 1),
  ('Pañales talle P', 'Cualquier marca', 8, 2),
  ('Pañales talle M', 'Cualquier marca', 8, 3),
  ('Toallitas húmedas', 'Sin perfume', 8, 4),
  ('Bodies manga larga (0-3 meses)', 'Set de 3 o 5', 3, 5),
  ('Bodies manga corta (3-6 meses)', 'Set de 3 o 5', 3, 6),
  ('Mamaderas anticólicos', '', 2, 7),
  ('Toallón con capucha', '', 2, 8),
  ('Bañera con soporte', '', 1, 9),
  ('Mochila / bolso pañalero', '', 1, 10),
  ('Portabebé ergonómico', '', 1, 11),
  ('Monitor de bebé', '', 1, 12),
  ('Móvil musical para cuna', '', 1, 13),
  ('Termómetro digital', '', 1, 14),
  ('Set de higiene (cortauñas, cepillo, aspirador nasal)', '', 1, 15),
  ('Mantas de algodón / muselinas', '', 3, 16);

insert into questions (kind, prompt, options, sort) values
  ('trivia',   '¿Quién se levanta primero a la mañana?', '["Mamá","Papá"]', 1),
  ('trivia',   '¿Quién va a malcriar más al bebé?', '["Mamá","Papá"]', 2),
  ('trivia',   '¿Quién es más probable que se duerma primero en la noche?', '["Mamá","Papá"]', 3),
  ('trivia',   '¿Quién cocina mejor?', '["Mamá","Papá"]', 4),
  ('trivia',   '¿Quién llora más con las películas?', '["Mamá","Papá"]', 5),
  ('trivia',   '¿Quién va a cambiar más pañales?', '["Mamá","Papá"]', 6),
  ('trivia',   '¿Quién tuvo el primer antojo raro?', '["Mamá","Papá"]', 7),
  ('trivia',   '¿Quién eligió el nombre del bebé?', '["Mamá","Papá","Los dos","Todavía discuten"]', 8),
  ('encuesta', '¿A quién se va a parecer el bebé?', '["A mamá","A papá","Mitad y mitad","Al abuelo 😅"]', 9),
  ('encuesta', '¿Qué va a ser primero: caminar o hablar?', '["Caminar","Hablar"]', 10);
