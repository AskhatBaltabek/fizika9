// Мазмұнды жүктеу: Supabase бапталса — базадан, әйтпесе js/data.js ішінен.

const sb = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Базадағы жолдарды сайт қолданатын пішінге келтіру
function shapeTopic(t, sections, tasks) {
  return {
    id: t.id,
    title: t.title,
    short: t.short || '',
    icon: t.icon || 'atom',
    color: t.color || '#1aa39a',
    problem: {
      title: t.problem_title || '',
      text: t.problem_text || '',
      questions: t.problem_questions || [],
      image: t.problem_image || null,
    },
    formulas: t.formulas || [],
    ai: t.ai || [],
    teacher: t.teacher || '',
    sections: sections.filter(s => s.topic_id === t.id).map(s => ({ id: s.id, title: s.title, theory: s.theory || '' })),
    tasks: tasks.filter(x => x.topic_id === t.id).map(x => ({
      id: x.id, title: x.title, type: x.type, text: x.text,
      options: x.options || [], answer: Number(x.answer), unit: x.unit || '', tol: Number(x.tol) || 0,
      solution: x.solution || '', image: x.image || null,
    })),
  };
}

async function loadTopics() {
  if (!sb) {
    return TOPICS.map(t => ({ ...t, sections: t.sections.map(s => typeof s === 'string' ? { title: s, theory: '' } : s) }));
  }
  const [t, s, x] = await Promise.all([
    sb.from('topics').select('*').order('position'),
    sb.from('sections').select('*').order('position'),
    sb.from('tasks').select('*').order('position'),
  ]);
  const err = t.error || s.error || x.error;
  if (err) throw err;
  return t.data.map(row => shapeTopic(row, s.data, x.data));
}
