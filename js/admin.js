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

function questionEditor(q, i, k) {
  const isText = q.kind === 'text';
  return `<div class="q-item" data-q="${k}">
    <div class="item-head"><span class="n">${k + 1}-сұрақ</span><span class="sp"></span>
      <button type="button" class="ico del" data-act="q-del" data-i="${i}" data-k="${k}">✕</button></div>
    <label>Сұрақ мәтіні<input name="qtext" value="${esc(q.text)}" placeholder="Мысалы: Велосипедшінің орташа жылдамдығын есепте."></label>
    <div class="g4">
      <label>Жауап түрі<select name="kind">
        <option value="number" ${!isText ? 'selected' : ''}>Сан</option>
        <option value="text" ${isText ? 'selected' : ''}>Сөз / бірлік</option>
      </select></label>
      ${isText ? `
      <label class="span2">Қабылданатын жауаптар <span class="hint">(үтір арқылы)</span><input name="accept" value="${esc((q.accept || []).join(', '))}" placeholder="м/с, метр/секунд"></label>` : `
      <label>Дұрыс жауап<input name="answer" inputmode="decimal" value="${esc(fmtNum(q.answer))}" placeholder="5"></label>
      <label>Бірлігі<input name="unit" value="${esc(q.unit || '')}" placeholder="м/с"></label>`}
      <label>Балл<input name="points" inputmode="numeric" value="${esc(String(q.points ?? 1))}"></label>
    </div>
    ${isText ? '' : `<label>Рұқсат етілген ауытқу <span class="hint">(мысалы 0,1 — жауап 4,9…5,1 аралығында болса дұрыс)</span><input name="tol" inputmode="decimal" value="${esc(fmtNum(q.tol ?? 0))}"></label>`}
  </div>`;
}

function taskEditor(x, i) {
  const max = x.questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
  return `<div class="item" data-task="${i}">
    ${itemHead('Есеп', i, 'tasks')}
    <div class="g2">
      <label>Атауы<input name="title" value="${esc(x.title)}" placeholder="Мысалы: Велосипедшінің қозғалысы"></label>
      <label>Белгі <span class="hint">(мысалы: Механика)</span><input name="tag" value="${esc(x.tag || '')}"></label>
    </div>
    <label>Жағдаят (шарты)<textarea name="text">${esc(x.text)}</textarea></label>
    ${imgField('image', x.image)}
    <div class="hint">Сұрақтар — барлығы ${max} балл. Сан жауаптарды сайт оқушының шешімінен өзі іздейді.</div>
    ${x.questions.map((q, k) => questionEditor(q, i, k)).join('')}
    <button type="button" class="add" data-act="q-add" data-i="${i}">+ Сұрақ</button>
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
      <div class="g2">
        <div><div class="hint" style="margin-bottom:6px">Белгіше</div>
          <div class="icons">${Object.keys(ICONS).map(k => `<button type="button" data-icon="${k}" class="${k === t.icon ? 'on' : ''}">${ICONS[k]}</button>`).join('')}</div>
          <input type="hidden" name="icon" value="${esc(t.icon)}"></div>
        <label>Түсі<input type="color" name="color" value="${esc(t.color)}"></label>
      </div>
    </div>

    <div class="box">
      <h2>1 кезең: Проблемалық жағдаят</h2>
      <label>Тақырыбы<input name="problem_title" value="${esc(t.problem.title)}"></label>
      <label>Мәтіні<textarea name="problem_text">${esc(t.problem.text)}</textarea></label>
      <label>Талқылауға сұрақтар <span class="hint">(әр сұрақ жаңа жолдан)</span><textarea name="problem_questions">${esc(t.problem.questions.join('\n'))}</textarea></label>
      ${imgField('problem_image', t.problem.image)}
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
      <h2>Жағдаяттық есептер</h2>
      ${t.tasks.map(taskEditor).join('')}
      <button type="button" class="add" data-act="add-task">+ Есеп қосу</button>
    </div>

    <div class="box">
      <h2>Негізгі формулалар</h2>
      ${t.formulas.map(([f, d], i) => `<div class="f-row" data-formula="${i}">
        <input name="f" value="${esc(f)}" placeholder="F = ma"><input name="d" value="${esc(d)}" placeholder="Ньютонның екінші заңы">
        <button type="button" class="ico del" data-act="del" data-kind="formulas" data-i="${i}">✕</button></div>`).join('')}
      <button type="button" class="add" data-act="add-formula">+ Формула</button>
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
  t.problem = { title: val('problem_title'), text: val('problem_text'), questions: lines(val('problem_questions')), image: val('problem_image') || null };
  t.ai = lines(val('ai'));
  t.teacher = val('teacher');
  t.formulas = $$('[data-formula]', ed).map(r => [$('[name=f]', r).value.trim(), $('[name=d]', r).value.trim()]).filter(([f, d]) => f || d);
  t.sections = $$('[data-section]', ed).map((r, i) => ({ ...t.sections[i], title: $('[name=title]', r).value.trim(), theory: $('[name=theory]', r).value }));
  const num = v => parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  t.tasks = $$('[data-task]', ed).map((r, i) => ({
    ...t.tasks[i],
    title: $('[name=title]', r).value.trim(),
    tag: $('[name=tag]', r).value.trim(),
    text: $('[name=text]', r).value.trim(),
    image: $('[name=image]', r).value || null,
    solution: $('[name=solution]', r).value.trim(),
    hints: lines($('[name=hints]', r).value),
    questions: $$('[data-q]', r).map(qr => {
      const kind = $('[name=kind]', qr).value;
      const q = { kind, text: $('[name=qtext]', qr).value.trim(), points: num($('[name=points]', qr).value) };
      if (kind === 'text') q.accept = $('[name=accept]', qr).value.split(',').map(a => a.trim()).filter(Boolean);
      else Object.assign(q, { answer: num($('[name=answer]', qr).value), unit: $('[name=unit]', qr).value.trim(), tol: num($('[name=tol]', qr).value) || 0 });
      return q;
    }),
  }));
}

function rerender() { collect(); renderEditor(); setDirty(true); }

$('#editor').addEventListener('input', () => setDirty(true));

$('#editor').addEventListener('change', async e => {
  const el = e.target;
  if (el.name === 'kind') { rerender(); return; }
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
      t.tasks.push({ title: '', tag: '', text: '', image: null, solution: '', hints: [],
        questions: [{ kind: 'number', text: '', answer: NaN, unit: '', tol: 0, points: 2 }] });
      break;
    case 'q-add': t.tasks[i].questions.push({ kind: 'number', text: '', answer: NaN, unit: '', tol: 0, points: 1 }); break;
    case 'q-del':
      if (!confirm('Сұрақты жоясыз ба?')) return;
      t.tasks[i].questions.splice(+b.dataset.k, 1); break;
    case 'img-remove': $('input[type=hidden]', b.closest('[data-img]')).value = ''; collect(); break;
  }
  renderEditor();
  setDirty(true);
});

// ---------- Сақтау ----------
function validate(t) {
  for (const [i, x] of t.tasks.entries()) {
    const n = `${i + 1}-есеп`;
    if (!x.title) return `${n}: атауын жазыңыз.`;
    if (!x.text) return `${n}: жағдаятты жазыңыз.`;
    if (!x.questions.length) return `${n}: кемінде бір сұрақ қосыңыз.`;
    for (const [k, q] of x.questions.entries()) {
      const m = `${n}, ${k + 1}-сұрақ`;
      if (!q.text) return `${m}: сұрақ мәтінін жазыңыз.`;
      if (!(q.points > 0)) return `${m}: балл 0-ден көп болуы керек.`;
      if (q.kind === 'text' && !q.accept.length) return `${m}: кемінде бір қабылданатын жауап жазыңыз.`;
      if (q.kind === 'number' && !Number.isFinite(q.answer)) return `${m}: дұрыс жауапты сан түрінде жазыңыз (мысалы 2,5).`;
    }
  }
  if (t.sections.some(s => !s.title)) return 'Бөлімдердің атауларын толтырыңыз.';
  return null;
}

// Жауап шартта бұрыннан жазылған санмен сәйкес келсе, оқушы шартты көшіріп-ақ балл алады
function leaks(t) {
  const out = [];
  t.tasks.forEach((x, i) => {
    const given = extractNumbers(x.text + ' ' + x.questions.map(q => q.text).join(' '));
    x.questions.forEach((q, k) => {
      if (q.kind === 'number' && given.some(g => Math.abs(g - q.answer) <= q.tol + 1e-9)) out.push(`${i + 1}-есеп, ${k + 1}-сұрақ`);
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
    if (warn.length) toast(`Сақталды. Назар аударыңыз: ${warn.join('; ')} — жауабы шартта жазылған санмен бірдей, оқушы оны көшіріп балл алуы мүмкін.`, true);
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
