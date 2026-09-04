const $ = id => document.getElementById(id);
const Core = globalThis.RumboGuardianCore;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function getLists() {
  const data = await chrome.storage.local.get(['trusted', 'blocked']);
  return { trusted: data.trusted || [], blocked: data.blocked || [] };
}

function render(result, subject) {
  $('score').textContent = result.score;
  $('score').className = `score ${result.level}`;
  $('label').textContent = `Riesgo ${result.label}`;
  $('verdict').textContent = result.verdict;
  $('guide').textContent = result.guide || '';
  $('subject').textContent = subject;
  $('reasons').innerHTML = result.reasons.length
    ? result.reasons.slice(0, 12).map(r => `<div class="reason"><strong>+${r.points} · ${escapeHtml(r.title)}</strong><small>${escapeHtml(r.detail || '')}</small></div>`).join('')
    : '<div class="reason"><strong>Sin señales fuertes</strong><small>No se detectaron indicadores técnicos relevantes con las reglas locales actuales.</small></div>';
}
async function loadPendingAnalysis() {
  const token = new URLSearchParams(location.search).get('token') || '';
  if (!/^[0-9a-f-]{20,}$/i.test(token)) throw new Error('Invalid token');
  const key = `pendingAnalysis:${token}`;
  const data = await chrome.storage.session.get(key);
  const payload = data[key];
  await chrome.storage.session.remove(key);
  if (!payload || Date.now() - payload.createdAt > 120000) throw new Error('Expired analysis');
  const lists = await getLists();
  const subject = String(payload.value || '');
  const result = payload.kind === 'url'
    ? Core.analyzeUrl(subject, lists)
    : Core.analyzeMessage(subject, 'message', lists);
  render(result, subject);
}

loadPendingAnalysis().catch(() => {
  $('score').textContent = '—';
  $('score').className = 'score neutral';
  $('label').textContent = 'Análisis no disponible';
  $('verdict').textContent = 'La solicitud ya fue consumida, expiró o no es válida.';
  $('guide').textContent = 'Volvé a usar el menú contextual de RUMBO Guardian.';
  $('subject').textContent = '';
  $('reasons').innerHTML = '';
});
