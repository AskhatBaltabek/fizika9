// Мұғалім кабинеті: кіру, тақырыптарды/тапсырмаларды өңдеу, суреттер, мұғалімдер тізімі.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lines = s => s.split('\n').map(x => x.trim()).filter(Boolean);
const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let topics = [];     // loadTopics() пішініндегі тақырыптар
let current = null;  // өңделіп жатқан тақырып
let dirty = false;
let userEmail = '';

function toast(text, err = false) {
  const el = $('#toast');
  el.textContent = text;
  el.className = 'toast' + (err ? ' err' : '');
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.hidden = true, Math.max(3500, text.length * 70));
}

function show(view) {
  ['login', 'invite', 'topics', 'teachers'].forEach(v => $('#v-' + v).hidden = v !== view);
  const inApp = view === 'topics' || view === 'teachers';
  $('.admin .nav').style.visibility = inApp ? 'visible' : 'hidden';
  $$('.nav a[data-tab]').forEach(a => a.classList.toggle('active', a.dataset.tab === view));
}

function setDirty(v) {
  dirty = v;
  const st = $('.savebar .state');
  if (st) { st.textContent = v ? 'Сақталмаған өзгерістер бар' : 'Барлығы сақталған'; st.classList.toggle('dirty', v); }
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Кіру ----------
function signedIn(email) {
  userEmail = email;
  $('#who').textContent = email;
  $('#logout').hidden = false;
}

function signedOut() {
  userEmail = '';
  $('#who').textContent = '';
  $('#logout').hidden = true;
  show('login');
}

async function formSubmit(form, msgEl, path, body) {
  msgEl.className = 'msg'; msgEl.textContent = 'Күте тұрыңыз...';
  const btn = $('button[type=submit]', form);
  btn.disabled = true;
  try {
    const r = await api(path, body);
    msgEl.textContent = '';
    form.reset();
    signedIn(r.email);
    await reload();
    show('topics');
  } catch (e) {
    msgEl.className = 'msg err'; msgEl.textContent = e.message;
  } finally { btn.disabled = false; }
}

$('#login-form').onsubmit = e => {
  e.preventDefault();
  const f = e.target;
  formSubmit(f, $('#login-msg'), '/api/auth/login', { email: f.email.value, password: f.password.value });
};

$('#invite-form').onsubmit = e => {
  e.preventDefault();
  const f = e.target, msg = $('#invite-msg');
  if (f.password.value !== f.password2.value) { msg.className = 'msg err'; msg.textContent = 'Құпиясөздер сәйкес келмейді.'; return; }
  formSubmit(f, msg, '/api/auth/accept-invite', { email: f.email.value, code: f.code.value, password: f.password.value });
};

$('#to-invite').onclick = e => { e.preventDefault(); $('#invite-form').email.value = $('#login-form').email.value; show('invite'); };
$('#to-login').onclick = e => { e.preventDefault(); show('login'); };

$('#logout').onclick = async () => {
  if (dirty && !confirm('Сақталмаған өзгерістер жоғалады. Шығасыз ба?')) return;
  setDirty(false);
  try { await api('/api/auth/logout', {}); } catch {}
  signedOut();
};

// Сессия мерзімі өтсе немесе мұғалім тізімнен өшірілсе — кіру бетіне
function handleAuthError(e) {
  if (e.status === 401) { toast('Сессия аяқталды, қайта кіріңіз.', true); signedOut(); return true; }
  return false;
}

(async function start() {
  try {
    const me = await api('/api/auth/me');
    signedIn(me.email);
    await reload();
    show('topics');
  } catch (e) {
    if (e.status === 401) return signedOut();
    document.body.insertAdjacentHTML('beforeend', '<div class="auth"><div class="box auth-box"><h1>Сервер қолжетімсіз</h1><p>Интернетті тексеріп, бетті жаңартыңыз.</p></div></div>');
  }
})();

$$('.nav a[data-tab]').forEach(a => a.onclick = e => {
  e.preventDefault();
  if (a.dataset.tab === 'teachers') { loadTeachers(); show('teachers'); } else show('topics');
});

// ---------- Тақырыптар тізімі ----------
async function reload(keepId) {
  try { topics = await loadTopics({ fallback: false }); } catch (e) { return toast('Сервер қолжетімсіз — мазмұнды жүктеу мүмкін болмады: ' + e.message, true); }
  current = topics.find(t => t.id === (keepId || current?.id)) || topics[0] || null;
  renderList();
  renderEditor();
}

function renderList() {
  $('#topic-list').innerHTML = topics.map((t, i) => `
    <li class="${t === current ? 'active' : ''}">
      <button class="pick" data-i="${i}">${i + 1}. ${esc(t.title)}</button>
      <button class="ico" data-up="${i}" title="Жоғары">↑</button>
      <button class="ico" data-down="${i}" title="Төмен">↓</button>
    </li>`).join('');
}

$('#topic-list').onclick = async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.i) {
    if (dirty && !confirm('Сақталмаған өзгерістер жоғалады. Жалғастырасыз ба?')) return;
    current = topics[+b.dataset.i];
    setDirty(false);
    renderList(); renderEditor();
    return;
  }
  const i = +(b.dataset.up ?? b.dataset.down), j = b.dataset.up ? i - 1 : i + 1;
  if (j < 0 || j >= topics.length) return;
  [topics[i], topics[j]] = [topics[j], topics[i]];
  renderList();
  try { await api('/api/admin/topics/order', { ids: topics.map(t => t.id) }); toast('Реті сақталды'); }
  catch (e) { if (!handleAuthError(e)) toast('Қате: ' + e.message, true); }
};

$('#add-topic').onclick = async () => {
  if (dirty && !confirm('Сақталмаған өзгерістер жоғалады. Жалғастырасыз ба?')) return;
  let id;
  try { ({ id } = await api('/api/admin/topics/create', {})); }
  catch (e) { if (!handleAuthError(e)) toast('Қате: ' + e.message, true); return; }
  setDirty(false);
  await reload(id);
  $('#editor [name=title]')?.select();
};

// ---------- Редактор ----------
function imgField(name, url) {
  return `<div class="img-field" data-img="${name}">
    ${url ? `<img src="${esc(url)}" alt="">` : '<span class="hint">Сурет жоқ</span>'}
    <label class="file-btn">📷 ${url ? 'Ауыстыру' : 'Сурет жүктеу'}<input type="file" accept="image/*"></label>
    ${url ? '<button type="button" class="ico del" data-act="img-remove">✕ Өшіру</button>' : ''}
    <input type="hidden" name="${name}" value="${esc(url || '')}">
  </div>`;
}

function itemHead(label, i, kind) {
  return `<div class="item-head"><span class="n">${label} ${i + 1}</span><span class="sp"></span>
    <button type="button" class="ico" data-act="up" data-kind="${kind}" data-i="${i}">↑</button>
    <button type="button" class="ico" data-act="down" data-kind="${kind}" data-i="${i}">↓</button>
    <button type="button" class="ico del" data-act="del" data-kind="${kind}" data-i="${i}">✕</button></div>`;
}

const fmtNum = n => Number.isFinite(n) ? String(n).replace('.', ',') : '';
const KINDS = { choice: 'Нұсқаны таңдау', match: 'Сәйкестендіру', tf: 'Дұрыс / бұрыс', calc: 'Есеп (сан жауап)', open: 'Логикалық дәлелдеу (ЖИ бағалайды)' };
const PART_LABELS_ED = ['а', 'ә', 'б', 'в', 'г', 'ғ'];
const letters = idx => Array.isArray(idx) ? idx.map(k => LETTERS[k] ?? '?').join(', ') : '';

function answerRow(a, i, k, m) {
  const isWord = !!a.accept;
  return `<div class="ans-row" data-ans="${m}">
    <select name="atype"><option value="num" ${!isWord ? 'selected' : ''}>Сан</option><option value="word" ${isWord ? 'selected' : ''}>Сөз</option></select>
    ${isWord
      ? `<input name="accept" class="wide" value="${esc((a.accept || []).join(', '))}" placeholder="азаяды, кемиді (үтір арқылы)">`
      : `<input name="value" inputmode="decimal" value="${esc(fmtNum(a.value))}" placeholder="жауап">
         <input name="unit" value="${esc(a.unit || '')}" placeholder="бірлік">
         <input name="tol" inputmode="decimal" value="${esc(fmtNum(a.tol ?? 0))}" placeholder="± ауытқу" title="Рұқсат етілген ауытқу">
         <label class="chk" title="Шартта осындай сан болса: оқушы санды бірлігімен жазуы керек"><input type="checkbox" name="needUnit" ${a.needUnit ? 'checked' : ''}> бірлігімен</label>`}
    <input name="apoints" inputmode="numeric" value="${esc(String(a.points ?? 1))}" title="Балл" class="pts-in">
    <button type="button" class="ico del" data-act="ans-del" data-i="${i}" data-k="${k}" data-m="${m}">✕</button>
  </div>`;
}

function partEditor(p, i, k) {
  const body = {
    choice: `<label>Нұсқалар <span class="hint">(әрқайсысы жаңа жолдан, әріпсіз)</span><textarea name="options">${esc((p.options || []).join('\n'))}</textarea></label>
      <label class="short">Дұрыс жауап<select name="answer">${LETTERS.slice(0, 6).map((l, n) => `<option value="${n}" ${n === p.answer ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`,
    match: `<div class="g2">
        <label>Сол жақ (1, 2, 3…) <span class="hint">(жаңа жолдан)</span><textarea name="left">${esc((p.left || []).join('\n'))}</textarea></label>
        <label>Оң жақ (А, Ә, Б…) <span class="hint">(жаңа жолдан)</span><textarea name="right">${esc((p.right || []).join('\n'))}</textarea></label></div>
      <label class="short">Дұрыс сәйкестік <span class="hint">(сол жақтың ретімен әріптер, мысалы: Б, А, Ә)</span><input name="answer" value="${esc(letters(p.answer))}"></label>`,
    tf: `<label>Тұжырымдар <span class="hint">(әрқайсысы жаңа жолдан)</span><textarea name="statements">${esc((p.statements || []).join('\n'))}</textarea></label>
      <label class="short">Жауаптар <span class="hint">(Д — дұрыс, Б — бұрыс; мысалы: Д, Б, Б)</span><input name="answer" value="${esc((Array.isArray(p.answer) ? p.answer : []).map(v => v ? 'Д' : 'Б').join(', '))}"></label>`,
    calc: `<div class="hint">Сайт осы сандарды оқушының «Берілгені / Шешуі / Жауабы» мәтінінен іздейді. Бөлім балы — жолдардың балдарының қосындысы.</div>
      ${(p.answers || []).map((a, m) => answerRow(a, i, k, m)).join('')}
      <button type="button" class="add" data-act="ans-add" data-i="${i}" data-k="${k}">+ Жауап</button>`,
    open: `<label>Критерийлер <span class="hint">(ЖИ осы бойынша балл қояды; әрқайсысы жаңа жолдан, балын жақшада көрсетіңіз)</span>
      <textarea name="criteria" class="tall-s">${esc((p.criteria || []).join('\n'))}</textarea></label>`,
  }[p.kind] || '';
  return `<div class="q-item" data-part="${k}">
    <div class="item-head"><span class="n">${esc(p.label || PART_LABELS_ED[k])}) бөлім</span>
      <select name="kind">${Object.entries(KINDS).map(([v, l]) => `<option value="${v}" ${v === p.kind ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${p.kind === 'calc' ? `<span class="hint">балл: ${(p.answers || []).reduce((a, x) => a + (Number(x.points) || 0), 0)}</span>` : `<label class="pts-label">Балл<input name="points" inputmode="numeric" value="${esc(String(p.points ?? 1))}" class="pts-in"></label>`}
      <span class="sp"></span>
      <button type="button" class="ico" data-act="part-up" data-i="${i}" data-k="${k}">↑</button>
      <button type="button" class="ico del" data-act="part-del" data-i="${i}" data-k="${k}">✕</button></div>
    <label>Тапсырма мәтіні<textarea name="ptext">${esc(p.text || '')}</textarea></label>
    ${p.table ? '<div class="hint">Бұл бөлімде кесте бар (сақталады).</div>' : ''}
    ${body}
  </div>`;
}

function taskEditor(x, i) {
  const max = x.parts.reduce((a, p) => a + (Number(p.points) || 0), 0);
  return `<div class="item" data-task="${i}">
    ${itemHead('Тапсырма', i, 'tasks')}
    <div class="g2">
      <label>Атауы<input name="title" value="${esc(x.title)}" placeholder="Мысалы: Карьерлік самосвалдың қозғалысы"></label>
      <label>Белгі <span class="hint">(мысалы: Кинематика)</span><input name="tag" value="${esc(x.tag || '')}"></label>
    </div>
    <label>Жағдаят<textarea name="text">${esc(x.text)}</textarea></label>
    ${imgField('image', x.image)}
    <div class="hint">Бөліктер — барлығы ${max} балл.</div>
    ${x.parts.map((p, k) => partEditor(p, i, k)).join('')}
    <div class="part-add"><select name="newkind">${Object.entries(KINDS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <button type="button" class="add" data-act="part-add" data-i="${i}">+ Бөлік қосу</button></div>
    <label>Бағалау критерийлері <span class="hint">(мұғалімге көрінеді; әр жол: Критерий | Дескриптор | Балл)</span>
      <textarea name="rubric" class="tall-s">${esc((x.rubric || []).map(r => r.join(' | ')).join('\n'))}</textarea></label>
    <label>Эталон шешімі <span class="hint">(оқушы тексергеннен кейін көреді; ЖИ осыған сүйенеді)</span><textarea name="solution">${esc(x.solution)}</textarea></label>
    <label>«Көмек алу» кеңестері <span class="hint">(әрқайсысы жаңа жолдан; біткен соң ЖИ көмектеседі)</span><textarea name="hints">${esc((x.hints || []).join('\n'))}</textarea></label>
  </div>`;
}

function renderEditor() {
  const ed = $('#editor');
  if (!current) { ed.innerHTML = '<div class="empty">Тақырып жоқ. «+ Жаңа» батырмасын басыңыз.</div>'; return; }
  const t = current;
  ed.innerHTML = `
    <div class="box">
      <h2>Негізгі</h2>
      <label>Атауы<input name="title" value="${esc(t.title)}"></label>
      <label>Қысқаша сипаттама<input name="short" value="${esc(t.short)}"></label>
      <label>Сабақ мақсаты<textarea name="goal">${esc(t.goal || '')}</textarea></label>
      <div class="g2">
        <div><div class="hint" style="margin-bottom:6px">Белгіше</div>
          <div class="icons">${Object.keys(ICONS).map(k => `<button type="button" data-icon="${k}" class="${k === t.icon ? 'on' : ''}">${ICONS[k]}</button>`).join('')}</div>
          <input type="hidden" name="icon" value="${esc(t.icon)}"></div>
        <label>Түсі<input type="color" name="color" value="${esc(t.color)}"></label>
      </div>
    </div>

    <div class="box">
      <h2>Бөлім тақырыптары және теория</h2>
      <div class="hint">Теорияны жазу: **қалың**, *көлбеу*, «- » тізім, «## » тақырыпша. Теориясы бар бөлімдер сайтта «Теория» кезеңінде шығады.</div>
      ${t.sections.map((s, i) => `<div class="item" data-section="${i}">
        ${itemHead('Бөлім', i, 'sections')}
        <label>Атауы<input name="title" value="${esc(s.title)}"></label>
        <label>Теория<textarea name="theory" class="tall">${esc(s.theory)}</textarea></label>
        <label class="file-btn" style="justify-self:start">📷 Теорияға сурет қосу<input type="file" accept="image/*" data-act="theory-img"></label>
      </div>`).join('')}
      <button type="button" class="add" data-act="add-section">+ Бөлім қосу</button>
    </div>

    <div class="box">
      <h2>Тапсырмалар</h2>
      ${t.tasks.map(taskEditor).join('')}
      <button type="button" class="add" data-act="add-task">+ Тапсырма қосу</button>
    </div>

    <div class="box">
      <h2>ЖИ-мен зерттеу</h2>
      <label>Тапсырмалар <span class="hint">(әрқайсысы жаңа жолдан)</span><textarea name="ai">${esc(t.ai.join('\n'))}</textarea></label>
    </div>

    <div class="box">
      <h2>Мұғалімге кеңес</h2>
      <label><span class="hint">Тек «Мұғалім» режимінде көрінеді</span><textarea name="teacher">${esc(t.teacher)}</textarea></label>
    </div>

    <div class="savebar">
      <span class="state"></span>
      <a class="btn btn-ghost" href="topic.html?t=${encodeURIComponent(t.id)}" target="_blank">Сайтта көру ↗</a>
      <button type="button" class="btn btn-danger" data-act="delete-topic">Тақырыпты жою</button>
      <button type="button" class="btn btn-primary" data-act="save">Сақтау</button>
    </div>`;
  setDirty(dirty);
}

// Формадағы мәндерді current ішіне жинау
function collect() {
  const ed = $('#editor'), t = current;
  const top = name => $(`.box > label > [name="${name}"], .box > [name="${name}"], .box [name="${name}"]:not(.item [name])`, ed);
  const val = name => top(name)?.value ?? '';
  t.title = val('title').trim() || 'Атаусыз тақырып';
  t.short = val('short');
  t.icon = val('icon');
  t.color = val('color');
  // «Проблемалық жағдаят» мен формулалар сайтта көрсетілмейді — редакторда жоқ болса, бұрынғы мәндері сақталады
  if (top('problem_title')) t.problem = { title: val('problem_title'), text: val('problem_text'), questions: lines(val('problem_questions')), image: val('problem_image') || null };
  t.ai = lines(val('ai'));
  t.teacher = val('teacher');
  if ($('[data-act=add-formula]', ed)) t.formulas = $$('[data-formula]', ed).map(r => [$('[name=f]', r).value.trim(), $('[name=d]', r).value.trim()]).filter(([f, d]) => f || d);
  t.sections = $$('[data-section]', ed).map((r, i) => ({ ...t.sections[i], title: $('[name=title]', r).value.trim(), theory: $('[name=theory]', r).value }));
  t.goal = val('goal');
  const num = v => parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  const lettersToIdx = v => String(v).split(/[\s,;]+/).filter(Boolean).map(ch => LETTERS.indexOf(ch.toUpperCase()));
  t.tasks = $$('[data-task]', ed).map((r, i) => ({
    ...t.tasks[i],
    title: $('[name=title]', r).value.trim(),
    tag: $('[name=tag]', r).value.trim(),
    text: $('[name=text]', r).value.trim(),
    image: $('[name=image]', r).value || null,
    solution: $('[name=solution]', r).value.trim(),
    hints: lines($('[name=hints]', r).value),
    rubric: lines($('[name=rubric]', r).value).map(l => { const c = l.split('|').map(x => x.trim()); return [c[0] || '', c[1] || '', num(c[2]) || 0]; }),
    parts: $$('[data-part]', r).map((pr, k) => {
      const old = t.tasks[i].parts[k] || {};
      const kind = $('[name=kind]', pr).value;
      const p = { label: PART_LABELS_ED[k], kind, text: $('[name=ptext]', pr).value.trim(), points: num($('[name=points]', pr)?.value) };
      if (old.table && old.kind === kind) p.table = old.table;
      const f = name => $(`[name=${name}]`, pr);
      if (kind !== old.kind) {
        // Түрі ауысты: жаңа түрдің бос үлгісі
        Object.assign(p, { choice: { options: ['', ''], answer: 0 }, match: { left: [''], right: [''], answer: [] }, tf: { statements: [''], answer: [] },
          calc: { answers: [{ value: NaN, unit: '', tol: 0, points: 1 }] }, open: { criteria: [] } }[kind]);
      } else if (kind === 'choice') Object.assign(p, { options: lines(f('options').value), answer: +f('answer').value });
      else if (kind === 'match') Object.assign(p, { left: lines(f('left').value), right: lines(f('right').value), answer: lettersToIdx(f('answer').value) });
      else if (kind === 'tf') Object.assign(p, { statements: lines(f('statements').value), answer: String(f('answer').value).split(/[\s,;]+/).filter(Boolean).map(x => x.toUpperCase() === 'Д') });
      else if (kind === 'open') p.criteria = lines(f('criteria').value);
      else if (kind === 'calc') {
        p.answers = $$('[data-ans]', pr).map((ar, m) => {
          const type = $('[name=atype]', ar).value, pts = num($('[name=apoints]', ar).value) || 0;
          const wasWord = !!(old.answers?.[m]?.accept);
          if (type === 'word') return { accept: wasWord ? $('[name=accept]', ar).value.split(',').map(x => x.trim()).filter(Boolean) : [], points: pts };
          if (wasWord) return { value: NaN, unit: '', tol: 0, points: pts };
          const a = { value: num($('[name=value]', ar).value), unit: $('[name=unit]', ar).value.trim(), tol: num($('[name=tol]', ar).value) || 0, points: pts };
          const alt = old.answers?.[m]?.alt; if (alt) a.alt = alt;
          if ($('[name=needUnit]', ar).checked) a.needUnit = true;
          return a;
        });
        p.points = p.answers.reduce((a, x) => a + x.points, 0);
      }
      return p;
    }),
  }));
}

function rerender() { collect(); renderEditor(); setDirty(true); }

$('#editor').addEventListener('input', () => setDirty(true));

$('#editor').addEventListener('change', async e => {
  const el = e.target;
  if (el.name === 'kind' || el.name === 'atype') { rerender(); return; }
  if (el.type !== 'file' || !el.files[0]) return;
  const url = await uploadImage(el.files[0]);
  el.value = '';
  if (!url) return;
  if (el.dataset.act === 'theory-img') {
    const ta = $('[name=theory]', el.closest('.item'));
    const pos = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, pos) + `\n![сурет](${url})\n` + ta.value.slice(pos);
  } else {
    $('input[type=hidden]', el.closest('[data-img]')).value = url;
    rerender();
  }
  setDirty(true);
});

$('#editor').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.icon) {
    $('[name=icon]').value = b.dataset.icon;
    $$('.icons button').forEach(x => x.classList.toggle('on', x === b));
    return setDirty(true);
  }
  const act = b.dataset.act;
  if (!act) return;
  if (act === 'save') return save();
  if (act === 'delete-topic') return deleteTopic();
  collect();
  const t = current, i = +b.dataset.i;
  const list = b.dataset.kind && t[b.dataset.kind];
  switch (act) {
    case 'up': if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
    case 'down': if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
    case 'del':
      if (b.dataset.kind !== 'formulas' && !confirm('Жоюды растайсыз ба?')) return;
      list.splice(i, 1); break;
    case 'add-section': t.sections.push({ title: '', theory: '' }); break;
    case 'add-formula': t.formulas.push(['', '']); break;
    case 'add-task':
      t.tasks.push({ title: '', tag: '', text: '', image: null, solution: '', hints: [], rubric: [],
        parts: [{ label: 'а', kind: 'choice', text: '', points: 1, options: ['', '', '', ''], answer: 0 },
          { label: 'ә', kind: 'calc', text: '', points: 2, answers: [{ value: NaN, unit: '', tol: 0, points: 1 }, { value: NaN, unit: '', tol: 0, points: 1 }] },
          { label: 'б', kind: 'open', text: '', points: 3, criteria: [] }] });
      break;
    case 'part-add': {
      const kind = $('[name=newkind]', b.closest('.part-add')).value;
      t.tasks[i].parts.push({ kind, text: '', points: kind === 'open' ? 3 : 1, ...{ choice: { options: ['', ''], answer: 0 }, match: { left: [''], right: [''], answer: [] },
        tf: { statements: [''], answer: [] }, calc: { answers: [{ value: NaN, unit: '', tol: 0, points: 1 }] }, open: { criteria: [] } }[kind] });
      break;
    }
    case 'part-del':
      if (!confirm('Бөлікті жоясыз ба?')) return;
      t.tasks[i].parts.splice(+b.dataset.k, 1); break;
    case 'part-up': {
      const ps = t.tasks[i].parts, k = +b.dataset.k;
      if (k > 0) [ps[k - 1], ps[k]] = [ps[k], ps[k - 1]];
      break;
    }
    case 'ans-add': t.tasks[i].parts[+b.dataset.k].answers.push({ value: NaN, unit: '', tol: 0, points: 1 }); break;
    case 'ans-del': t.tasks[i].parts[+b.dataset.k].answers.splice(+b.dataset.m, 1); break;
    case 'img-remove': $('input[type=hidden]', b.closest('[data-img]')).value = ''; collect(); break;
  }
  renderEditor();
  setDirty(true);
});

// ---------- Сақтау ----------
function validate(t) {
  for (const [i, x] of t.tasks.entries()) {
    const n = `${i + 1}-тапсырма`;
    if (!x.title) return `${n}: атауын жазыңыз.`;
    if (!x.text) return `${n}: жағдаятты жазыңыз.`;
    if (!x.parts.length) return `${n}: кемінде бір бөлік қосыңыз.`;
    for (const [k, p] of x.parts.entries()) {
      const m = `${n}, ${p.label}) бөлім`;
      if (!p.text) return `${m}: тапсырма мәтінін жазыңыз.`;
      if (!(p.points > 0)) return `${m}: балл 0-ден көп болуы керек.`;
      if (p.kind === 'choice' && (p.options.length < 2 || p.answer >= p.options.length)) return `${m}: кемінде 2 нұсқа және бар нұсқаның әрпі керек.`;
      if (p.kind === 'match') {
        if (p.left.length < 2 || p.right.length < 2) return `${m}: екі жақта да кемінде 2 жол керек.`;
        if (p.answer.length !== p.left.length || p.answer.some(a => a < 0 || a >= p.right.length)) return `${m}: сәйкестікті сол жақтың әр жолына бір әріптен жазыңыз (мысалы: Б, А, Ә).`;
      }
      if (p.kind === 'tf' && (!p.statements.length || p.answer.length !== p.statements.length)) return `${m}: әр тұжырымға Д немесе Б жазыңыз (мысалы: Д, Б, Б).`;
      if (p.kind === 'calc') {
        if (!p.answers.length) return `${m}: кемінде бір жауап қосыңыз.`;
        if (p.answers.some(a => a.accept ? !a.accept.length : !Number.isFinite(a.value))) return `${m}: әр жауапқа сан (мысалы 2,5) немесе сөз жазыңыз.`;
      }
      if (p.kind === 'open' && !p.criteria.length) return `${m}: ЖИ бағалауы үшін кемінде бір критерий жазыңыз.`;
    }
  }
  if (t.sections.some(s => !s.title)) return 'Бөлімдердің атауларын толтырыңыз.';
  return null;
}

// Жауап шартта бұрыннан жазылған санмен сәйкес келсе, оқушы шартты көшіріп-ақ балл алады
function leaks(t) {
  const out = [];
  t.tasks.forEach((x, i) => {
    x.parts.forEach(p => {
      if (p.kind !== 'calc') return;
      const given = extractNumbers(x.text + ' ' + p.text);
      p.answers.forEach(a => {
        if (!a.accept && !a.needUnit && given.some(g => Math.abs(g - a.value) <= a.tol + 1e-9)) out.push(`${i + 1}-тапсырма, ${p.label}) бөлім (${fmtNum(a.value)})`);
      });
    });
  });
  return out;
}

async function save() {
  collect();
  const t = current;
  const problem = validate(t);
  if (problem) return toast(problem, true);
  const btn = $('[data-act=save]');
  btn.disabled = true; btn.textContent = 'Сақталуда...';
  try {
    t.sections.forEach(s => s.id ||= crypto.randomUUID());
    t.tasks.forEach(x => x.id ||= newId());
    await api('/api/admin/topics/save', { topic: t });

    setDirty(false);
    renderList();
    const warn = leaks(t);
    // Бөліктердің балы мен «Бағалау критерийлері» кестесінің қосындысы сәйкес келуі керек
    const mismatch = t.tasks.map((x, i) => {
      const parts = x.parts.reduce((a, p) => a + (Number(p.points) || 0), 0);
      const rub = (x.rubric || []).reduce((a, r) => a + (Number(r[2]) || 0), 0);
      return x.rubric?.length && parts !== rub ? `${i + 1}-тапсырма: бөліктер ${parts} балл, критерийлер ${rub} балл` : null;
    }).filter(Boolean);
    const notes = [];
    if (warn.length) notes.push(`${warn.join('; ')} — жауап шарттағы санмен бірдей, оқушы оны көшіріп балл алуы мүмкін («бірлігімен» белгісін қойыңыз)`);
    if (mismatch.length) notes.push(`${mismatch.join('; ')} — балдар сәйкес емес`);
    if (notes.length) toast(`Сақталды. Назар аударыңыз: ${notes.join('. ')}.`, true);
    else toast('Сақталды ✓');
  } catch (e) {
    if (!handleAuthError(e)) toast('Сақтау қатесі: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Сақтау';
  }
}

async function deleteTopic() {
  if (!confirm(`«${current.title}» тақырыбын барлық тапсырмаларымен бірге жоясыз ба? Бұл әрекетті қайтару мүмкін емес.`)) return;
  // Сервер тақырыптың бөлімдерін, есептерін және суреттерін бірге өшіреді
  try { await api('/api/admin/topics/delete', { id: current.id }); }
  catch (e) { if (!handleAuthError(e)) toast('Қате: ' + e.message, true); return; }
  setDirty(false);
  current = null;
  toast('Тақырып жойылды');
  reload();
}

// ---------- Суреттер ----------
// Үлкен фотоларды 1600px-ке дейін кішірейтіп, JPEG-ке айналдырамыз (оқушылардың мобильді трафигі үшін)
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  if (k === 1 && file.size < 500_000) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', 0.85));
}

async function uploadImage(file) {
  if (file.size > 20_000_000) { toast('Файл тым үлкен (20 МБ-тан аспауы керек)', true); return null; }
  toast('Сурет жүктелуде...');
  const blob = await shrink(file);
  const res = await fetch(`/api/admin/images?topic=${encodeURIComponent(current.id)}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type || file.type }, body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { handleAuthError({ status: 401 }); return null; }
    toast('Жүктеу қатесі: ' + (data.message || res.status), true);
    return null;
  }
  toast('Сурет жүктелді — «Сақтау» батырмасын басуды ұмытпаңыз');
  return data.url;
}


// ---------- Мұғалімдер ----------
async function loadTeachers() {
  let data;
  try { data = await api('/api/admin/teachers'); }
  catch (e) { if (!handleAuthError(e)) toast('Қате: ' + e.message, true); return; }
  $('#teacher-list').innerHTML = data.teachers.map(r => {
    const self = r.email === userEmail;
    const status = r.active ? '' : r.invited ? 'код берілді, әлі кірмеген' : 'код мерзімі өткен';
    return `<li><span>${esc(r.email)}${self ? ' <span class="hint">(сіз)</span>' : ''}${status ? `<span class="status">${status}</span>` : ''}</span>
      ${self ? '' : `<span class="acts">
        <button class="ico" data-invite="${esc(r.email)}" title="Құпиясөзді ұмытса — жаңа код">🔑 Жаңа код</button>
        <button class="ico del" data-remove="${esc(r.email)}">✕ Өшіру</button></span>`}</li>`;
  }).join('');
}

function showInvite({ email, code }) {
  const box = $('#invite-result');
  box.hidden = false;
  box.innerHTML = `<b>${esc(email)}</b> үшін шақыру коды:<div class="code">${esc(code)}</div>
    <span class="hint">Оны мұғалімге беріңіз: ол кіру бетінде «Шақыру кодым бар» арқылы өз құпиясөзін қояды. Код 7 күн жарамды және тек бір рет көрсетіледі.</span>`;
}

$('#teacher-form').onsubmit = async e => {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase();
  if ($$('#teacher-list [data-invite]').some(b => b.dataset.invite === email) || email === userEmail) {
    return toast('Бұл email тізімде бар. Құпиясөзін ұмытса, «Жаңа код» батырмасын басыңыз.', true);
  }
  try { showInvite(await api('/api/admin/teachers/invite', { email })); e.target.reset(); loadTeachers(); }
  catch (err) { if (!handleAuthError(err)) toast(err.message, true); }
};

$('#teacher-list').onclick = async e => {
  const inv = e.target.closest('[data-invite]'), rm = e.target.closest('[data-remove]');
  try {
    if (inv && confirm(`${inv.dataset.invite} үшін жаңа шақыру коды жасалсын ба? (Құпиясөзін ұмытқан жағдайда)`)) {
      showInvite(await api('/api/admin/teachers/invite', { email: inv.dataset.invite }));
      loadTeachers();
    }
    if (rm && confirm(`${rm.dataset.remove} мұғалімдер тізімінен өшірілсін бе?`)) {
      await api('/api/admin/teachers/remove', { email: rm.dataset.remove });
      loadTeachers();
    }
  } catch (err) { if (!handleAuthError(err)) toast(err.message, true); }
};

$('#password-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try { await api('/api/auth/password', { current: f.current.value, password: f.password.value }); f.reset(); toast('Құпиясөз өзгертілді ✓'); }
  catch (err) { if (!handleAuthError(err)) toast(err.message, true); }
};
