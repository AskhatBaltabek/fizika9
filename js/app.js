// Ортақ шапка, рөл ауыстырғыш, тапсырмаларды тексеру және әр беттің рендері.

const store = {
  get(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
};

const done = new Set(store.get('f9-done', []));
const markDone = id => { done.add(id); store.set('f9-done', [...done]); };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let DATA = [];
const topicById = id => DATA.find(t => t.id === id);

// Теория мәтіні: Markdown → қауіпсіз HTML
const md = text => (window.marked && window.DOMPurify)
  ? DOMPurify.sanitize(marked.parse(text || ''))
  : esc(text || '').replace(/\n/g, '<br>');

// Мазмұнды жүктеп, бетті салу
async function boot(active, render) {
  renderHeader(active);
  const root = document.querySelector('[data-root]');
  try {
    DATA = await loadTopics();
    render();
  } catch (e) {
    console.error(e);
    if (root) root.innerHTML = '<div class="empty">Мазмұнды жүктеу мүмкін болмады. Интернетті тексеріп, бетті жаңартыңыз.</div>';
  }
}

const LOGO = `<svg viewBox="0 0 32 32"><rect x="5" y="3" width="20" height="26" rx="3" fill="#5fe0d5"/><rect x="8" y="3" width="17" height="26" rx="2" fill="#1aa39a"/><path d="M12 10h9M12 15h9M12 20h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;

function renderHeader(active) {
  const links = [
    ['index', 'index.html', 'Басты бет'],
    ['topics', 'index.html#topics', 'Тақырыптар'],
    ['tasks', 'tasks.html', 'Тапсырмалар жинағы'],
    ['method', 'method.html', 'Әдістемелік нұсқау'],
  ];
  const el = document.createElement('header');
  el.className = 'header';
  el.innerHTML = `
    <div class="header-in">
      <button class="icon-btn burger" aria-label="Мәзір">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <a class="brand" href="index.html">${LOGO}<span>БІЛІМ АЙНА</span></a>
      <nav class="nav">${links.map(([k, href, label]) =>
        `<a href="${href}" class="${k === active ? 'active' : ''}">${label}</a>`).join('')}</nav>
      <div class="header-tools">
        <form class="search" action="tasks.html">
          <input name="q" type="search" placeholder="Іздеу..." aria-label="Іздеу">
        </form>
        <button class="icon-btn search-btn" aria-label="Іздеу">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        </button>
        <button class="role" title="Рөлді ауыстыру">
          <span class="ava"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0z"/></svg></span>
          <span class="lbl"></span>
        </button>
      </div>
    </div>`;
  document.body.prepend(el);

  el.querySelector('.burger').onclick = () => el.querySelector('.nav').classList.toggle('open');
  const form = el.querySelector('.search');
  el.querySelector('.search-btn').onclick = () => {
    if (form.classList.contains('open') && form.q.value.trim()) return form.submit();
    form.classList.toggle('open');
    form.q.focus();
  };

  const roleBtn = el.querySelector('.role');
  const applyRole = () => {
    const teacher = store.get('f9-role', 'student') === 'teacher';
    document.body.classList.toggle('teacher', teacher);
    roleBtn.querySelector('.lbl').textContent = teacher ? 'Мұғалім' : 'Оқушы';
    roleBtn.title = teacher ? 'Оқушы режиміне ауысу' : 'Мұғалім режиміне ауысу (жауаптар көрінеді)';
  };
  roleBtn.onclick = () => {
    store.set('f9-role', store.get('f9-role', 'student') === 'teacher' ? 'student' : 'teacher');
    applyRole();
  };
  applyRole();

  const foot = document.createElement('footer');
  foot.className = 'footer';
  foot.textContent = '© Білім Айна — 9-сынып физикасы. Функционалдық сауаттылық және жасанды интеллект.';
  document.body.append(foot);
}

// ---------- Жағдаяттық есеп карточкасы ----------
const scores = store.get('f9-scores', {});   // { taskId: ең жақсы балл }
const maxOf = task => task.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
const fmt = n => String(n).replace('.', ',');

function taskHTML(task, idx, topic) {
  const max = maxOf(task);
  const best = scores[task.id];
  const keyOf = q => q.kind === 'text' ? (q.accept || []).join(' / ') : `${fmt(q.answer)} ${q.unit || ''}`;
  return `
    <div class="box task case" data-id="${task.id}">
      <div class="case-top">
        <span class="tag">${esc(task.tag || topic?.title || 'Физика')}</span>
        <span class="max">${best != null ? `<b class="${best === max ? 'ok' : ''}">Ең жақсы: ${fmt(best)}</b> · ` : ''}Максимум: ${max} балл</span>
      </div>
      <h3>${idx}. ${esc(task.title)}</h3>
      <p class="case-text">${esc(task.text)}</p>
      ${task.image ? `<img class="task-img" src="${esc(task.image)}" alt="" loading="lazy">` : ''}
      <h4>Орындауға арналған сұрақтар</h4>
      <ol class="qs">${task.questions.map((q, k) => `
        <li data-q="${k}"><b>${k + 1}-сұрақ.</b> ${esc(q.text)} <span class="pts">${q.points} балл</span>
          <span class="mark"></span>
          <span class="answer-key teacher-only">Жауабы: ${esc(keyOf(q))}</span></li>`).join('')}</ol>
      <label class="ans-label">Жауабыңды осында жаз
        <span>Формула, есептеу жолы және қорытындыңды жазуға болады.</span>
        <textarea rows="5" placeholder="Мысалы: Берілгені..., Формуласы..., Есептеуі..., Жауабы..."></textarea>
      </label>
      <div class="case-btns">
        <button class="check">Жауапты тексеру</button>
        <button class="ghost help">Көмек алу</button>
        <button class="ghost clear">Тазалау</button>
      </div>
      <div class="hints"></div>
      <div class="result" hidden></div>
      <details class="solution-box teacher-only-open"><summary>Эталон шешімі</summary><p>${esc(task.solution)}</p></details>
    </div>`;
}

async function callApi(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function bindTasks(root, tasks) {
  root.querySelectorAll('.task.case').forEach(el => {
    const task = tasks.find(t => t.id === el.dataset.id);
    const ta = el.querySelector('textarea');
    const result = el.querySelector('.result');
    const hintsBox = el.querySelector('.hints');
    const draftKey = 'f9-draft-' + task.id;
    let hintsShown = 0;

    ta.value = store.get(draftKey, '');
    ta.addEventListener('input', () => store.set(draftKey, ta.value));

    const showMarks = grade => el.querySelectorAll('.qs li').forEach((li, k) => {
      li.classList.toggle('q-ok', grade.results[k].ok);
      li.classList.toggle('q-no', !grade.results[k].ok);
      li.querySelector('.mark').textContent = grade.results[k].ok ? '✓' : '✗';
    });

    el.querySelector('.check').onclick = async () => {
      const answer = ta.value.trim();
      result.hidden = false;
      if (!answer) { result.className = 'result no'; result.textContent = 'Алдымен жауабыңды жаз.'; return; }
      const grade = gradeCase(task, answer);   // балл бірден, интернетсіз де
      showMarks(grade);
      if (scores[task.id] == null || grade.score > scores[task.id]) {
        scores[task.id] = grade.score; store.set('f9-scores', scores);
        el.querySelector('.case-top .max').innerHTML = `<b class="${grade.score === grade.max ? 'ok' : ''}">Ең жақсы: ${fmt(grade.score)}</b> · Максимум: ${grade.max} балл`;
      }
      if (grade.score === grade.max) markDone(task.id);
      result.className = 'result ' + (grade.score === grade.max ? 'ok' : grade.score ? 'part' : 'no');
      result.innerHTML = `<div class="score">Нәтиже: ${fmt(grade.score)} / ${grade.max} балл</div>` +
        (grade.spam ? '<p>Жауапта сандар тым көп. Тек шешіміңді жаз.</p>' : '<p class="ai muted">🤖 ЖИ жауабыңды талдап жатыр...</p>');
      el.querySelector('.solution-box').classList.add('can-open');
      if (grade.spam) return;
      try {
        const r = await callApi('/api/check', { taskId: task.id, answer });
        result.querySelector('.ai').className = 'ai';
        result.querySelector('.ai').textContent = r.feedback ? '🤖 ' + r.feedback : 'Балл есептелді. ЖИ түсініктемесі қазір қолжетімсіз.';
      } catch {
        result.querySelector('.ai').textContent = 'Балл есептелді. ЖИ түсініктемесі қазір қолжетімсіз.';
      }
    };

    el.querySelector('.help').onclick = async () => {
      const add = (text, ai) => hintsBox.insertAdjacentHTML('beforeend', `<div class="hint${ai ? ' ai' : ''}">💡 ${esc(text)}</div>`);
      if (hintsShown < task.hints.length) { add(task.hints[hintsShown++]); return; }
      const btn = el.querySelector('.help');
      btn.disabled = true; btn.textContent = 'Ойланып жатыр...';
      try { add((await callApi('/api/hint', { taskId: task.id, answer: ta.value })).hint, true); }
      catch { add('Қазір қосымша көмек қолжетімсіз. Мұғалімнен сұра немесе эталон шешімін тексеріп көр.'); }
      finally { btn.disabled = false; btn.textContent = 'Көмек алу'; }
    };

    el.querySelector('.clear').onclick = () => {
      ta.value = ''; store.set(draftKey, '');
      result.hidden = true; hintsBox.innerHTML = ''; hintsShown = 0;
      el.querySelectorAll('.qs li').forEach(li => { li.classList.remove('q-ok', 'q-no'); li.querySelector('.mark').textContent = ''; });
      ta.focus();
    };
  });
}

// ---------- Басты бет ----------
function renderHome() {
  document.getElementById('cards').innerHTML = DATA.map((t, i) => {
    const n = t.tasks.filter(x => done.has(x.id)).length;
    return `
      <a class="card" href="topic.html?t=${t.id}">
        <span class="num">${i + 1}</span>
        <div class="ic">${ICONS[t.icon]}</div>
        <h3>${esc(t.title)}</h3>
        <p>${esc(t.short)}</p>
        <div class="progress"><span style="width:${(n / t.tasks.length) * 100}%"></span></div>
        <div class="progress-label">${n}/${t.tasks.length} тапсырма орындалды</div>
      </a>`;
  }).join('');
}

// ---------- Тақырып беті ----------
function renderTopic() {
  const id = new URLSearchParams(location.search).get('t');
  const t = topicById(id) || DATA[0];
  if (!t) return;
  const i = DATA.indexOf(t);
  document.title = `${t.title} — Физика 9`;

  document.getElementById('side').innerHTML = `
    <a class="back" href="index.html">‹ ФИЗИКА 9</a>
    <ol>${DATA.map(x => `<li><a href="topic.html?t=${x.id}" class="${x === t ? 'active' : ''}">${esc(x.title)}</a></li>`).join('')}</ol>`;

  const prev = DATA[i - 1], next = DATA[i + 1];
  const theory = t.sections.filter(s => s.theory.trim());
  document.getElementById('content').innerHTML = `
    <div>
      <h1>${esc(t.title)}</h1>
      <p class="lead">${i + 1}-бөлім · ${esc(t.short)}</p>

      <div class="stage"><span class="b">1 кезең</span> Проблемалық жағдаят</div>
      <div class="box problem">
        <div class="pic" style="background:${t.color}22">${t.problem.image ? `<img src="${esc(t.problem.image)}" alt="">` : (ICONS[t.icon] || '')}</div>
        <div>
          <h3>${esc(t.problem.title)}</h3>
          <p>${esc(t.problem.text)}</p>
          <ul>${t.problem.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul>
        </div>
      </div>

      ${theory.length ? `
      <div class="stage"><span class="b">2 кезең</span> Теория</div>
      <div class="theory">${theory.map((s, k) => `
        <details class="box" id="sec-${k}" ${k === 0 ? 'open' : ''}>
          <summary>${esc(s.title)}</summary>
          <div class="md">${md(s.theory)}</div>
        </details>`).join('')}</div>` : ''}

      <div class="stage"><span class="b">${theory.length ? 3 : 2} кезең</span> Тапсырмалар</div>
      <div id="tasks">${t.tasks.map((x, k) => taskHTML(x, k + 1)).join('') || '<div class="empty">Тапсырмалар әлі қосылмаған.</div>'}</div>

      ${t.formulas.length ? `
      <div class="stage"><span class="b">${theory.length ? 4 : 3} кезең</span> Негізгі формулалар</div>
      <div class="formulas">${t.formulas.map(([f, d]) => `<div class="formula"><b>${esc(f)}</b><span>${esc(d)}</span></div>`).join('')}</div>` : ''}

      <div class="pager">
        ${prev ? `<a href="topic.html?t=${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a href="topic.html?t=${next.id}">${esc(next.title)} →</a>` : ''}
      </div>
    </div>

    <aside class="aside">
      <div class="ai-card">
        <h3>🤖 ЖИ-мен зерттеу</h3>
        <ul>${t.ai.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
        <div class="warn">ЖИ қателесуі мүмкін — әр жауапты формуламен немесе оқулықпен тексеріңіз.</div>
      </div>
      <div class="side-card">
        <h3>📚 Бөлім тақырыптары</h3>
        <ol>${t.sections.map(s => { const k = theory.indexOf(s); return `<li>${k >= 0 ? `<a href="#sec-${k}" onclick="document.getElementById('sec-${k}').open = true">${esc(s.title)}</a>` : esc(s.title)}</li>`; }).join('')}</ol>
      </div>
      <div class="side-card teacher-card teacher-only">
        <h3>👩‍🏫 Мұғалімге кеңес</h3>
        <p style="margin:0;font-size:14px">${esc(t.teacher)}</p>
      </div>
    </aside>`;
  bindTasks(document.getElementById('tasks'), t.tasks);
}

// ---------- Тапсырмалар жинағы ----------
function renderTasks() {
  const params = new URLSearchParams(location.search);
  let filter = params.get('t') || 'all';
  const q = (params.get('q') || '').trim().toLowerCase();
  const all = DATA.flatMap(t => t.tasks.map(x => ({ ...x, topic: t })));

  const chips = document.getElementById('chips');
  const list = document.getElementById('list');
  const draw = () => {
    chips.innerHTML = [['all', 'Барлығы'], ...DATA.map(t => [t.id, t.title])]
      .map(([id, label]) => `<button class="chip ${id === filter ? 'active' : ''}" data-id="${id}">${esc(label)}</button>`).join('');
    const items = all.filter(x =>
      (filter === 'all' || x.topic.id === filter) &&
      (!q || (x.title + ' ' + x.text + ' ' + x.topic.title).toLowerCase().includes(q)));
    list.innerHTML = items.length
      ? items.map((x, k) => taskHTML(x, k + 1, x.topic)).join('')
      : `<div class="empty">«${esc(q)}» бойынша ештеңе табылмады.</div>`;
    bindTasks(list, items);
  };
  chips.onclick = e => { const b = e.target.closest('.chip'); if (b) { filter = b.dataset.id; draw(); } };
  if (q) document.getElementById('qinfo').textContent = `Іздеу: «${params.get('q')}»`;
  draw();
}
