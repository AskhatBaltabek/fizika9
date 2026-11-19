# Білім Айна — 9-сынып физикасы

Мұғалім мен оқушыларға арналған сайт: 8 бөлім, проблемалық жағдаяттар, теория, жағдаяттық есептер (балл кодпен, түсініктеме ЖИ-мен).

Бәрі бір Cloudflare аккаунтында, тегін: https://fizika9.i-b-aseke.workers.dev

- Сайт: статикалық HTML/CSS/JS (`dist/` → Workers static assets)
- Сервер: `worker/` — мазмұн API, мұғалімдердің кіруі (шақыру коды + құпиясөз), админка API, ЖИ-тексеру
- Мазмұн мен мұғалімдер: Cloudflare D1 (SQLite) — `d1/schema.sql`
- Суреттер: Workers KV
- ЖИ: Workers AI (`AI_MODEL` — `wrangler.jsonc`)
- Мұғалім кабинеті: `/admin`

## Жариялау
```sh
sh deploy.sh
```

## Жаңа базаны баптау
```sh
npx wrangler d1 execute fizika9 --remote --file d1/schema.sql
node d1/build-seed.js && npx wrangler d1 execute fizika9 --remote --file d1/seed.sql
```
Алғашқы мұғалімге шақыру кодын `teachers` кестесіне `invite_hash` (кодтың SHA-256, сызықшасыз, бас әріппен) ретінде жазыңыз; қалғандарын ол кабинеттен қосады.

Сервер жауап бермесе, сайт `js/data.js` + `js/cases.js` ішіндегі кірістірілген мазмұнды көрсетеді.
