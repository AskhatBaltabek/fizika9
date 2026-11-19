// Cloudflare Worker: сайт файлдарын береді, D1 базасынан мазмұнды оқиды, мұғалім кабинетінің API-ін
// және жауапты ЖИ-мен тексеруді жүзеге асырады. Балл кодпен есептеледі (js/grade.js), ЖИ тек түсініктеме жазады.
import '../js/grade.js';
import '../js/cases.js';
import { handleAuth, currentTeacher } from './auth.js';
import { handleAdmin } from './admin.js';

const MAX_ANSWER = 3000;

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

const parse = (v, def) => { try { return JSON.parse(v); } catch { return def; } };

// Бүкіл мазмұн бір сұраныспен: тақырыптар + бөлімдер + есептер
async function loadContent(env) {
  const [t, s, x] = await env.DB.batch([
    env.DB.prepare('select * from topics order by position'),
    env.DB.prepare('select id, topic_id, title, theory from sections order by position'),
    env.DB.prepare('select * from tasks order by position'),
  ]);
  return t.results.map(r => ({
    id: r.id, title: r.title, short: r.short, icon: r.icon, color: r.color,
    problem: { title: r.problem_title, text: r.problem_text, questions: parse(r.problem_questions, []), image: r.problem_image },
    formulas: parse(r.formulas, []), ai: parse(r.ai, []), teacher: r.teacher,
    sections: s.results.filter(z => z.topic_id === r.id).map(z => ({ id: z.id, title: z.title, theory: z.theory })),
    tasks: x.results.filter(z => z.topic_id === r.id).map(z => ({
      id: z.id, title: z.title, tag: z.tag, text: z.text, questions: parse(z.questions, []),
      hints: parse(z.hints, []), solution: z.solution, image: z.image,
    })),
  }));
}

// Алдымен базадан; база қолжетімсіз болса — кірістірілген есептерден (js/cases.js)
async function loadTask(env, id) {
  try {
    const r = await env.DB.prepare('select id, title, text, questions, hints, solution from tasks where id = ?').bind(id).first();
    return r && { ...r, questions: parse(r.questions, []), hints: parse(r.hints, []) };
  } catch (e) {
    console.log('db unavailable, using built-in tasks:', e.message);
    return Object.values(globalThis.CASES).flat().find(t => t.id === id) || null;
  }
}

const fmtNum = n => String(n).replace('.', ',');

function describeTask(task, grade) {
  return task.questions.map((q, i) => {
    const key = q.kind === 'text' ? (q.accept || [])[0] : `${fmtNum(q.answer)} ${q.unit || ''}`.trim();
    const status = grade ? (grade.results[i].ok ? 'CORRECT' : 'NOT FOUND / WRONG') : '';
    return `${i + 1}-сұрақ (${q.points} pt): ${q.text}\n   correct answer: ${key}${status ? `\n   automatic check: ${status}` : ''}`;
  }).join('\n');
}

const SYSTEM = `You are a kind physics teacher's assistant for 9th grade students in Kazakhstan.
ALWAYS write ONLY in the Kazakh language (Cyrillic), correct and simple. Address the student as "сен" everywhere (never "сіз", never "-ңыз/-іңіз" forms).
Refer to questions as "1-сұрақ", "2-сұрақ" (never "Q1"). Write formulas as plain text like v = s / t (no $ signs, no LaTeX).
Never reveal the correct final numeric answers of questions the student got wrong or has not solved yet.
Do not use markdown headings, tables or LaTeX. Plain text, short.`;

function checkPrompt(task, grade, answer) {
  return `Task: ${task.title}
Situation: ${task.text}

Questions (the score was computed automatically and is final, do not change it):
${describeTask(task, grade)}

Teacher's reference solution (for you only): ${task.solution}

Student score: ${grade.score} / ${grade.max}
Student's answer:
"""${answer}"""

Write feedback to the student in Kazakh, 2–4 short sentences:
- what is done well (formula, steps, units);
- for each wrong question, name the likely mistake (wrong formula, units, arithmetic, missing step) and what to check, WITHOUT giving the correct number;
- if everything is correct, praise briefly.`;
}

function hintPrompt(task, grade, answer) {
  const next = grade.results.findIndex(r => !r.ok);
  return `Task: ${task.title}
Situation: ${task.text}

Questions:
${describeTask(task, grade)}

Teacher's reference solution (for you only): ${task.solution}

Student's current work:
"""${answer || '(empty)'}"""

The student asked for help. Give ONE short hint in Kazakh (1–2 sentences) for ${next + 1}-сұрақ:
point to the needed formula or the next step, based on what the student already wrote. Do NOT give the final number.`;
}

// Модель кейде LaTeX немесе «Q1» деп жазады — оқушыға түсінікті мәтінге келтіреміз
const GREEK = { mu: 'μ', Delta: 'Δ', lambda: 'λ', nu: 'ν', cdot: '·', pi: 'π', times: '×' };
function cleanAI(text) {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\bQ(\d+)\b/g, '$1-сұрақ')
    .replace(/\\(mu|Delta|lambda|nu|cdot|pi|times)\b/g, (_, w) => GREEK[w])
    .replace(/\$+/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function askAI(env, prompt) {
  const out = await env.AI.run(env.AI_MODEL, {
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.3,
  });
  const text = typeof out === 'string' ? out : (out.response ?? out.choices?.[0]?.message?.content ?? '');
  return cleanAI(text);
}

async function handleCheck(env, path, body) {
  const answer = String(body.answer || '').slice(0, MAX_ANSWER);
  if (!body.taskId) return json({ error: 'taskId' }, 400);

  const task = await loadTask(env, String(body.taskId));
  if (!task) return json({ error: 'not found' }, 404);
  const grade = globalThis.gradeCase(task, answer);

  if (path === '/api/check') {
    if (!answer.trim()) return json({ error: 'empty' }, 400);
    let feedback = '';
    if (!grade.spam) {
      try { feedback = await askAI(env, checkPrompt(task, grade, answer)); } catch (e) { console.log('ai error', e.message); }
    }
    return json({ ...grade, feedback });
  }

  if (grade.score === grade.max && answer.trim()) return json({ hint: 'Барлық сұраққа дұрыс жауап бердің — көмек қажет емес! 👏' });
  try { return json({ hint: await askAI(env, hintPrompt(task, grade, answer)) }); }
  catch (e) { console.log('ai error', e.message); return json({ error: 'ai' }, 503); }
}

async function handleApi(request, env, path) {
  if (path === '/api/content' && request.method === 'GET') return json(await loadContent(env));
  if (path === '/api/auth/me' && request.method === 'GET') return handleAuth(path, request, env, {}, json);
  if (path === '/api/admin/teachers' && request.method === 'GET') {
    const me = await currentTeacher(request, env);
    return me ? handleAdmin(path, request, env, {}, json, me) : json({ error: 'unauthorized' }, 401);
  }
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  // Тек JSON немесе сурет: басқа сайттың формасы мұндай сұранысты CORS-сыз жібере алмайды (CSRF-тен қорғаныс)
  const type = request.headers.get('content-type') || '';
  const isImage = path === '/api/admin/images' && type.startsWith('image/');
  if (!isImage && !type.startsWith('application/json')) return json({ error: 'content-type' }, 415);
  let body = {};
  if (!isImage) { try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); } }

  if (path === '/api/check' || path === '/api/hint') return handleCheck(env, path, body);
  if (path.startsWith('/api/auth/')) return handleAuth(path, request, env, body, json);
  if (path.startsWith('/api/admin/')) {
    const me = await currentTeacher(request, env);
    if (!me) return json({ error: 'unauthorized' }, 401);
    return handleAdmin(path, request, env, body, json, me);
  }
  return json({ error: 'not found' }, 404);
}

// Суреттер KV-де: /img/<тақырып>/<файл>
async function serveImage(env, key) {
  const { value, metadata } = await env.IMAGES.getWithMetadata(key, 'stream');
  if (!value) return new Response('Not found', { status: 404 });
  return new Response(value, { headers: { 'content-type': metadata?.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, pathname); }
      catch (e) { console.log('api error', e.stack || e.message); return json({ error: 'server' }, 500); }
    }
    if (pathname.startsWith('/img/')) return serveImage(env, decodeURIComponent(pathname.slice(5)));
    return env.ASSETS.fetch(request);
  },
};
