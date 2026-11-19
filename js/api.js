// Сервермен байланыс: мазмұн /api/content арқылы (Cloudflare D1), мұғалім кабинеті /api/admin/* арқылы.

// JSON сұраныс; қате болса — сервердің қазақша хабарламасымен Error
async function api(path, body) {
  const res = await fetch(path, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.message || `Сервер қатесі (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const localTopics = () =>
  TOPICS.map(t => ({ ...t, sections: t.sections.map(s => typeof s === 'string' ? { title: s, theory: '' } : s) }));

// Сайт файлдан ашылса немесе сервер жауап бермесе, кірістірілген мазмұн көрсетіледі.
// Админка үшін fallback: false — әйтпесе мұғалім өзгерістерді «ауаға» сақтап қояды.
async function loadTopics({ fallback = true } = {}) {
  if (location.protocol === 'file:') return localTopics();
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));
    return await Promise.race([api('/api/content'), timeout]);
  } catch (e) {
    if (!fallback) throw e;
    console.warn('Сервер қолжетімсіз, кірістірілген мазмұн көрсетіледі:', e.message || e);
    return localTopics();
  }
}
