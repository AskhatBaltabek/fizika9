// Мұғалімді кабинетсіз қосу немесе құпиясөзін өзгерту (D1 базасына тікелей жазады).
//   node d1/add-teacher.js                       — email мен құпиясөзді сұрайды
//   node d1/add-teacher.js teacher@mail.kz       — тек құпиясөзді сұрайды
//   node d1/add-teacher.js --local ...           — жергілікті (wrangler dev) базаға
// Құпиясөз экранда көрінбейді және команда тарихына түспейді.
const crypto = require('crypto');
const readline = require('readline');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ITER = 15000; // worker/auth.js-пен бірдей болуы керек

// Терминалда — сұрақ қойып, құпиясөзді жасырамыз; терминалсыз (pipe) — stdin жолдарын ретімен оқимыз
let piped;
async function ask(question, hidden = false) {
  if (!process.stdin.isTTY) {
    if (!piped) piped = fs.readFileSync(0, 'utf8').split(/\r?\n/);
    return piped.shift() ?? '';
  }
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  let email = (args.find(a => !a.startsWith('--')) || '').trim().toLowerCase();
  if (!email) email = (await ask('Email: ')).trim().toLowerCase();
  if (!/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(email)) { console.error('Email дұрыс емес.'); process.exit(1); }

  const p1 = await ask('Құпиясөз (кемінде 8 таңба): ', true);
  if (p1.length < 8) { console.error('Құпиясөз тым қысқа.'); process.exit(1); }
  const p2 = await ask('Құпиясөзді қайталаңыз: ', true);
  if (p1 !== p2) { console.error('Құпиясөздер сәйкес келмейді.'); process.exit(1); }

  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(p1, salt, ITER, 32, 'sha256').toString('hex');
  const stored = `pbkdf2$${ITER}$${salt.toString('hex')}$${hash}`;

  const sql = `insert into teachers (email, pass_hash, added_by) values ('${email}', '${stored}', 'cli')
    on conflict(email) do update set pass_hash = excluded.pass_hash, invite_hash = null, invite_expires = null, failed = 0, locked_until = 0;
    delete from sessions where email = '${email}';`;
  // SQL уақытша файл арқылы беріледі: Windows командалық жолы тырнақшаларды бұзбауы үшін
  const file = path.join(os.tmpdir(), `fizika9-teacher-${process.pid}.sql`);
  fs.writeFileSync(file, sql);
  try {
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['-y', 'wrangler@latest', 'd1', 'execute', 'fizika9', local ? '--local' : '--remote', '--file', file],
      { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });
  } finally { fs.unlinkSync(file); }
  console.log(`✓ ${email} — мұғалім. Кіру: https://fizika9.i-b-aseke.workers.dev/admin`);
})().catch(e => { console.error('Қате:', e.message); process.exit(1); });
