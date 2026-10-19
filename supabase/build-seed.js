// js/data.js мазмұнынан supabase/setup.sql жасайды: node supabase/build-seed.js <мұғалім-email>
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const TOPICS = new Function(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '; return TOPICS;')();

const q = v => v == null ? 'null' : `$q$${v}$q$`;
const j = v => `${q(JSON.stringify(v))}::jsonb`;
const email = (process.argv[2] || '').trim().toLowerCase();

let sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
sql += '\n-- Бастапқы мазмұн\n';
TOPICS.forEach((t, i) => {
  sql += `insert into public.topics (id, position, title, short, icon, color, problem_title, problem_text, problem_questions, formulas, ai, teacher) values (${q(t.id)}, ${i}, ${q(t.title)}, ${q(t.short)}, ${q(t.icon)}, ${q(t.color)}, ${q(t.problem.title)}, ${q(t.problem.text)}, ${j(t.problem.questions)}, ${j(t.formulas)}, ${j(t.ai)}, ${q(t.teacher)}) on conflict (id) do nothing;\n`;
  t.sections.forEach((s, k) => {
    sql += `insert into public.sections (topic_id, position, title) select ${q(t.id)}, ${k}, ${q(s)} where not exists (select 1 from public.sections where topic_id = ${q(t.id)} and title = ${q(s)});\n`;
  });
  t.tasks.forEach((x, k) => {
    sql += `insert into public.tasks (id, topic_id, position, title, type, text, options, answer, unit, tol, solution) values (${q(x.id)}, ${q(t.id)}, ${k}, ${q(x.title)}, ${q(x.type)}, ${q(x.text)}, ${j(x.options || [])}, ${x.answer}, ${q(x.unit || '')}, ${x.tol || 0}, ${q(x.solution)}) on conflict (id) do nothing;\n`;
  });
});
if (email) sql += `\ninsert into public.teacher_emails (email) values (${q(email)}) on conflict do nothing;\n`;

fs.writeFileSync(path.join(__dirname, 'setup.sql'), sql);
console.log('supabase/setup.sql дайын', email ? `(мұғалім: ${email})` : '');
