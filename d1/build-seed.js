// js/data.js + js/cases.js мазмұнынан D1 үшін SQL жасайды: node d1/build-seed.js → d1/seed.sql
// Іске қосу: npx wrangler d1 execute fizika9 --remote --file d1/schema.sql && ... --file d1/seed.sql
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const TOPICS = new Function(read('js/data.js') + '\n' + read('js/cases.js') + '; return TOPICS;')();

const q = v => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const j = v => q(JSON.stringify(v));

let sql = '-- Бастапқы мазмұн (d1/build-seed.js жасаған). Бар жазбалар өзгертілмейді.\n';
TOPICS.forEach((t, i) => {
  sql += `insert or ignore into topics (id, position, title, short, icon, color, problem_title, problem_text, problem_questions, formulas, ai, teacher) values (${q(t.id)}, ${i}, ${q(t.title)}, ${q(t.short)}, ${q(t.icon)}, ${q(t.color)}, ${q(t.problem.title)}, ${q(t.problem.text)}, ${j(t.problem.questions)}, ${j(t.formulas)}, ${j(t.ai)}, ${q(t.teacher)});\n`;
  t.sections.forEach((s, k) => {
    sql += `insert or ignore into sections (id, topic_id, position, title) values (${q(`${t.id}-s${k + 1}`)}, ${q(t.id)}, ${k}, ${q(s)});\n`;
  });
  t.tasks.forEach((x, k) => {
    sql += `insert or ignore into tasks (id, topic_id, position, title, tag, text, questions, hints, solution) values (${q(x.id)}, ${q(t.id)}, ${k}, ${q(x.title)}, ${q(x.tag || '')}, ${q(x.text)}, ${j(x.questions)}, ${j(x.hints || [])}, ${q(x.solution)});\n`;
  });
});
fs.writeFileSync(path.join(__dirname, 'seed.sql'), sql);
console.log('d1/seed.sql дайын:', TOPICS.length, 'тақырып,', TOPICS.reduce((a, t) => a + t.tasks.length, 0), 'есеп');
