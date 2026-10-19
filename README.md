# Білім Айна — 9-сынып физикасы

Мұғалім мен оқушыларға арналған сайт: 8 бөлім, проблемалық жағдаяттар, тапсырмалар, теория, ЖИ-мен зерттеу.

- Сайт: статикалық HTML/CSS/JS (GitHub Pages)
- Мазмұн: Supabase (Postgres + Auth + Storage)
- Мұғалім кабинеті: `admin.html`

## Баптау
1. Supabase-та жоба құрыңыз.
2. `node supabase/build-seed.js <мұғалім-email>` → `supabase/setup.sql` пайда болады. Оны Supabase SQL Editor-да іске қосыңыз.
3. `js/config.js` ішіне Project URL және anon key жазыңыз.
4. Supabase → Authentication → URL Configuration → Site URL: сайттың адресі.

`js/config.js` бос болса, сайт `js/data.js` ішіндегі мазмұнмен жұмыс істейді.
