const $=id=>document.getElementById(id);
const Core=globalThis.RumboGuardianCore;
let current={domain:'',report:null};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function getLists(){const data=await chrome.storage.local.get(['trusted','blocked']);return {trusted:data.trusted||[],blocked:data.blocked||[]};}
async function setLists(lists){await chrome.storage.local.set(lists);}
async function setDomain(kind){
  if(!current.domain)return;const lists=await getLists();
  lists.trusted=lists.trusted.filter(x=>x!==current.domain);lists.blocked=lists.blocked.filter(x=>x!==current.domain);
  if(kind==='trusted')lists.trusted.push(current.domain);if(kind==='blocked')lists.blocked.push(current.domain);
  await setLists(lists);await scan();
}
function renderPage(report,data){
  current.domain=Core.normalizeDomain(data.url);current.report={...report,page:{url:data.url,title:data.title},scannedAt:new Date().toISOString()};
  $('score').textContent=report.score;$('score').className='score '+report.level;$('label').textContent='Riesgo '+report.label;$('verdict').textContent=report.verdict;$('url').textContent=data.url;
  $('details').innerHTML=report.reasons.length?report.reasons.slice(0,8).map(x=>`<div class="item">+${x.points} · ${escapeHtml(x.title)}</div>`).join(''):'<div class="item">Sin señales técnicas relevantes.</div>';
  $('domainStatus').textContent=report.domainStatus==='trusted'?'Trusted context':report.domainStatus==='blocked'?'Blocked context':'Neutral';
  $('alert').className=report.score>=60?'alert':'alert hidden';$('alert').textContent=report.score>=60?'ALERTA LOCAL · Riesgo alto. Verificá antes de continuar.':'';
  $('rankedLinks').className='links'+(report.rankedLinks.length?'':' empty');
  $('rankedLinks').innerHTML=report.rankedLinks.length?report.rankedLinks.slice(0,7).map(x=>`<div class="linkitem"><strong>${x.score}/100 · ${escapeHtml(x.domain||'URL')}</strong><small>${escapeHtml(x.url)}</small></div>`).join(''):'Sin enlaces visibles para clasificar.';
}
async function scan(){
  $('scan').disabled=true;$('scan').textContent='Analizando…';
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error('No active tab');
    const [execution]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({url:location.href,title:document.title||'',text:(document.body?.innerText||'').slice(0,7000),passwordFields:document.querySelectorAll('input[type="password"]').length,formCount:document.forms.length,forms:[...document.forms].slice(0,30).map(form=>({action:form.getAttribute('action')||'',method:form.method||'get',passwordFields:form.querySelectorAll('input[type="password"]').length})),links:[...new Set([...document.links].map(a=>a.href).filter(Boolean))].slice(0,80)})});    const data=execution.result,lists=await getLists();
    const base=Core.analyzeUrl(data.url,lists);let score=base.score,reasons=[...base.reasons];
    const message=Core.analyzeMessage((data.title+' '+data.text).slice(0,7000),'message',lists);score=Math.min(100,score+Math.min(30,message.score));reasons.push(...message.reasons.slice(0,5));
    if(data.passwordFields>0){score=Math.min(100,score+10);reasons.push({points:10,title:'Formulario con contraseña',detail:'La página contiene campos de contraseña.'});}
    const formFindings=(data.forms||[]).map(form=>Core.analyzeFormDestination(data.url,form,lists)).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
    if(formFindings.length){const top=formFindings[0];score=Math.min(100,score+Math.min(45,top.score));reasons.push(...top.reasons);}
    if(data.formCount>4){score=Math.min(100,score+5);reasons.push({points:5,title:'Múltiples formularios',detail:'La página contiene varios formularios.'});}
    const rankedLinks=Core.rankLinks(data.links,lists);const meta=Core.riskMeta(score);
    renderPage({score,...meta,reasons,domainStatus:base.domainStatus,rankedLinks,formFindings},data);
  }catch(error){$('score').textContent='—';$('score').className='score neutral';$('label').textContent='No disponible';$('verdict').textContent='Esta superficie no permite inspección de pestaña.';$('details').innerHTML='<div class="item">Las páginas internas del navegador están protegidas.</div>';}
  finally{$('scan').disabled=false;$('scan').textContent='Analizar esta pestaña';}
}
function downloadReport(){if(!current.report)return;const blob=new Blob([JSON.stringify({product:'RUMBO Guardian',version:'1.0.0',...current.report},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='rumbo-guardian-tab-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
$('scan').addEventListener('click',scan);$('trustDomainBtn').addEventListener('click',()=>setDomain('trusted'));$('blockDomainBtn').addEventListener('click',()=>setDomain('blocked'));$('neutralDomainBtn').addEventListener('click',()=>setDomain('neutral'));$('exportReportBtn').addEventListener('click',downloadReport);

