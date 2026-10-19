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
  toast.t = setTimeout(() => el.hidden = true, 3500);
}

function show(view) {
  ['login', 'reset', 'denied', 'topics', 'teachers'].forEach(v => $('#v-' + v).hidden = v !== view);
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
if (!sb) {
  document.body.innerHTML = '<div class="auth"><div class="box auth-box"><h1>Supabase бапталмаған</h1><p>js/config.js файлына SUPABASE_URL және SUPABASE_ANON_KEY мәндерін жазыңыз.</p></div></div>';
  throw new Error('Supabase is not configured');
}

$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, msg = $('#login-msg');
  msg.className = 'msg'; msg.textContent = 'Күте тұрыңыз...';
  const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  if (error) {
    msg.className = 'msg err';
    msg.textContent = /confirm/i.test(error.message) ? 'Алдымен поштаңызға келген хаттағы сілтемені басыңыз.' : 'Email немесе құпиясөз қате.';
  }
};

$('#signup').onclick = async e => {
  e.preventDefault();
  const f = $('#login-form'), msg = $('#login-msg');
  if (!f.reportValidity()) return;
  const { error } = await sb.auth.signUp({
    email: f.email.value.trim(), password: f.password.value,
    options: { emailRedirectTo: location.href.split('#')[0] },
  });
  msg.className = 'msg ' + (error ? 'err' : 'ok');
  msg.textContent = error ? 'Қате: ' + error.message : 'Поштаңызды тексеріп, хаттағы сілтемені басыңыз. Содан кейін осында кіріңіз.';
};

$('#forgot').onclick = async e => {
  e.preventDefault();
  const email = $('#login-form').email.value.trim(), msg = $('#login-msg');
  if (!email) { msg.className = 'msg err'; msg.textContent = 'Алдымен email жазыңыз.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
  msg.className = 'msg ' + (error ? 'err' : 'ok');
  msg.textContent = error ? 'Қате: ' + error.message : 'Құпиясөзді қалпына келтіру сілтемесі поштаңызға жіберілді.';
};

$('#reset-form').onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: e.target.password.value });
  if (error) { $('#reset-msg').className = 'msg err'; $('#reset-msg').textContent = error.message; return; }
  toast('Құпиясөз өзгертілді');
  recovering = false;
  history.replaceState(null, '', location.pathname);
  start();
};

$('#logout').onclick = () => sb.auth.signOut();

let started = false;
let recovering = /type=recovery/.test(location.hash);
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') { recovering = true; return show('reset'); }
  if (!session) { started = false; userEmail = ''; $('#who').textContent = ''; $('#logout').hidden = true; return show('login'); }
  if (!started) { started = true; setTimeout(start, 0); }
});

async function start() {
  if (recovering) return show('reset');
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return show('login');
  userEmail = user.email.toLowerCase();
  $('#who').textContent = userEmail;
  $('#logout').hidden = false;
  const { data: ok } = await sb.rpc('is_teacher');
  if (!ok) { $('#denied-email').textContent = userEmail; return show('denied'); }
  await reload();
  show('topics');
}

$$('.nav a[data-tab]').forEach(a => a.onclick = e => {
  e.preventDefault();
  if (a.dataset.tab === 'teachers') { loadTeachers(); show('teachers'); } else show('topics');
});

// ---------- Тақырыптар тізімі ----------
async function reload(keepId) {
  try { topics = await loadTopics(); } catch (e) { return toast('Жүктеу қатесі: ' + e.message, true); }
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
  const { error } = await sb.from('topics').upsert(topics.map(topicRow));
  toast(error ? 'Қате: ' + error.message : 'Реті сақталды', !!error);
};

$('#add-topic').onclick = async () => {
  if (dirty && !confirm('Сақталмаған өзгерістер жоғалады. Жалғастырасыз ба?')) return;
  const id = newId();
  const { error } = await sb.from('topics').insert({ id, position: topics.length, title: 'Жаңа тақырып' });
  if (error) return toast('Қате: ' + error.message, true);
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

function taskEditor(x, i) {
  const choice = x.type === 'choice';
  return `<div class="item" data-task="${i}">
    ${itemHead('Тапсырма', i, 'tasks')}
    <div class="g2">
      <label>Атауы<input name="title" value="${esc(x.title)}" placeholder="Мысалы: Тайғақ жол"></label>
      <label>Түрі<select name="type">
        <option value="choice" ${choice ? 'selected' : ''}>Нұсқаны таңдау</option>
        <option value="number" ${!choice ? 'selected' : ''}>Сан жауап</option>
      </select></label>
    </div>
    <label>Шарты<textarea name="text">${esc(x.text)}</textarea></label>
    ${choice ? `
      <div><div class="hint" style="margin-bottom:6px">Нұсқалар (дұрысын белгілеңіз):</div>
      ${x.options.map((o, k) => `<div class="opt-row" style="margin-bottom:6px">
        <input type="radio" name="answer-${i}" value="${k}" ${k === x.answer ? 'checked' : ''} title="Дұрыс жауап">
        <input name="opt" value="${esc(o)}">
        <button type="button" class="ico del" data-act="opt-del" data-i="${i}" data-k="${k}">✕</button></div>`).join('')}
      <button type="button" class="add" data-act="opt-add" data-i="${i}">+ Нұсқа</button></div>` : `
      <div class="g3">
        <label>Дұрыс жауап<input name="answer" inputmode="decimal" value="${esc(String(x.answer).replace('.', ','))}"></label>
        <label>Өлшем бірлігі<input name="unit" value="${esc(x.unit)}" placeholder="м/с"></label>
        <label>Рұқсат етілген ауытқу<input name="tol" inputmode="decimal" value="${esc(String(x.tol).replace('.', ','))}"></label>
      </div>`}
    <label>Шешуі<textarea name="solution">${esc(x.solution)}</textarea></label>
    ${imgField('image', x.image)}
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
      <h2>Тапсырмалар</h2>
      ${t.tasks.map(taskEditor).join('')}
      <div class="g2">
        <button type="button" class="add" data-act="add-task" data-type="choice">+ Нұсқаны таңдау тапсырмасы</button>
        <button type="button" class="add" data-act="add-task" data-type="number">+ Сан жауапты тапсырма</button>
      </div>
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
  t.tasks = $$('[data-task]', ed).map((r, i) => {
    const x = { ...t.tasks[i], title: $('[name=title]', r).value.trim(), type: $('[name=type]', r).value, text: $('[name=text]', r).value.trim(), solution: $('[name=solution]', r).value.trim(), image: $('[name=image]', r).value || null };
    if ($('[name=opt]', r) || x.type === 'choice') {
      x.options = $$('[name=opt]', r).map(o => o.value);
      const sel = $(`input[name="answer-${i}"]:checked`, r);
      if (sel) x.answer = +sel.value;
    }
    if ($('[name=answer]', r)) {
      const num = s => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
      x.answer = num($('[name=answer]', r).value);
      x.unit = $('[name=unit]', r).value.trim();
      x.tol = num($('[name=tol]', r).value) || 0;
    }
    return x;
  });
}

function rerender() { collect(); renderEditor(); setDirty(true); }

$('#editor').addEventListener('input', () => setDirty(true));

$('#editor').addEventListener('change', async e => {
  const el = e.target;
  if (el.name === 'type') {
    collect();
    const x = current.tasks[+el.closest('[data-task]').dataset.task];
    if (x.type === 'choice' && !x.options.length) { x.options = ['', '']; x.answer = 0; }
    renderEditor(); setDirty(true);
    return;
  }
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
      t.tasks.push(b.dataset.type === 'choice'
        ? { title: '', type: 'choice', text: '', options: ['', '', '', ''], answer: 0, unit: '', tol: 0, solution: '', image: null }
        : { title: '', type: 'number', text: '', options: [], answer: 0, unit: '', tol: 0, solution: '', image: null });
      break;
    case 'opt-add': t.tasks[i].options.push(''); break;
    case 'opt-del': {
      const x = t.tasks[i], k = +b.dataset.k;
      x.options.splice(k, 1);
      if (x.answer >= x.options.length) x.answer = Math.max(0, x.options.length - 1);
      else if (x.answer > k) x.answer--;
      break;
    }
    case 'img-remove': $('input[type=hidden]', b.closest('[data-img]')).value = ''; collect(); break;
  }
  renderEditor();
  setDirty(true);
});

// ---------- Сақтау ----------
// Жазу тек POST (upsert) арқылы: кейбір антивирустар мен кеңейтімдер браузерде PATCH сұраныстарын бұғаттайды
function topicRow(t) {
  return {
    id: t.id, position: topics.indexOf(t), title: t.title, short: t.short, icon: t.icon, color: t.color,
    problem_title: t.problem.title, problem_text: t.problem.text, problem_questions: t.problem.questions, problem_image: t.problem.image,
    formulas: t.formulas, ai: t.ai, teacher: t.teacher, updated_at: new Date().toISOString(),
  };
}

function validate(t) {
  for (const [i, x] of t.tasks.entries()) {
    const n = `${i + 1}-тапсырма`;
    if (!x.text) return `${n}: шартын жазыңыз.`;
    if (x.type === 'choice') {
      if (x.options.filter(o => o.trim()).length < 2) return `${n}: кемінде 2 нұсқа керек.`;
      if (x.options.some(o => !o.trim())) return `${n}: бос нұсқаларды толтырыңыз немесе өшіріңіз.`;
    } else if (!Number.isFinite(x.answer)) return `${n}: дұрыс жауапты сан түрінде жазыңыз (мысалы 2,5).`;
  }
  if (t.sections.some(s => !s.title)) return 'Бөлімдердің атауларын толтырыңыз.';
  return null;
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
    const must = r => { if (r.error) throw r.error; return r; };
    must(await sb.from('topics').upsert(topicRow(t)));

    const inList = ids => `(${ids.map(id => `"${id}"`).join(',')})`;
    let del = sb.from('sections').delete().eq('topic_id', t.id);
    if (t.sections.length) del = del.not('id', 'in', inList(t.sections.map(s => s.id)));
    must(await del);
    if (t.sections.length) must(await sb.from('sections').upsert(t.sections.map((s, i) => ({ id: s.id, topic_id: t.id, position: i, title: s.title, theory: s.theory }))));

    del = sb.from('tasks').delete().eq('topic_id', t.id);
    if (t.tasks.length) del = del.not('id', 'in', inList(t.tasks.map(x => x.id)));
    must(await del);
    if (t.tasks.length) must(await sb.from('tasks').upsert(t.tasks.map((x, i) => ({
      id: x.id, topic_id: t.id, position: i, title: x.title, type: x.type, text: x.text,
      options: x.type === 'choice' ? x.options : [], answer: x.answer, unit: x.type === 'number' ? x.unit : '',
      tol: x.type === 'number' ? x.tol : 0, solution: x.solution, image: x.image,
    }))));

    setDirty(false);
    renderList();
    toast('Сақталды ✓');
  } catch (e) {
    toast('Сақтау қатесі: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Сақтау';
  }
}

async function deleteTopic() {
  if (!confirm(`«${current.title}» тақырыбын барлық тапсырмаларымен бірге жоясыз ба? Бұл әрекетті қайтару мүмкін емес.`)) return;
  const { error } = await sb.from('topics').delete().eq('id', current.id);
  if (error) return toast('Қате: ' + error.message, true);
  // Тақырыптың суреттерін де өшіреміз
  const { data: files } = await sb.storage.from('images').list(current.id, { limit: 1000 });
  if (files?.length) await sb.storage.from('images').remove(files.map(f => `${current.id}/${f.name}`));
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
  const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'img').toLowerCase();
  const path = `${current.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await sb.storage.from('images').upload(path, blob, { contentType: blob.type || file.type });
  if (error) { toast('Жүктеу қатесі: ' + error.message, true); return null; }
  toast('Сурет жүктелді — «Сақтау» батырмасын басуды ұмытпаңыз');
  return sb.storage.from('images').getPublicUrl(path).data.publicUrl;
}

// ---------- Мұғалімдер ----------
async function loadTeachers() {
  const { data, error } = await sb.from('teacher_emails').select('*').order('added_at');
  if (error) return toast('Қате: ' + error.message, true);
  $('#teacher-list').innerHTML = data.map(r => `<li><span>${esc(r.email)}${r.email === userEmail ? ' <span class="hint">(сіз)</span>' : ''}</span>
    ${r.email === userEmail ? '' : `<button class="ico del" data-email="${esc(r.email)}">✕ Өшіру</button>`}</li>`).join('');
}

$('#teacher-form').onsubmit = async e => {
  e.preventDefault();
  const email = e.target.email.value.trim().toLowerCase();
  const { error } = await sb.from('teacher_emails').insert({ email });
  if (error) return toast(error.code === '23505' ? 'Бұл email тізімде бар' : 'Қате: ' + error.message, true);
  e.target.reset();
  toast('Қосылды. Енді ол «Тіркелу» арқылы тіркеле алады.');
  loadTeachers();
};

$('#teacher-list').onclick = async e => {
  const b = e.target.closest('[data-email]');
  if (!b || !confirm(`${b.dataset.email} мұғалімдер тізімінен өшірілсін бе?`)) return;
  const { error } = await sb.from('teacher_emails').delete().eq('email', b.dataset.email);
  if (error) return toast('Қате: ' + error.message, true);
  loadTeachers();
};
