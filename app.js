const $=id=>document.getElementById(id);
const Core=globalThis.RumboGuardianCore;
const Chain=globalThis.RumboGuardianEvidenceChain;
const Vault=globalThis.RumboGuardianDomainVault;
const state={last:null,installPrompt:null,domainLists:{trusted:[],blocked:[]},vaultKey:null,vaultSalt:null,vaultBusy:false,vaultQueue:Promise.resolve(),legacyPending:false};
const LIST_KEY='rumboGuardianDomainListsV03'; // legacy read-only; deleted after encrypted migration
const ENCRYPTED_LIST_KEY='rumboGuardianDomainVaultV1';
const HISTORY_KEY='rumboGuardianHistory';

function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getLists(){
  return Vault.cleanLists(state.domainLists);
}
function setVaultStatus(message){
  $('vaultStatus').textContent=message;
}
function saveLists(lists){
  state.domainLists=Vault.cleanLists(lists);
  drawLists();
  if(!state.vaultKey)return; // without a passphrase, domain context lives in memory only
  const snapshot=getLists(),key=state.vaultKey,salt=state.vaultSalt;
  state.vaultQueue=state.vaultQueue.catch(()=>{}).then(async()=>{
    const encrypted=await Vault.seal(snapshot,key,salt);
    localStorage.setItem(ENCRYPTED_LIST_KEY,JSON.stringify(encrypted));
    setVaultStatus('Listas guardadas con AES-GCM. La clave permanece solo en esta pestaña.');
  }).catch(()=>{
    setVaultStatus('No se pudo guardar el cambio cifrado: exportá un respaldo antes de cerrar.');
  });
}
function initializeDomainVault(){
  try{
    const previous=localStorage.getItem(LIST_KEY);
    if(previous){
      state.domainLists=Vault.cleanLists(JSON.parse(previous));
      state.legacyPending=true;
      setVaultStatus('Atención: hay listas antiguas sin cifrar. Ingresá una frase secreta para migrarlas y borrar la copia anterior.');
    }else if(localStorage.getItem(ENCRYPTED_LIST_KEY)){
      setVaultStatus('Hay listas cifradas guardadas. Ingresá tu frase secreta para desbloquearlas.');
    }else{
      setVaultStatus('Las listas son temporales hasta que las guardes cifradas con una frase secreta.');
    }
  }catch{
    setVaultStatus('No se pudo leer el almacenamiento local. Las listas actuales son temporales.');
  }
}
async function unlockOrCreateVault(){
  if(state.vaultBusy)return;
  const passphrase=$('vaultPassphrase').value;
  if(!passphrase){setVaultStatus('Ingresá la frase secreta para guardar o desbloquear.');return;}
  state.vaultBusy=true;
  $('vaultSaveBtn').disabled=true;
  try{
    await state.vaultQueue;
    const current=getLists();
    const saved=localStorage.getItem(ENCRYPTED_LIST_KEY);
    let key,salt,lists;
    if(saved){
      const opened=await Vault.open(passphrase,JSON.parse(saved));
      key=opened.key;salt=opened.salt;
      lists=Vault.cleanLists({
        trusted:[...opened.lists.trusted,...current.trusted],
        blocked:[...opened.lists.blocked,...current.blocked]
      });
    }else{
      const created=await Vault.create(passphrase,current);
      key=created.key;salt=created.salt;
      lists=current;
    }
    const encrypted=await Vault.seal(lists,key,salt);
    localStorage.setItem(ENCRYPTED_LIST_KEY,JSON.stringify(encrypted));
    const confirmed=await Vault.open(passphrase,JSON.parse(localStorage.getItem(ENCRYPTED_LIST_KEY)));
    if(JSON.stringify(confirmed.lists)!==JSON.stringify(lists)){
      throw new Error('Error en la verificación del archivo cifrado');
    }
    // Remove legacy plaintext only after the encrypted content was saved AND decrypted correctly.
    if(state.legacyPending)localStorage.removeItem(LIST_KEY);
    state.domainLists=lists;
    state.vaultKey=key;
    state.vaultSalt=salt;
    state.legacyPending=false;
    drawLists();
    setVaultStatus('Contexto desbloqueado y guardado cifrado (AES-GCM). Recordá tu frase secreta.');
  }catch(error){
    setVaultStatus('No se pudo guardar o desbloquear: '+(error?.message||'clave incorrecta / almacenamiento bloqueado'));
  }finally{
    $('vaultPassphrase').value='';
    state.vaultBusy=false;
    $('vaultSaveBtn').disabled=false;
  }
}
async function lockVault(){
  if(state.vaultBusy)return;
  state.vaultBusy=true;
  try{
    await state.vaultQueue;
    state.vaultKey=null;
    state.vaultSalt=null;
    state.domainLists={trusted:[],blocked:[]};
    drawLists();
    setVaultStatus('Listas bloqueadas en esta pestaña. La copia cifrada permanece guardada.');
  }finally{state.vaultBusy=false;}
}
async function clearDomainVault(){
  if(state.vaultBusy)return;
  if(!window.confirm('¿Eliminar las listas cifradas y las copias antiguas de este navegador? Esta acción no se puede deshacer.'))return;
  state.vaultBusy=true;
  try{
    await state.vaultQueue;
    localStorage.removeItem(ENCRYPTED_LIST_KEY);
    localStorage.removeItem(LIST_KEY);
    state.vaultKey=null;
    state.vaultSalt=null;
    state.domainLists={trusted:[],blocked:[]};
    state.legacyPending=false;
    drawLists();
    setVaultStatus('Se eliminaron las copias locales de listas de dominios.');
    state.vaultBusy=false;
  }catch{
    setVaultStatus('No se pudo eliminar el almacenamiento. Revisá los permisos del navegador.');
    state.vaultBusy=false;
  }
}
function addDomain(kind){
  if(state.vaultBusy)return;
  const domain=Core.normalizeDomain($('domainInput').value);
  if(!domain)return;
  const lists=getLists(),other=kind==='trusted'?'blocked':'trusted';
  lists[other]=lists[other].filter(x=>x!==domain);
  if(!lists[kind].includes(domain))lists[kind].push(domain);
  lists[kind].sort();saveLists(lists);$('domainInput').value='';
}
function removeDomain(kind,domain){if(state.vaultBusy)return;const lists=getLists();lists[kind]=lists[kind].filter(x=>x!==domain);saveLists(lists);}
function drawLists(){
  const lists=getLists();
  for(const [kind,id] of [['trusted','trustedList'],['blocked','blockedList']]){
    const box=$(id),items=lists[kind];
    box.className='chips'+(items.length?'':' empty');
    box.innerHTML=items.length?items.map(d=>`<span class="chip">${escapeHtml(d)}<button type="button" data-kind="${kind}" data-domain="${escapeHtml(d)}" aria-label="Quitar ${escapeHtml(d)}">×</button></span>`).join(''):'Sin dominios definidos.';
  }
  document.querySelectorAll('.chip button').forEach(btn=>btn.addEventListener('click',()=>removeDomain(btn.dataset.kind,btn.dataset.domain)));
}function getHistory(){
  try{
    const parsed=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
    return Array.isArray(parsed)&&parsed.every(item=>item!==null&&typeof item==='object'&&!Array.isArray(item))?parsed:[];
  }
  catch{return[]}
}
async function ensureHistoryChain(){
  const history=getHistory();
  if(!history.length)return [];
  if(history.every(item=>!item.entryHash)){
    const migrated=await Chain.buildChain(history.slice().reverse());
    localStorage.setItem(HISTORY_KEY,JSON.stringify(migrated));
    return migrated;
  }
  return history;
}
async function saveHistory(result){
  let history=await ensureHistoryChain();
  const integrity=await Chain.verifyChain(history);
  if(!integrity.valid){await drawHistory();return false;}
  history=await Chain.appendEntry(history,{...result,text:(result.text||'').slice(0,280)});
  if(history.length>80)history=await Chain.buildChain(history.slice(-80));
  localStorage.setItem(HISTORY_KEY,JSON.stringify(history));await drawHistory();return true;
}
async function drawHistory(){
  const history=await ensureHistoryChain(),box=$('history'),integrity=await Chain.verifyChain(history),badge=$('ledgerIntegrity');
  badge.textContent=!history.length?'Sin evidencia':integrity.valid?`Integridad verificada · ${history.length}`:`Integridad comprometida · evento ${integrity.brokenAt}`;
  badge.className='badge '+(!history.length?'neutral':integrity.valid?'safe':'danger');
  const visible=history.slice().reverse();
  box.className='history'+(visible.length?'':' empty');
  box.innerHTML=visible.length?visible.map(item=>`<div class="hist"><span class="dot ${item.level}"></span><div><strong>Riesgo ${escapeHtml(item.label)} · ${item.score}/100</strong><br><small>${escapeHtml((item.text||item.url||'').replace(/\s+/g,' ').slice(0,145))}</small></div><small> #${item.sequence} · ${new Date(item.date).toLocaleString()}</small></div>`).join(''):'Todavía no hay análisis guardados.';
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
$('analyzeBtn').addEventListener('click',async()=>{const r=currentAnalysis();render(r);if($('input').value.trim())await saveHistory(r);});
$('clearBtn').addEventListener('click',()=>{$('input').value='';$('input').focus();});
$('trustBtn').addEventListener('click',()=>addDomain('trusted'));
$('blockBtn').addEventListener('click',()=>addDomain('blocked'));
$('vaultSaveBtn').addEventListener('click',unlockOrCreateVault);
$('vaultLockBtn').addEventListener('click',lockVault);
$('vaultEraseBtn').addEventListener('click',clearDomainVault);
$('vaultExportBtn').addEventListener('click',()=>{downloadJson('guardian-domain-context-UNENCRYPTED.json',getLists());setVaultStatus('Se exportó un archivo SIN CIFRAR. Guardalo en un lugar seguro.');});
$('domainInput').addEventListener('keydown',e=>{if(e.key==='Enter')addDomain('trusted');});
$('clearHistoryBtn').addEventListener('click',()=>{localStorage.removeItem(HISTORY_KEY);drawHistory();});
$('exportBtn').addEventListener('click',async()=>{const history=await ensureHistoryChain(),integrity=await Chain.verifyChain(history);downloadJson('rumbo-guardian-evidence-ledger.json',{product:'RUMBO Guardian',version:'1.0.0',exportedAt:new Date().toISOString(),domainContext:getLists(),integrity:integrity,history});});
$('exportCurrentBtn').addEventListener('click',()=>{if(state.last)downloadJson('rumbo-guardian-risk-report.json',{product:'RUMBO Guardian',version:'1.0.0',report:state.last});});
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
initializeDomainVault();drawLists();drawHistory();
