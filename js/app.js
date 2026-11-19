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

// ---------- Контекстік тапсырма карточкасы ----------
const scores = store.get('f9-scores', {});   // { taskId: ең жақсы балл }
const maxOf = task => task.parts.reduce((a, p) => a + (Number(p.points) || 0), 0);
const fmt = n => String(n).replace('.', ',');
const KIND_HINT = { choice: 'Дұрыс жауапты таңда', match: 'Сәйкестендір', tf: 'Дұрыс па, бұрыс па?', calc: 'Есептің шешуі мен жауабы', open: '💡 Логикалық дәлелдеу' };

function tableHTML(t) {
  return `<div class="tbl-wrap"><table class="part-table"><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
    ${t.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

function partInput(p, i, taskId) {
  const n = `${taskId}-${i}`;
  switch (p.kind) {
    case 'choice':
      return `<div class="opts">${p.options.map((o, k) =>
        `<label class="opt"><input type="radio" name="${n}" value="${k}"> <b>${LETTERS[k]})</b> ${esc(o)}</label>`).join('')}</div>`;
    case 'match':
      return `<div class="match">
        <ol class="match-left">${p.left.map((l, k) => `<li><span>${esc(l)}</span>
          <select data-k="${k}" aria-label="${k + 1}"><option value="">—</option>${p.right.map((_, r) => `<option value="${r}">${LETTERS[r]}</option>`).join('')}</select></li>`).join('')}</ol>
        <ul class="match-right">${p.right.map((r, k) => `<li><b>${LETTERS[k]})</b> ${esc(r)}</li>`).join('')}</ul>
      </div>`;
    case 'tf':
      return `<ol class="tf">${p.statements.map((s, k) => `<li><span>${esc(s)}</span>
        <span class="tf-btns" data-k="${k}"><button type="button" data-v="1">Дұрыс</button><button type="button" data-v="0">Бұрыс</button></span></li>`).join('')}</ol>`;
    case 'calc':
      return `<div class="calc">
        <label>Берілгені:<textarea data-f="given" rows="3"></textarea></label>
        <label>Формула және шешуі:<textarea data-f="work" rows="3"></textarea></label>
        <label class="calc-ans">Жауабы:<input data-f="answer" placeholder="Жауабын бірлігімен жаз"></label>
      </div>`;
    case 'open':
      return `<label class="open-ans">Қорытынды / Дәлел:<textarea rows="4"></textarea></label>`;
  }
  return '';
}

function taskHTML(task, idx, topic) {
  const max = maxOf(task);
  const best = scores[task.id];
  return `
    <div class="box task case" data-id="${task.id}">
      <div class="case-top">
        <span class="tag">${esc(task.tag || topic?.title || 'Физика')}</span>
        <span class="max">${best != null ? `<b class="${best === max ? 'ok' : ''}">Ең жақсы: ${fmt(best)}</b> · ` : ''}${max} балл</span>
      </div>
      <h3>${idx}-тапсырма. ${esc(task.title)}</h3>
      ${task.image ? `<img class="task-img" src="${esc(task.image)}" alt="" loading="lazy">` : ''}
      <p class="case-text"><b>Жағдаят.</b> ${esc(task.text)}</p>
      ${task.parts.map((p, i) => `
        <section class="part part-${p.kind}" data-i="${i}">
          <div class="part-head"><b>${esc(p.label)})</b> ${esc(p.text)} <span class="pts">(${p.points} балл)</span><span class="mark"></span></div>
          ${p.table ? tableHTML(p.table) : ''}
          <div class="part-kind">${KIND_HINT[p.kind] || ''}</div>
          ${partInput(p, i, task.id)}
          <div class="part-note"></div>
          <div class="answer-key teacher-only">Жауабы: ${esc(partKey(p))}</div>
        </section>`).join('')}
      <div class="case-btns">
        <button class="check">Жауапты тексеру</button>
        <button class="ghost help">Көмек алу</button>
        <button class="ghost clear">Тазалау</button>
      </div>
      <div class="hints"></div>
      <div class="result" hidden></div>
      <label class="reflect">Кері байланыс. Бүгін мен мынаны үйрендім:<input data-reflect placeholder="..."></label>
      <details class="solution-box"><summary>Эталон шешімі</summary><p>${esc(task.solution)}</p></details>
      ${task.rubric?.length ? `<details class="rubric teacher-only"><summary>Бағалау критерийлері</summary>
        <div class="tbl-wrap"><table class="part-table"><tr><th>№</th><th>Критерий</th><th>Дескриптор (балл беріледі, егер оқушы...)</th><th>Балл</th></tr>
        ${task.rubric.map((r, k) => `<tr><td>${k + 1}</td><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2]}</td></tr>`).join('')}
        <tr><td></td><td><b>Барлығы</b></td><td></td><td><b>${task.rubric.reduce((a, r) => a + Number(r[2]), 0)}</b></td></tr></table></div></details>` : ''}
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
    const result = el.querySelector('.result');
    const hintsBox = el.querySelector('.hints');
    const key = 'f9-ans-' + task.id;
    let hintsShown = 0;

    // Жауаптарды формадан оқу / формаға жазу
    const read = () => task.parts.map((p, i) => {
      const s = el.querySelector(`.part[data-i="${i}"]`);
      switch (p.kind) {
        case 'choice': { const c = s.querySelector('input:checked'); return c ? +c.value : null; }
        case 'match': return [...s.querySelectorAll('select')].map(x => x.value === '' ? null : +x.value);
        case 'tf': return [...s.querySelectorAll('.tf-btns')].map(b => { const on = b.querySelector('.on'); return on ? on.dataset.v === '1' : null; });
        case 'calc': return [...s.querySelectorAll('[data-f]')].map(x => x.value.trim()).filter(Boolean).join('\n');
        case 'open': return s.querySelector('textarea').value;
      }
    });
    const readFields = () => ({
      calc: [...el.querySelectorAll('.part-calc')].map(s => [...s.querySelectorAll('[data-f]')].map(x => x.value)),
      open: [...el.querySelectorAll('.part-open textarea')].map(x => x.value),
    });
    const save = () => store.set(key, { answers: read(), fields: readFields(), reflect: el.querySelector('[data-reflect]').value });
    const restore = saved => {
      task.parts.forEach((p, i) => {
        const s = el.querySelector(`.part[data-i="${i}"]`), v = saved.answers?.[i];
        if (p.kind === 'choice' && v != null) { const r = s.querySelector(`input[value="${v}"]`); if (r) r.checked = true; }
        if (p.kind === 'match' && Array.isArray(v)) s.querySelectorAll('select').forEach((x, k) => { x.value = v[k] ?? ''; });
        if (p.kind === 'tf' && Array.isArray(v)) s.querySelectorAll('.tf-btns').forEach((b, k) => b.querySelectorAll('button').forEach(btn => btn.classList.toggle('on', v[k] != null && (btn.dataset.v === '1') === v[k])));
      });
      el.querySelectorAll('.part-calc').forEach((s, k) => s.querySelectorAll('[data-f]').forEach((x, f) => { x.value = saved.fields?.calc?.[k]?.[f] || ''; }));
      el.querySelectorAll('.part-open textarea').forEach((x, k) => { x.value = saved.fields?.open?.[k] || ''; });
      el.querySelector('[data-reflect]').value = saved.reflect || '';
    };
    restore(store.get(key, {}));

    el.addEventListener('input', save);
    el.addEventListener('change', save);
    el.querySelectorAll('.tf-btns button').forEach(b => b.onclick = () => {
      b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      save();
    });

    const showMarks = grade => el.querySelectorAll('section.part').forEach((s, i) => {
      const r = grade.results[i];
      s.classList.toggle('q-ok', !r.pending && r.points === r.max);
      s.classList.toggle('q-part', !r.pending && r.points > 0 && r.points < r.max);
      s.classList.toggle('q-no', !r.pending && r.points === 0);
      s.querySelector('.mark').textContent = r.pending ? ' ⏳' : ` ${fmt(r.points)}/${r.max}`;
      // Сәйкестендіру / дұрыс-бұрыс: қай жолы қате екенін белгілейміз
      s.querySelectorAll('.match-left li, .tf li').forEach((li, k) => {
        li.classList.toggle('item-ok', r.items?.[k] === true);
        li.classList.toggle('item-no', r.items?.[k] === false);
      });
      s.querySelector('.part-note').textContent = r.comment ? '🤖 ' + r.comment : '';
    });

    const finish = grade => {
      if (scores[task.id] == null || grade.score > scores[task.id]) {
        scores[task.id] = grade.score; store.set('f9-scores', scores);
        el.querySelector('.case-top .max').innerHTML = `<b class="${grade.score === grade.max ? 'ok' : ''}">Ең жақсы: ${fmt(grade.score)}</b> · ${grade.max} балл`;
      }
      if (grade.score === grade.max) markDone(task.id);
    };

    el.querySelector('.check').onclick = async () => {
      const answers = read();
      const local = gradeTask(task, answers);   // бірден, интернетсіз де
      result.hidden = false;
      if (local.results.every(r => r.empty)) { result.className = 'result no'; result.textContent = 'Алдымен жауап жаз.'; return; }
      showMarks(local);
      const btn = el.querySelector('.check');
      btn.disabled = true;
      result.className = 'result partial';
      result.innerHTML = `<div class="score">Баға: ${fmt(local.score)} / ${local.max}${local.pending ? ' + логикалық бөлім тексерілуде' : ''}</div><p class="ai muted">🤖 ЖИ жауабыңды талдап жатыр...</p>`;
      el.querySelector('.solution-box').classList.add('can-open');
      let grade = local, feedback = '';
      try {
        const r = await callApi('/api/check', { taskId: task.id, answers });
        grade = r; feedback = r.feedback;
      } catch {}
      btn.disabled = false;
      showMarks(grade);
      finish(grade);
      result.className = 'result ' + (grade.score === grade.max ? 'ok' : grade.score ? 'partial' : 'no');
      result.innerHTML = `<div class="score">Баға: ${fmt(grade.score)} / ${grade.max}</div>` +
        (grade.pending ? '<p class="muted">Логикалық дәлелдеу бөлімін қазір тексеру мүмкін болмады — оны мұғалім бағалайды.</p>' : '') +
        (feedback ? `<p class="ai">🤖 ${esc(feedback)}</p>` : '');
    };

    el.querySelector('.help').onclick = async () => {
      const add = (text, ai) => hintsBox.insertAdjacentHTML('beforeend', `<div class="tip${ai ? ' ai' : ''}">💡 ${esc(text)}</div>`);
      if (hintsShown < (task.hints || []).length) { add(task.hints[hintsShown++]); return; }
      const btn = el.querySelector('.help');
      btn.disabled = true; btn.textContent = 'Ойланып жатыр...';
      try { add((await callApi('/api/hint', { taskId: task.id, answers: read() })).hint, true); }
      catch { add('Қазір қосымша көмек қолжетімсіз. Мұғалімнен сұра немесе эталон шешімін тексеріп көр.'); }
      finally { btn.disabled = false; btn.textContent = 'Көмек алу'; }
    };

    el.querySelector('.clear').onclick = () => {
      el.querySelectorAll('input[type=radio]').forEach(x => { x.checked = false; });
      el.querySelectorAll('select').forEach(x => { x.value = ''; });
      el.querySelectorAll('.tf-btns button').forEach(x => x.classList.remove('on'));
      el.querySelectorAll('.part textarea, .part input:not([type=radio])').forEach(x => { x.value = ''; });
      el.querySelectorAll('section.part').forEach(s => { s.classList.remove('q-ok', 'q-no', 'q-part'); s.querySelector('.mark').textContent = ''; s.querySelector('.part-note').textContent = ''; });
      el.querySelectorAll('.item-ok, .item-no').forEach(li => li.classList.remove('item-ok', 'item-no'));
      result.hidden = true; hintsBox.innerHTML = ''; hintsShown = 0;
      save();
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
      ${t.goal ? `<p class="goal"><b>Сабақ мақсаты:</b> ${esc(t.goal)}</p>` : ''}

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
