// Контекстік тапсырманы бағалау. Браузерде де, Cloudflare Worker-де де қолданылады.
// Тапсырма бөліктерден (parts) тұрады:
//   choice — { options: [...], answer: 2 }                 нұсқаны таңдау (А, Ә, Б, В)
//   match  — { left: [...], right: [...], answer: [1,0,2] } сәйкестендіру (сол жақтың әрқайсысына оң жақтың индексі)
//   tf     — { statements: [...], answer: [true,false,…] } дұрыс / бұрыс
//   calc   — { answers: [{ value, unit, tol, points, alt? } | { accept: [...], points }] }
//            есеп: сандар оқушының «Берілгені / Шешуі / Жауабы» мәтінінен ізделеді
//   open   — { criteria: [...] }                           логикалық дәлелдеу: оны ЖИ бағалайды
// Оқушы жауабы: answers[i] — choice: индекс, match: индекстер, tf: true/false тізімі, calc/open: мәтін.

(function () {
  const LETTER = 'a-zа-яёәғқңөұүһі';
  const LETTERS = ['А', 'Ә', 'Б', 'В', 'Г', 'Ғ', 'Д', 'Е'];

  // «2,5», «2.5», «−3», «1 200», «6·10^14», «6×10¹⁴» — бәрін сандарға айналдырамыз
  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
  function extractNumbers(text) {
    // «10⁻¹⁹» — дәреже; ал «м/с²», «t²» ішіндегі жоғарғы индекс сан емес
    let s = String(text || '')
      .replace(/10([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, m) => '10^' + [...m].map(c => SUP[c]).join(''))
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, '');
    s = s.replace(/[−–]/g, '-').replace(/(\d)\s(?=\d{3}\b)/g, '$1');
    const nums = [];
    const re = /(-?\d+(?:[.,]\d+)?)(?:\s*[·*×xх]\s*10\s*\^\s*\(?(-?\d+)\)?)?/gi;
    let m;
    while ((m = re.exec(s))) {
      const base = parseFloat(m[1].replace(',', '.'));
      nums.push(m[2] !== undefined ? base * Math.pow(10, +m[2]) : base);
      if (m[2] !== undefined) nums.push(base); // «6·10^14» деп жазса да, «6» деп жазса да санаймыз
    }
    return nums;
  }

  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

  function hasPhrase(text, phrase) {
    const p = norm(phrase).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*');
    if (!p) return false;
    return new RegExp(`(^|[^${LETTER}])${p}(?=$|[^${LETTER}])`, 'i').test(norm(text));
  }

  // Бірлігі тікелей жалғасқан сандар: «1000 Н», «1 000Н»
  function numbersWithUnit(text, unit) {
    const u = norm(unit).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(-?\\d[\\d\\s]*(?:[.,]\\d+)?)\\s*${u}(?=$|[^${LETTER}])`, 'gi');
    const out = [];
    let m;
    while ((m = re.exec(norm(text)))) out.push(parseFloat(m[1].replace(/\s/g, '').replace(',', '.')));
    return out;
  }

  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0) + 1e-9 * Math.max(1, Math.abs(b));

  // Сандарды тізіп жазып, кездейсоқ «табуға» тырысуды тоқтатамыз
  const MAX_NUMBERS = 40;

  // Бірнеше элементтен тұратын бөлік: 1 балдық болса — бәрі дұрыс болғанда ғана, әйтпесе пропорционал
  const share = (points, good, total) => total ? Math.floor(points * good / total + 1e-9) : 0;

  function gradePart(part, value) {
    const max = Number(part.points) || 0;
    const empty = value == null || value === '' || (Array.isArray(value) && value.every(v => v == null || v === ''));
    const res = (points, extra = {}) => ({ points, max, ok: points === max && max > 0, empty, ...extra });

    switch (part.kind) {
      case 'choice':
        return res(!empty && Number(value) === Number(part.answer) ? max : 0);
      case 'match': {
        const v = Array.isArray(value) ? value : [];
        const items = (part.answer || []).map((a, i) => v[i] !== '' && v[i] != null && Number(v[i]) === Number(a));
        return res(share(max, items.filter(Boolean).length, items.length), { items });
      }
      case 'tf': {
        const v = Array.isArray(value) ? value : [];
        const items = (part.answer || []).map((a, i) => typeof v[i] === 'boolean' && v[i] === a);
        return res(share(max, items.filter(Boolean).length, items.length), { items });
      }
      case 'calc': {
        const text = String(value || '');
        const nums = extractNumbers(text);
        const spam = nums.length > MAX_NUMBERS;
        const items = (part.answers || []).map(a => {
          if (spam) return false;
          if (a.accept) return a.accept.some(w => hasPhrase(text, w));
          // needUnit: жауап шарттағы санмен сәйкес келсе, сан бірлігімен бірге жазылуы керек («1000 Н», «1000 кг» емес)
          const pool = a.needUnit && a.unit ? numbersWithUnit(text, a.unit) : nums;
          return [{ value: a.value, tol: a.tol }, ...(a.alt || [])].some(x => pool.some(n => near(n, Number(x.value), Number(x.tol))));
        });
        const points = (part.answers || []).reduce((s, a, i) => s + (items[i] ? Number(a.points) || 0 : 0), 0);
        return res(Math.min(points, max), { items, spam });
      }
      case 'open':
        // Мұны ЖИ (немесе мұғалім) бағалайды; бос болса — 0
        return res(0, { pending: !empty });
      default:
        return res(0);
    }
  }

  function gradeTask(task, answers) {
    const results = (task.parts || []).map((p, i) => gradePart(p, (answers || {})[i]));
    return {
      results,
      score: results.reduce((a, r) => a + r.points, 0),
      max: results.reduce((a, r) => a + r.max, 0),
      pending: results.some(r => r.pending),
    };
  }

  // Бөліктің дұрыс жауабын мәтінмен көрсету (мұғалім режимі және ЖИ үшін)
  function partKey(part) {
    const fmt = n => String(n).replace('.', ',');
    switch (part.kind) {
      case 'choice': return `${LETTERS[part.answer]}) ${part.options[part.answer]}`;
      case 'match': return part.answer.map((a, i) => `${i + 1}—${LETTERS[a]}`).join(', ');
      case 'tf': return part.answer.map((a, i) => `${i + 1}—${a ? 'Дұрыс' : 'Бұрыс'}`).join(', ');
      case 'calc': return (part.answers || []).map(a => a.accept ? a.accept[0] : `${fmt(a.value)} ${a.unit || ''}`.trim()).join('; ');
      case 'open': return (part.criteria || []).join(' ');
      default: return '';
    }
  }

  Object.assign(globalThis, { gradeTask, gradePart, partKey, extractNumbers, hasPhrase, LETTERS });
})();
