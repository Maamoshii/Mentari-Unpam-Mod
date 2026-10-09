const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const BANK = {};

function askBg(msg) {
  return new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (res) => resolve(res || { error: 'tanpa respon' })); }
    catch (e) { resolve({ error: String(e.message || e) }); }
  });
}

async function getAiCfg() {
  const o = await chrome.storage.local.get(['aiEndpoint', 'aiKey', 'aiModel']);
  let { aiEndpoint, aiKey, aiModel } = o;
  if (!aiEndpoint) {
    aiEndpoint = (prompt('AI endpoint (URL chat completions OpenAI-compatible):', '') || '').trim();
    if (aiEndpoint) await chrome.storage.local.set({ aiEndpoint });
  }
  if (!aiKey) {
    aiKey = (prompt('AI API key (tersimpan lokal di browser):', '') || '').trim();
    if (aiKey) await chrome.storage.local.set({ aiKey });
  }
  if (!aiModel) {
    aiModel = (prompt('Nama model AI:', '') || '').trim();
    if (aiModel) await chrome.storage.local.set({ aiModel });
  }
  return { aiEndpoint, aiKey, aiModel };
}

async function askAI(soal, opsis) {
  const cfg = await getAiCfg();
  if (!cfg.aiEndpoint || !cfg.aiKey || !cfg.aiModel) { console.log('[mentari-auto] AI SKIP: konfigurasi belum lengkap'); return -1; }
  const res = await askBg({ type: 'askAI', endpoint: cfg.aiEndpoint, key: cfg.aiKey, model: cfg.aiModel, soal, opsis });
  if (typeof res?.idx === 'number' && res.idx >= 0) { console.log('[mentari-auto] AI pilih:', res.letter); return res.idx; }
  console.log('[mentari-auto] AI SKIP gagal:', res?.error || 'unknown'); return -1;
}

async function pickAnswer(soal, opsis) {
  const n = norm(soal);
  for (const [k, v] of Object.entries(BANK)) {
    if (n.includes(norm(k))) {
      const vv = norm(String(v));
      const idx = opsis.findIndex((o) => norm(o).includes(vv));
      if (idx >= 0) return idx;
      if (/^[a-e]$/.test(vv)) return vv.charCodeAt(0) - 97;
    }
  }
  return await askAI(soal, opsis);
}

const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function adaTombolMulai() {
  return [...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && /mulai quiz/i.test((b.textContent || '').trim()));
}

function getToken() {
  for (let i = 0; i < localStorage.length; i++) {
    const v = localStorage.getItem(localStorage.key(i)) || '';
    const m = v.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    if (m) return m[0];
  }
  return '';
}

let badge = null;
function setStatus(t, bg) {
  if (!badge) return;
  badge.textContent = `Mentari Mod: ${t}`;
  if (bg) badge.style.background = bg;
}

function butuhKerja() {
  if (!/\/quiz\/|\/exam\//.test(location.pathname)) return false;
  if (adaTombolMulai()) return false;
  return [...document.querySelectorAll('.MuiChip-label')].some((c) => /belum dijawab/i.test(c.textContent || ''));
}

async function apiGetQuiz() {
  const uuid = (location.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0] || '';
  const apis = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.includes('/api/'));
  const aman = (u) => !/\/(start|jawab|simpan|submit|finish|selesai)/i.test(u);
  const uuidMatch = uuid ? apis.filter((u) => aman(u) && /quiz|exam/i.test(u) && u.includes(uuid)) : [];
  const cands = [...new Set([
    ...uuidMatch,
    ...(uuid ? [`${location.origin}/api/quiz/peserta/${uuid}`, `${location.origin}/api/exam/peserta/${uuid}`] : []),
    ...(uuidMatch.length ? [] : apis.filter((u) => aman(u) && /peserta/i.test(u))),
    ...(uuidMatch.length ? [] : apis.filter((u) => aman(u) && /quiz|exam/i.test(u))),
  ])];
  console.log('[mentari-auto] coba:', cands.slice(0, 5));
  for (const url of cands.slice(0, 6)) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) { console.log('[mentari-auto] lewati', r.status, url.slice(-40)); continue; }
      const j = await r.json();
      if (j?.data?.length || j?.payload?.data?.length) return j;
    } catch (e) { console.log('[mentari-auto] lewati error', url.slice(-40)); }
  }
  console.log('[mentari-auto] data soal kosong');
  return null;
}

async function apiJawab(soalId, opsiId) {
  const body = JSON.stringify({ id_trx_quiz_user_soal: soalId, id_jawaban: opsiId, jawaban: null });
  for (const ep of ['/api/quiz/jawab', '/api/exam/jawab']) {
    const r = await fetch(`${location.origin}${ep}`, {
      method: 'PUT', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body,
    });
    const j = await r.json().catch(() => ({}));
    console.log('[mentari-auto] save:', soalId.slice(0, 8), '->', j.message || r.status);
    if (r.ok) return true;
  }
  return false;
}

async function autoQuiz() {
  await sleep(2000);
  const dlg = document.querySelector('[role="dialog"]');
  if (dlg) {
    const ya = [...dlg.querySelectorAll('button')].find((b) => /^(ya|yakin|mulai|setuju|ok|lanjut|setuju,?\s*mulai)$/i.test(norm(b.textContent)));
    const tidak = [...dlg.querySelectorAll('button')].some((b) => /^(tidak|batal|kembali)$/i.test(norm(b.textContent)));
    if (ya && tidak) {
      const k = `ma-ya-${location.pathname}`;
      const n = +(sessionStorage.getItem(k) || 0);
      if (n >= 2) { setStatus('dialog Ya berulang, klik manual...'); return 'start'; }
      sessionStorage.setItem(k, String(n + 1));
      setStatus('setuju dialog mulai...'); console.log('[mentari-auto] setuju dialog mulai');
      ya.click();
      await sleep(1000);
      location.reload();
      return true;
    }
  }
  if (adaTombolMulai()) {
    setStatus('menunggu klik "Mulai Quiz"...');
    console.log('[mentari-auto] menunggu klik "Mulai Quiz"...');
    return 'start';
  }
  const quiz = await apiGetQuiz();
  const data = quiz?.data || quiz?.payload?.data || [];
  if (!data.length) { setStatus('memuat soal...'); console.log('[mentari-auto] data soal kosong'); return 'start'; }
  const huruf = ['A', 'B', 'C', 'D', 'E'];
  const antre = data.filter((s) => s.jenis_soal === 'MULTIPLE_CHOICE' && !s.id_jawaban);
  antre.forEach((s) => console.log('[mentari-auto] antre:', s.sort));
  let saved = 0;
  for (const s of antre) {
    const t0 = Date.now();
    setStatus(`menjawab ${s.sort}/${data.length}...`, '#fb8c00');
    try {
      const soal = stripHtml(s.deskripsi);
      const opsis = s.list_jawaban.map((o) => stripHtml(o.jawaban));
      const idx = await pickAnswer(soal, opsis);
      if (idx < 0) { console.log(`[mentari-auto] soal ${s.sort}: AI gagal, DILEWATI tanpa simpan`); continue; }
      const opt = s.list_jawaban[Math.min(Math.max(idx, 0), s.list_jawaban.length - 1)];
      if (await apiJawab(s.id, opt.id)) saved++;
      console.log(`[mentari-auto] soal ${s.sort}: AI=${huruf[idx]} tersimpan (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) { console.log(`[mentari-auto] soal ${s.sort}: error, lanjut:`, e.message); }
    await sleep(300);
  }
  if (saved > 0) {
    await sleep(1000);
    const cek = await apiGetQuiz().catch(() => null);
    const isi = (cek?.data || cek?.payload?.data || []).filter((s) => s.jenis_soal === 'MULTIPLE_CHOICE' && s.id_jawaban).map((s) => s.sort);
    console.log(`[mentari-auto] terverifikasi terisi: [${isi.join(',')}], sinkron UI...`);
    setStatus('sinkron...', '#fb8c00');
    location.reload();
    return true;
  }
  const belum = (await apiGetQuiz().catch(() => ({ data: [] })))?.data?.filter((s) => s.jenis_soal === 'MULTIPLE_CHOICE' && !s.id_jawaban) || [];
  if (belum.length) { console.log(`[mentari-auto] sisa belum terisi: [${belum.map((s) => s.sort).join(',')}], coba lagi`); return false; }
  console.log('[mentari-auto] semua terisi terverifikasi, ke soal terakhir...');
  setStatus('ke soal terakhir...', '#fb8c00');
  const idAwal = document.querySelector('.__CAN_DETECTED_IF_SCROLL__')?.id || '';
  const angka = [...document.querySelectorAll('.MuiPaper-root')]
    .filter((el) => /^\d+$/.test((el.textContent || '').trim()))
    .sort((a, b) => +a.textContent.trim() - +b.textContent.trim());
  if (angka.length) { angka[angka.length - 1].click(); await sleep(1500); }
  const pindah = (document.querySelector('.__CAN_DETECTED_IF_SCROLL__')?.id || '') !== idAwal;
  if (!angka.length || !pindah) {
    for (let i = 0; i < 60; i++) {
      const nx = [...document.querySelectorAll('button')].find((b) => norm(b.textContent) === 'next');
      if (!nx || nx.disabled) break;
      nx.click();
      await sleep(1200);
    }
  }
  const done = [...document.querySelectorAll('button')].find((b) => /selesai quiz/i.test(b.textContent || ''));
  if (done && !done.disabled) {
    setStatus('submit...', '#fb8c00');
    console.log('[mentari-auto] semua dijawab, klik Selesai Quiz'); done.click();
    await sleep(2000);
    const dlg2 = document.querySelector('[role="dialog"]');
    const ya2 = [...(dlg2 || document).querySelectorAll('button')].find((b) => /^(ya|yakin|kumpulkan|kumpul|submit|selesai|ok|setuju)$/i.test(norm(b.textContent)));
    if (ya2) { console.log('[mentari-auto] konfirmasi:', ya2.textContent.trim()); ya2.click(); }
    else console.log('[mentari-auto] dialog konfirmasi tidak muncul / sudah submit');
  }
  else { setStatus('selesai ✓', '#43a047'); console.log('[mentari-auto] semua terisi, Selesai tidak aktif/sudah selesai'); }
  return true;
}

async function autoKuesioner() {
  await sleep(1500);
  const labels = [...document.querySelectorAll('label.MuiFormControlLabel')];
  const byName = {};
  document.querySelectorAll('label.MuiFormControlLabel input[type="radio"]').forEach((r) => { (byName[r.name] ||= []).push(r.closest('label')); });
  Object.values(byName).forEach((g) => g[0]?.click());
  [...document.querySelectorAll('button')].find((b) => /selesai|submit|simpan|kirim/i.test(b.textContent || ''))?.click();
}

(async () => {
  let last = '';
  let busy = false;
  let gagal = 0;
  async function route() {
    const path = location.pathname;
    if (path === last && !butuhKerja()) return;
    if (busy) return;
    busy = true;
    try {
      console.log('[mentari-auto] aktif di', path);
      if (/\/quiz\/|\/exam\//.test(path)) {
        const r = await autoQuiz();
        if (r === true) { last = path; gagal = 0; }
        else if (r === 'start') await sleep(3000);
        else await sleep(10000);
      }
      else if (/\/kuesioner\//.test(path)) { await autoKuesioner(); last = path; gagal = 0; }
    } catch (e) {
      console.log('[mentari-auto] error, coba lagi 5 dtk:', e.message);
      if (++gagal > 3) last = path;
      await sleep(5000);
    } finally { busy = false; }
  }
  badge = document.createElement('div');
  badge.textContent = `Mentari Mod: mulai...`;
  badge.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:99999;background:#43a047;color:#fff;font:12px sans-serif;padding:4px 8px;border-radius:8px;opacity:.9';
  document.documentElement.appendChild(badge);
  setInterval(route, 1000);
  await route();
})();
