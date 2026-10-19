-- Білім Айна: базаның құрылымы, қол жеткізу ережелері және суреттер қоймасы.

create table if not exists public.topics (
  id text primary key,
  position int not null default 0,
  title text not null,
  short text not null default '',
  icon text not null default 'atom',
  color text not null default '#1aa39a',
  problem_title text not null default '',
  problem_text text not null default '',
  problem_questions jsonb not null default '[]',
  problem_image text,
  formulas jsonb not null default '[]',
  ai jsonb not null default '[]',
  teacher text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  topic_id text not null references public.topics(id) on delete cascade,
  position int not null default 0,
  title text not null,
  theory text not null default ''
);

create table if not exists public.tasks (
  id text primary key default gen_random_uuid()::text,
  topic_id text not null references public.topics(id) on delete cascade,
  position int not null default 0,
  title text not null default '',
  type text not null check (type in ('choice', 'number')),
  text text not null default '',
  options jsonb not null default '[]',
  answer numeric not null default 0,
  unit text not null default '',
  tol numeric not null default 0,
  solution text not null default '',
  image text
);

-- Өңдеуге рұқсаты бар мұғалімдердің email тізімі
create table if not exists public.teacher_emails (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teacher_emails where email = lower(auth.jwt() ->> 'email'));
$$;

alter table public.topics enable row level security;
alter table public.sections enable row level security;
alter table public.tasks enable row level security;
alter table public.teacher_emails enable row level security;

-- Барлығы оқи алады, тек мұғалімдер өзгерте алады
do $$
declare t text;
begin
  foreach t in array array['topics', 'sections', 'tasks'] loop
    execute format('drop policy if exists "read all" on public.%I', t);
    execute format('drop policy if exists "teachers write" on public.%I', t);
    execute format('create policy "read all" on public.%I for select using (true)', t);
    execute format('create policy "teachers write" on public.%I for all to authenticated using (public.is_teacher()) with check (public.is_teacher())', t);
  end loop;
end $$;

drop policy if exists "teachers manage" on public.teacher_emails;
create policy "teachers manage" on public.teacher_emails for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

grant select on public.topics, public.sections, public.tasks to anon, authenticated;
grant insert, update, delete on public.topics, public.sections, public.tasks to authenticated;
grant select, insert, delete on public.teacher_emails to authenticated;
grant execute on function public.is_teacher() to anon, authenticated;

-- Суреттер: жария оқу, тек мұғалімдер жүктейді
insert into storage.buckets (id, name, public) values ('images', 'images', true)
  on conflict (id) do update set public = true;

drop policy if exists "teachers upload images" on storage.objects;
drop policy if exists "teachers change images" on storage.objects;
drop policy if exists "teachers delete images" on storage.objects;
create policy "teachers upload images" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.is_teacher());
create policy "teachers change images" on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.is_teacher());
create policy "teachers delete images" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.is_teacher());
