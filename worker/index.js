// Cloudflare Worker: сайт файлдарын береді, D1 базасынан мазмұнды оқиды, мұғалім кабинетінің API-ін
// және жауапты тексереді: таңдау/сәйкестендіру/есепті код бағалайды (js/grade.js), логикалық дәлелдеуді — ЖИ критерийлер бойынша.
import '../js/grade.js';
import '../js/cases.js';
import '../js/tasks.js';
import { handleAuth, currentTeacher } from './auth.js';
import { handleAdmin } from './admin.js';

const MAX_ANSWER = 4000;

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

const parse = (v, def) => { try { return JSON.parse(v); } catch { return def; } };

// Бүкіл мазмұн бір сұраныспен: тақырыптар + бөлімдер + тапсырмалар
async function loadContent(env) {
  const [t, s, x] = await env.DB.batch([
    env.DB.prepare('select * from topics order by position'),
    env.DB.prepare('select id, topic_id, title, theory from sections order by position'),
    env.DB.prepare('select * from tasks order by position'),
  ]);
  return t.results.map(r => ({
    id: r.id, title: r.title, short: r.short, icon: r.icon, color: r.color, goal: r.goal || '',
    problem: { title: r.problem_title, text: r.problem_text, questions: parse(r.problem_questions, []), image: r.problem_image },
    formulas: parse(r.formulas, []), ai: parse(r.ai, []), teacher: r.teacher,
    sections: s.results.filter(z => z.topic_id === r.id).map(z => ({ id: z.id, title: z.title, theory: z.theory })),
    tasks: x.results.filter(z => z.topic_id === r.id).map(taskRow),
  }));
}

const taskRow = z => ({
  id: z.id, title: z.title, tag: z.tag, text: z.text, image: z.image,
  parts: parse(z.parts, []), rubric: parse(z.rubric, []), hints: parse(z.hints, []), solution: z.solution,
});

// Алдымен базадан; база қолжетімсіз болса — кірістірілген тапсырмалардан (js/tasks.js)
async function loadTask(env, id) {
  try {
    const r = await env.DB.prepare('select * from tasks where id = ?').bind(id).first();
    return r && taskRow(r);
  } catch (e) {
    console.log('db unavailable, using built-in tasks:', e.message);
    return globalThis.allBuiltinTasks().find(t => t.id === id) || null;
  }
}

// Оқушы жауабын ЖИ-ге түсінікті мәтінге айналдыру
function studentAnswer(part, v) {
  const L = globalThis.LETTERS;
  switch (part.kind) {
    case 'choice': return v == null || v === '' ? '(жауап жоқ)' : `${L[v]}) ${part.options[v] || ''}`;
    case 'match': return (part.left || []).map((_, i) => `${i + 1}—${v?.[i] == null || v[i] === '' ? '?' : L[v[i]]}`).join(', ');
    case 'tf': return (part.statements || []).map((_, i) => `${i + 1}—${v?.[i] === true ? 'Дұрыс' : v?.[i] === false ? 'Бұрыс' : '?'}`).join(', ');
    default: return String(v || '').trim() || '(бос)';
  }
}

function describe(task, answers, grade) {
  return task.parts.map((p, i) => {
    const r = grade.results[i];
    const status = p.kind === 'open' ? 'TO BE GRADED BY YOU' : `auto-graded: ${r.points}/${r.max}`;
    return `PART ${p.label}) [${p.kind}, ${p.points} pt, ${status}]
   Question: ${p.text}${p.table ? `\n   Table: ${JSON.stringify(p.table)}` : ''}
   Correct answer / criteria: ${globalThis.partKey(p)}
   Student: """${studentAnswer(p, answers[i]).slice(0, MAX_ANSWER)}"""`;
  }).join('\n\n');
}

const SYSTEM = `You are a fair physics teacher's assistant for 9th grade students in Kazakhstan.
ALWAYS write ONLY in the Kazakh language (Cyrillic), correct and simple. Address the student as "сен" (never "сіз", never "-ңыз/-іңіз" forms).
Refer to parts as "а) бөлім", "ә) бөлім", "б) бөлім". Write formulas as plain text like v = s / t (no $ signs, no LaTeX, no markdown).
Never reveal the correct final numeric answers of parts the student got wrong or left empty.`;

function checkPrompt(task, answers, grade) {
  const open = task.parts.map((p, i) => ({ p, i })).filter(x => x.p.kind === 'open');
  return `Task: ${task.title}
Situation: ${task.text}

${describe(task, answers, grade)}

Teacher's reference solution (for you only): ${task.solution}

1) Grade each "open" part strictly by its criteria (each criterion says how many points it gives). Give a point only if the student's text really contains that idea; empty or off-topic answers get 0. Do not give more than the part's maximum.
2) Write short feedback for the whole task (2–4 sentences, Kazakh): what is good, which parts are wrong and what to check (formula, units, arithmetic, reasoning), without giving correct numbers.

Answer ONLY with JSON, no other text:
{"open": [${open.map(x => `{"part": "${x.p.label}", "points": <0..${x.p.points}>, "comment": "<1 sentence in Kazakh>"}`).join(', ')}], "feedback": "<2-4 sentences in Kazakh>"}`;
}

function hintPrompt(task, answers, grade) {
  const i = Math.max(0, grade.results.findIndex((r, k) => task.parts[k].kind === 'open' ? !String(answers[k] || '').trim() : !r.ok));
  return `Task: ${task.title}
Situation: ${task.text}

${describe(task, answers, grade)}

Teacher's reference solution (for you only): ${task.solution}

The student asked for help with part ${task.parts[i].label}). Give ONE short hint in Kazakh (1–2 sentences):
point to the needed law, formula or next step, based on what the student already wrote. Do NOT give the final answer, number or letter.`;
}

// Модель кейде LaTeX немесе «Q1» деп жазады — оқушыға түсінікті мәтінге келтіреміз
const GREEK = { mu: 'μ', Delta: 'Δ', lambda: 'λ', nu: 'ν', cdot: '·', pi: 'π', times: '×', alpha: 'α', varphi: 'φ', phi: 'φ', omega: 'ω' };
function cleanAI(text) {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\\(mu|Delta|lambda|nu|cdot|pi|times|alpha|varphi|phi|omega)\b/g, (_, w) => GREEK[w])
    .replace(/\\(frac|sqrt)\{([^}]*)\}\{([^}]*)\}/g, '($2)/($3)')
    .replace(/[$*#]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// Qwen3 әдепкіде алдымен «ойланады» және токен лимитін соған жұмсап қоюы мүмкін — «/no_think» бұны өшіреді
async function askAI(env, prompt, max_tokens = 900) {
  const out = await env.AI.run(env.AI_MODEL, {
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt + '\n/no_think' }],
    max_tokens, temperature: 0.2,
  });
  const res = typeof out === 'string' ? out : (out.response ?? out.choices?.[0]?.message?.content ?? '');
  // Workers AI жауап JSON болса, оны өзі объектіге айналдырып береді
  if (res && typeof res === 'object') return JSON.stringify(res);
  const text = String(res).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!text) console.log('ai empty answer', JSON.stringify(out).slice(0, 300));
  return text;
}

// ЖИ жауабынан JSON-ды шығарып алу (модель кейде алдына-артына мәтін қосады)
function parseAIJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const normAnswers = (task, raw) => task.parts.map((p, i) => {
  const v = raw?.[i];
  if (p.kind === 'calc' || p.kind === 'open') return String(v ?? '').slice(0, MAX_ANSWER);
  if (p.kind === 'choice') return v === '' || v == null ? null : Number(v);
  if (p.kind === 'match') return Array.isArray(v) ? v.slice(0, 10).map(x => x === '' || x == null ? null : Number(x)) : [];
  if (p.kind === 'tf') return Array.isArray(v) ? v.slice(0, 10).map(x => typeof x === 'boolean' ? x : null) : [];
  return null;
});

async function handleCheck(env, path, body) {
  if (!body.taskId) return json({ error: 'taskId' }, 400);
  const task = await loadTask(env, String(body.taskId));
  if (!task) return json({ error: 'not found' }, 404);
  const answers = normAnswers(task, body.answers);
  const grade = globalThis.gradeTask(task, answers);
  const anyAnswer = grade.results.some(r => !r.empty);

  if (path === '/api/check') {
    if (!anyAnswer) return json({ error: 'empty', message: 'Алдымен жауап жаз.' }, 400);
    let feedback = '', aiOk = false;
    if (!grade.results.some(r => r.spam)) {
      try {
        const raw = await askAI(env, checkPrompt(task, answers, grade), 1200);
        const ai = parseAIJson(raw);
        if (!ai) console.log('ai bad json', raw.slice(0, 600));
        if (ai) {
          aiOk = true;
          feedback = cleanAI(ai.feedback || '');
          const openIdx = task.parts.map((p, i) => p.kind === 'open' ? i : -1).filter(i => i >= 0);
          task.parts.forEach((p, i) => {
            if (p.kind !== 'open') return;
            const r = grade.results[i];
            // Бөлімді әрпі бойынша табамыз («б», «б)», «б) бөлім»); табылмаса — реті бойынша
            const g = (ai.open || []).find(o => String(o.part).trim().toLowerCase().startsWith(p.label))
              || (ai.open || [])[openIdx.indexOf(i)];
            r.pending = false;
            r.points = r.empty ? 0 : Math.max(0, Math.min(p.points, Math.round(Number(g?.points) || 0)));
            r.ok = r.points === r.max;
            r.comment = r.empty ? '' : cleanAI(g?.comment || '');
            r.ai = true;
          });
        }
      } catch (e) { console.log('ai error', e.message); }
    }
    grade.score = grade.results.reduce((a, r) => a + r.points, 0);
    grade.pending = grade.results.some(r => r.pending);
    return json({ ...grade, feedback, aiOk });
  }

  if (grade.score === grade.max) return json({ hint: 'Барлық бөлімге дұрыс жауап бердің — көмек қажет емес! 👏' });
  try { return json({ hint: cleanAI(await askAI(env, hintPrompt(task, answers, grade), 500)) }); }
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
