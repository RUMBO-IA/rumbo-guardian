const $=id=>document.getElementById(id);
const Core=globalThis.RumboGuardianCore;
const state={last:null,installPrompt:null};
const LIST_KEY='rumboGuardianDomainListsV03';
const HISTORY_KEY='rumboGuardianHistory';

function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getLists(){
  try{return {...{trusted:[],blocked:[]},...JSON.parse(localStorage.getItem(LIST_KEY)||'{}')};}
  catch{return {trusted:[],blocked:[]};}
}
function saveLists(lists){localStorage.setItem(LIST_KEY,JSON.stringify(lists));drawLists();}
function addDomain(kind){
  const domain=Core.normalizeDomain($('domainInput').value);
  if(!domain)return;
  const lists=getLists(),other=kind==='trusted'?'blocked':'trusted';
  lists[other]=lists[other].filter(x=>x!==domain);
  if(!lists[kind].includes(domain))lists[kind].push(domain);
  lists[kind].sort();saveLists(lists);$('domainInput').value='';
}
function removeDomain(kind,domain){const lists=getLists();lists[kind]=lists[kind].filter(x=>x!==domain);saveLists(lists);}
function drawLists(){
  const lists=getLists();
  for(const [kind,id] of [['trusted','trustedList'],['blocked','blockedList']]){
    const box=$(id),items=lists[kind];
    box.className='chips'+(items.length?'':' empty');
    box.innerHTML=items.length?items.map(d=>`<span class="chip">${escapeHtml(d)}<button type="button" data-kind="${kind}" data-domain="${escapeHtml(d)}" aria-label="Quitar ${escapeHtml(d)}">×</button></span>`).join(''):'Sin dominios definidos.';
  }
  document.querySelectorAll('.chip button').forEach(btn=>btn.addEventListener('click',()=>removeDomain(btn.dataset.kind,btn.dataset.domain)));
}function getHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}}
function saveHistory(result){
  const history=getHistory();
  history.unshift({...result,text:(result.text||'').slice(0,280)});
  localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(0,80)));drawHistory();
}
function drawHistory(){
  const history=getHistory(),box=$('history');
  box.className='history'+(history.length?'':' empty');
  box.innerHTML=history.length?history.map(item=>`<div class="hist"><span class="dot ${item.level}"></span><div><strong>Riesgo ${escapeHtml(item.label)} · ${item.score}/100</strong><br><small>${escapeHtml((item.text||item.url||'').replace(/\s+/g,' ').slice(0,145))}</small></div><small>${new Date(item.date).toLocaleString()}</small></div>`).join(''):'Todavía no hay análisis guardados.';
}
function render(result){
  state.last=result;
  $('score').textContent=result.score;$('score').className='score '+result.level;
  $('riskBadge').textContent='Riesgo '+result.label;$('riskBadge').className='badge '+result.level;
  $('verdict').textContent=result.verdict;$('guidance').textContent=result.guide;
  $('resultTime').textContent=new Date(result.date).toLocaleString();
  $('signalCount').textContent=result.reasons.length;$('urlCount').textContent=result.links?.length||0;$('charCount').textContent=(result.text||result.url||'').length;
  $('reasons').className='reasons';
  $('reasons').innerHTML=result.reasons.length?result.reasons.slice().sort((a,b)=>b.points-a.points).map(r=>`<div class="reason"><strong>+${r.points} · ${escapeHtml(r.title)}</strong><span>${escapeHtml(r.detail)}</span></div>`).join(''):'<div class="empty">No se detectaron señales relevantes con las reglas actuales.</div>';
}
function currentAnalysis(){
  const text=$('input').value,kind=$('kind').value,lists=getLists();
  let result;
  if(kind==='url')result=Core.analyzeUrl(text,lists);
  else result=Core.analyzeMessage(text,kind,lists);
  result={...result,text,date:new Date().toISOString()};
  return result;
}
function downloadJson(name,data){  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),link=document.createElement('a');
  link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
$('analyzeBtn').addEventListener('click',()=>{const r=currentAnalysis();render(r);if($('input').value.trim())saveHistory(r);});
$('clearBtn').addEventListener('click',()=>{$('input').value='';$('input').focus();});
$('trustBtn').addEventListener('click',()=>addDomain('trusted'));
$('blockBtn').addEventListener('click',()=>addDomain('blocked'));
$('domainInput').addEventListener('keydown',e=>{if(e.key==='Enter')addDomain('trusted');});
$('clearHistoryBtn').addEventListener('click',()=>{localStorage.removeItem(HISTORY_KEY);drawHistory();});
$('exportBtn').addEventListener('click',()=>downloadJson('rumbo-guardian-evidence-ledger.json',{product:'RUMBO Guardian',version:'0.3.1',exportedAt:new Date().toISOString(),domainContext:getLists(),history:getHistory()}));
$('exportCurrentBtn').addEventListener('click',()=>{if(state.last)downloadJson('rumbo-guardian-risk-report.json',{product:'RUMBO Guardian',version:'0.3.1',report:state.last});});
$('copyBtn').addEventListener('click',async()=>{
  if(!state.last)return;const r=state.last;
  const report=`RUMBO Guardian · Security Intelligence\nRisk: ${r.label} (${r.score}/100)\n${r.verdict}\n${r.reasons.map(x=>'- '+x.title+': '+x.detail).join('\n')}`;
  try{await navigator.clipboard.writeText(report);$('copyBtn').textContent='Copiado';setTimeout(()=>$('copyBtn').textContent='Copiar informe',1200)}catch{}
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;$('installBtn').classList.remove('hidden');});
$('installBtn').addEventListener('click',async()=>{if(!state.installPrompt)return;state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$('installBtn').classList.add('hidden');});
const incoming=new URLSearchParams(location.search).get('scan');
if(incoming){$('input').value=incoming;const result={...Core.analyzeMessage(incoming,'auto',getLists()),text:incoming,date:new Date().toISOString()};render(result);}
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
drawLists();drawHistory();