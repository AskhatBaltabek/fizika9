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

// ---------- Тапсырма карточкасы ----------
function taskHTML(task, idx, topic) {
  const head = `
    ${topic ? `<div class="task-topic">${esc(topic.title)}</div>` : ''}
    <h3>${done.has(task.id) ? '<span class="done-mark">✓ Орындалды</span>' : ''}
      ${idx}. <span class="k">${esc(task.title)}:</span> ${esc(task.text)}</h3>`;
  const body = task.type === 'choice'
    ? `<div class="opts">${task.options.map((o, i) =>
        `<label class="opt"><input type="radio" name="${task.id}" value="${i}"> ${esc(o)}</label>`).join('')}</div>`
    : `<div class="num-row"><input type="text" inputmode="decimal" placeholder="Жауабыңыз"> <span>${esc(task.unit)}</span></div>`;
  const key = task.type === 'choice' ? task.options[task.answer] : `${String(task.answer).replace('.', ',')} ${task.unit}`;
  return `
    <div class="box task" data-id="${task.id}">
      ${head}${task.image ? `<img class="task-img" src="${esc(task.image)}" alt="" loading="lazy">` : ''}${body}
      <button class="check">Тексеру</button>
      <div class="feedback"></div>
      <div class="answer-key teacher-only">Дұрыс жауап: ${esc(key)}</div>
      <div class="solution"><b>Шешуі:</b> ${esc(task.solution)}</div>
    </div>`;
}

function bindTasks(root, tasks) {
  root.querySelectorAll('.task').forEach(el => {
    const task = tasks.find(t => t.id === el.dataset.id);
    el.querySelector('.check').onclick = () => {
      const fb = el.querySelector('.feedback');
      let ok;
      if (task.type === 'choice') {
        const sel = el.querySelector('input:checked');
        if (!sel) { fb.className = 'feedback no'; fb.textContent = 'Алдымен жауапты таңдаңыз.'; return; }
        el.querySelectorAll('.opt').forEach(o => o.classList.remove('right', 'wrong'));
        ok = +sel.value === task.answer;
        sel.closest('.opt').classList.add(ok ? 'right' : 'wrong');
      } else {
        // «2,5», «2.5», «2,5 м» — бәрі қабылданады
        const num = parseFloat(el.querySelector('.num-row input').value.replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(num)) { fb.className = 'feedback no'; fb.textContent = 'Санды енгізіңіз (мысалы: 2,5).'; return; }
        ok = Math.abs(num - task.answer) <= task.tol + 1e-9; // шекаралық мән (2,6 ± 0,1) дұрыс саналуы үшін
      }
      fb.className = 'feedback ' + (ok ? 'ok' : 'no');
      fb.textContent = ok ? 'Дұрыс! Жарайсың 👏' : 'Қате. Тағы бір рет ойланып көр немесе шешуін қара.';
      el.querySelector('.solution').classList.add('show');
      if (ok) markDone(task.id);
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
