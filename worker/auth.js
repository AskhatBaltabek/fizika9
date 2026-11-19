// Мұғалімдердің кіруі: PBKDF2 құпиясөз хэші, шақыру кодтары, cookie-сессиялар (D1-де).

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)));

// Тегін Workers жоспарында CPU уақыты шектеулі, сондықтан итерация саны орташа;
// бір email-ге көп қате әрекет жасалса, ол уақытша бұғатталады.
const ITER = 15000;
const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export const normEmail = e => String(e || '').trim().toLowerCase();
const now = () => Date.now();

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
  return `pbkdf2$${ITER}$${hex(salt)}$${hex(bits)}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [, iter, salt, expected] = stored.split('$');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: +iter }, key, 256));
  const a = enc.encode(bits), b = enc.encode(expected);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

// «K7QM-3XPA» сияқты код: шатастыратын әріптер (0/O, 1/I) жоқ
export function newInviteCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map(x => abc[x % abc.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}
export const inviteHash = code => sha256(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
export const inviteExpiry = () => now() + INVITE_DAYS * 864e5;

function cookie(token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function startSession(env, email) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('delete from sessions where expires < ?').bind(now()),
    env.DB.prepare('insert into sessions (token_hash, email, expires) values (?, ?, ?)')
      .bind(await sha256(token), email, now() + SESSION_DAYS * 864e5),
  ]);
  return cookie(token, SESSION_DAYS * 86400);
}

export async function currentTeacher(request, env) {
  const m = /(?:^|;\s*)sid=([0-9a-f]{64})/.exec(request.headers.get('cookie') || '');
  if (!m) return null;
  const row = await env.DB.prepare(
    'select s.email from sessions s join teachers t on t.email = s.email where s.token_hash = ? and s.expires > ?'
  ).bind(await sha256(m[1]), now()).first();
  return row?.email || null;
}

const PASSWORD_RULE = 'Құпиясөз кемінде 8 таңбадан тұруы керек.';
const okPassword = p => typeof p === 'string' && p.length >= 8 && p.length <= 200;

// json(data, status, headers) index.js-тен беріледі
export async function handleAuth(path, request, env, body, json) {
  if (path === '/api/auth/me') {
    const email = await currentTeacher(request, env);
    return email ? json({ email }) : json({ error: 'unauthorized' }, 401);
  }

  if (path === '/api/auth/logout') {
    const m = /(?:^|;\s*)sid=([0-9a-f]{64})/.exec(request.headers.get('cookie') || '');
    if (m) await env.DB.prepare('delete from sessions where token_hash = ?').bind(await sha256(m[1])).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
  }

  if (path === '/api/auth/login') {
    const email = normEmail(body.email);
    const t = await env.DB.prepare('select pass_hash, failed, locked_until from teachers where email = ?').bind(email).first();
    if (t && t.locked_until > now()) return json({ error: 'locked', message: `Тым көп қате әрекет. ${LOCK_MINUTES} минуттан кейін қайталаңыз.` }, 429);
    const ok = t && await verifyPassword(String(body.password || ''), t.pass_hash);
    if (!ok) {
      if (t) {
        const failed = t.failed + 1;
        await env.DB.prepare('update teachers set failed = ?, locked_until = ? where email = ?')
          .bind(failed >= MAX_FAILED ? 0 : failed, failed >= MAX_FAILED ? now() + LOCK_MINUTES * 6e4 : 0, email).run();
      }
      return json({ error: 'bad_credentials', message: 'Email немесе құпиясөз қате.' }, 401);
    }
    await env.DB.prepare('update teachers set failed = 0, locked_until = 0 where email = ?').bind(email).run();
    return json({ email }, 200, { 'set-cookie': await startSession(env, email) });
  }

  // Шақыру коды арқылы алғашқы кіру немесе құпиясөзді қалпына келтіру
  if (path === '/api/auth/accept-invite') {
    const email = normEmail(body.email);
    if (!okPassword(body.password)) return json({ error: 'weak', message: PASSWORD_RULE }, 400);
    const t = await env.DB.prepare('select invite_hash, invite_expires, locked_until from teachers where email = ?').bind(email).first();
    if (t && t.locked_until > now()) return json({ error: 'locked', message: `Тым көп қате әрекет. ${LOCK_MINUTES} минуттан кейін қайталаңыз.` }, 429);
    const valid = t?.invite_hash && t.invite_expires > now() && t.invite_hash === await inviteHash(body.code);
    if (!valid) {
      if (t) await env.DB.prepare(`update teachers set
          failed = case when failed + 1 >= ?1 then 0 else failed + 1 end,
          locked_until = case when failed + 1 >= ?1 then ?2 else locked_until end
        where email = ?3`).bind(MAX_FAILED, now() + LOCK_MINUTES * 6e4, email).run();
      return json({ error: 'bad_invite', message: 'Email немесе шақыру коды қате (не мерзімі өткен).' }, 400);
    }
    await env.DB.batch([
      env.DB.prepare('update teachers set pass_hash = ?, invite_hash = null, invite_expires = null, failed = 0, locked_until = 0 where email = ?')
        .bind(await hashPassword(body.password), email),
      env.DB.prepare('delete from sessions where email = ?').bind(email),
    ]);
    return json({ email }, 200, { 'set-cookie': await startSession(env, email) });
  }

  if (path === '/api/auth/password') {
    const email = await currentTeacher(request, env);
    if (!email) return json({ error: 'unauthorized' }, 401);
    if (!okPassword(body.password)) return json({ error: 'weak', message: PASSWORD_RULE }, 400);
    const t = await env.DB.prepare('select pass_hash from teachers where email = ?').bind(email).first();
    if (!await verifyPassword(String(body.current || ''), t?.pass_hash)) return json({ error: 'bad_credentials', message: 'Қазіргі құпиясөз қате.' }, 400);
    await env.DB.prepare('update teachers set pass_hash = ? where email = ?').bind(await hashPassword(body.password), email).run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}
