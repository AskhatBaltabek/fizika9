// Жағдаяттық есептің жауабын балмен бағалау. Браузерде де, Cloudflare Worker-де де қолданылады.
// Сұрақ түрлері:
//   { kind: 'number', text, answer, unit, tol, points } — оқушы мәтінінен сан ізделеді
//   { kind: 'text',   text, accept: ['м/с', 'метр/секунд'], points } — нұсқалардың бірі кездессе жеткілікті

(function () {
  const LETTER = 'a-zа-яёәғқңөұүһі';

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

  function near(a, b, tol) {
    return Math.abs(a - b) <= (tol || 0) + 1e-9 * Math.max(1, Math.abs(b));
  }

  // Сандарды тізіп жазып, кездейсоқ «табуға» тырысуды тоқтатамыз
  const MAX_NUMBERS = 40;

  function gradeCase(task, answerText) {
    const nums = extractNumbers(answerText);
    const spam = nums.length > MAX_NUMBERS;
    const results = (task.questions || []).map(q => {
      const pts = Number(q.points) || 0;
      const ok = spam ? false : q.kind === 'text'
        ? (q.accept || []).some(a => hasPhrase(answerText, a))
        : nums.some(n => near(n, Number(q.answer), Number(q.tol)));
      return { ok, points: ok ? pts : 0, max: pts };
    });
    return {
      spam,
      results,
      score: results.reduce((a, r) => a + r.points, 0),
      max: results.reduce((a, r) => a + r.max, 0),
    };
  }

  globalThis.gradeCase = gradeCase;
  globalThis.extractNumbers = extractNumbers;
})();
