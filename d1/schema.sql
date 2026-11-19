-- Білім Айна: Cloudflare D1 (SQLite) базасының құрылымы.
-- JSON өрістер мәтін ретінде сақталады.

create table if not exists topics (
  id text primary key,
  position integer not null default 0,
  title text not null,
  short text not null default '',
  icon text not null default 'atom',
  color text not null default '#1aa39a',
  problem_title text not null default '',
  problem_text text not null default '',
  problem_questions text not null default '[]',
  problem_image text,
  formulas text not null default '[]',
  ai text not null default '[]',
  teacher text not null default '',
  goal text not null default '',
  updated_at text not null default (datetime('now'))
);

create table if not exists sections (
  id text primary key,
  topic_id text not null references topics(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  theory text not null default ''
);
create index if not exists sections_topic on sections(topic_id, position);

create table if not exists tasks (
  id text primary key,
  topic_id text not null references topics(id) on delete cascade,
  position integer not null default 0,
  title text not null default '',
  tag text not null default '',
  text text not null default '',
  questions text not null default '[]',
  hints text not null default '[]',
  solution text not null default '',
  image text,
  parts text not null default '[]',
  rubric text not null default '[]'
);
create index if not exists tasks_topic on tasks(topic_id, position);

-- Мұғалімдер: құпиясөз PBKDF2-мен хэштеледі; жаңа мұғалім шақыру кодымен құпиясөз қояды
create table if not exists teachers (
  email text primary key,
  pass_hash text,
  invite_hash text,
  invite_expires integer,
  failed integer not null default 0,
  locked_until integer not null default 0,
  added_by text,
  created_at text not null default (datetime('now'))
);

-- Сессиялар: cookie-дегі токеннің SHA-256 хэші ғана сақталады
create table if not exists sessions (
  token_hash text primary key,
  email text not null references teachers(email) on delete cascade,
  expires integer not null
);
