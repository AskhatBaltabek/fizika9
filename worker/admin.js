// Мұғалім кабинетінің API-і: тақырыптар, бөлімдер, есептер, суреттер, мұғалімдер тізімі.
import { normEmail, newInviteCode, inviteHash, inviteExpiry } from './auth.js';

const MAX_IMAGE = 5 * 1024 * 1024;
const str = (v, max = 20000) => String(v ?? '').slice(0, max);
const arr = v => Array.isArray(v) ? v : [];
const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function deleteImages(env, prefix) {
  let cursor;
  do {
    const page = await env.IMAGES.list({ prefix, cursor });
    await Promise.all(page.keys.map(k => env.IMAGES.delete(k.name)));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

export async function handleAdmin(path, request, env, body, json, me) {
  const DB = env.DB;

  if (path === '/api/admin/topics/create') {
    const id = newId();
    const { n } = await DB.prepare('select count(*) as n from topics').first();
    await DB.prepare('insert into topics (id, position, title) values (?, ?, ?)').bind(id, n, 'Жаңа тақырып').run();
    return json({ id });
  }

  // Тақырып бөлімдерімен және есептерімен бірге бір транзакцияда толық ауыстырылады
  if (path === '/api/admin/topics/save') {
    const t = body.topic || {};
    const exists = await DB.prepare('select id from topics where id = ?').bind(str(t.id, 100)).first();
    if (!exists) return json({ error: 'not found', message: 'Тақырып табылмады (басқа мұғалім жойған болуы мүмкін).' }, 404);
    const p = t.problem || {};
    const stmts = [
      DB.prepare(`update topics set title = ?, short = ?, icon = ?, color = ?, problem_title = ?, problem_text = ?,
        problem_questions = ?, problem_image = ?, formulas = ?, ai = ?, teacher = ?, goal = ?, updated_at = datetime('now') where id = ?`)
        .bind(str(t.title, 300) || 'Атаусыз тақырып', str(t.short, 500), str(t.icon, 40), str(t.color, 20),
          str(p.title, 500), str(p.text), JSON.stringify(arr(p.questions).map(q => str(q, 1000))), p.image ? str(p.image, 500) : null,
          JSON.stringify(arr(t.formulas).map(f => [str(f[0], 300), str(f[1], 500)])),
          JSON.stringify(arr(t.ai).map(a => str(a, 1000))), str(t.teacher), str(t.goal, 2000), t.id),
      DB.prepare('delete from sections where topic_id = ?').bind(t.id),
      DB.prepare('delete from tasks where topic_id = ?').bind(t.id),
    ];
    arr(t.sections).forEach((s, i) => stmts.push(
      DB.prepare('insert into sections (id, topic_id, position, title, theory) values (?, ?, ?, ?, ?)')
        .bind(str(s.id, 100) || crypto.randomUUID(), t.id, i, str(s.title, 500), str(s.theory, 100000))));
    arr(t.tasks).forEach((x, i) => stmts.push(
      DB.prepare('insert into tasks (id, topic_id, position, title, tag, text, parts, rubric, hints, solution, image) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(str(x.id, 100) || newId(), t.id, i, str(x.title, 300), str(x.tag, 100), str(x.text),
          JSON.stringify(arr(x.parts)), JSON.stringify(arr(x.rubric).map(r => [str(r[0], 300), str(r[1], 2000), Number(r[2]) || 0])),
          JSON.stringify(arr(x.hints).map(h => str(h, 1000))), str(x.solution), x.image ? str(x.image, 500) : null)));
    await DB.batch(stmts);
    return json({ ok: true });
  }

  if (path === '/api/admin/topics/order') {
    const ids = arr(body.ids).map(id => str(id, 100));
    if (ids.length) await DB.batch(ids.map((id, i) => DB.prepare('update topics set position = ? where id = ?').bind(i, id)));
    return json({ ok: true });
  }

  if (path === '/api/admin/topics/delete') {
    const id = str(body.id, 100);
    await DB.prepare('delete from topics where id = ?').bind(id).run();
    await deleteImages(env, id + '/');
    return json({ ok: true });
  }

  // Сурет: дене — файлдың өзі, Content-Type: image/*
  if (path === '/api/admin/images') {
    const type = request.headers.get('content-type') || '';
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return json({ error: 'type', message: 'Тек JPG, PNG, WEBP немесе GIF.' }, 400);
    const data = await request.arrayBuffer();
    if (data.byteLength > MAX_IMAGE) return json({ error: 'size', message: 'Сурет 5 МБ-тан аспауы керек.' }, 413);
    const topic = (new URL(request.url).searchParams.get('topic') || 'misc').replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'misc';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type];
    const key = `${topic}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await env.IMAGES.put(key, data, { metadata: { type } });
    return json({ url: '/img/' + key });
  }

  if (path === '/api/admin/teachers') {
    const { results } = await DB.prepare('select email, pass_hash is not null as active, invite_hash is not null and invite_expires > ? as invited from teachers order by created_at')
      .bind(Date.now()).all();
    return json({ me, teachers: results.map(r => ({ email: r.email, active: !!r.active, invited: !!r.invited })) });
  }

  // Жаңа мұғалімді қосу немесе құпиясөзін ұмытқан мұғалімге жаңа код беру
  if (path === '/api/admin/teachers/invite') {
    const email = normEmail(body.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'email', message: 'Email дұрыс емес.' }, 400);
    const code = newInviteCode();
    await DB.prepare(`insert into teachers (email, invite_hash, invite_expires, added_by) values (?1, ?2, ?3, ?4)
      on conflict(email) do update set invite_hash = ?2, invite_expires = ?3, failed = 0, locked_until = 0`)
      .bind(email, await inviteHash(code), inviteExpiry(), me).run();
    return json({ email, code });
  }

  if (path === '/api/admin/teachers/remove') {
    const email = normEmail(body.email);
    if (email === me) return json({ error: 'self', message: 'Өзіңізді өшіре алмайсыз.' }, 400);
    await DB.prepare('delete from teachers where email = ?').bind(email).run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}
