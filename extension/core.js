(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.RumboGuardianCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const suspiciousTlds=new Set(['zip','mov','top','xyz','click','loan','work','gq','tk','cf','ml','ga']);
  const shorteners=new Set(['bit.ly','tinyurl.com','t.co','is.gd','cutt.ly','rb.gy','rebrand.ly','shorturl.at']);
  const brandDomains=['openai.com','google.com','microsoft.com','whatsapp.com','meta.com','netflix.com','mercadopago.com','correoargentino.com.ar','arca.gob.ar','afip.gob.ar'];
  const urgency=[/urgente/i,/últim[oa] aviso/i,/suspendid[ao]/i,/bloquead[ao]/i,/ahora mismo/i,/inmediatamente/i,/24 horas/i,/vence hoy/i];
  const credential=[/contraseña/i,/password/i,/código de verificación/i,/\botp\b/i,/inici[áa] sesi[oó]n/i,/verific[aá] tu cuenta/i,/credencial/i];
  const money=[/transfer/i,/pago/i,/factura/i,/premio/i,/ganaste/i,/cripto/i,/bitcoin/i,/wallet/i,/tarjeta/i,/reembolso/i,/mercado ?pago/i];
  const impersonation=[/banco/i,/correo argentino/i,/afip/i,/arca/i,/netflix/i,/whatsapp/i,/meta/i,/google/i,/microsoft/i,/soporte técnico/i];
  const clamp=n=>Math.max(0,Math.min(100,n));
  const unique=a=>[...new Set(a)];

  function normalizeDomain(value){
    if(!value) return '';
    let raw=String(value).trim().toLowerCase();
    try{
      if(!/^https?:\/\//i.test(raw)) raw='https://'+raw;
      return new URL(raw).hostname.replace(/^www\./,'');
    }catch{
      return String(value).trim().toLowerCase().replace(/^www\./,'').replace(/^\.+|\.+$/g,'');
    }
  }
  function normalizedLists(lists={}){
    return {
      trusted:unique((lists.trusted||[]).map(normalizeDomain).filter(Boolean)),
      blocked:unique((lists.blocked||[]).map(normalizeDomain).filter(Boolean))
    };
  }  function domainMatches(domain,candidate){
    return domain===candidate || domain.endsWith('.'+candidate);
  }
  function classifyDomain(domain,lists={}){
    const d=normalizeDomain(domain), n=normalizedLists(lists);
    if(n.blocked.some(x=>domainMatches(d,x))) return 'blocked';
    if(n.trusted.some(x=>domainMatches(d,x))) return 'trusted';
    return 'neutral';
  }
  function urlsIn(text){
    const found=String(text||'').match(/\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi)||[];
    return unique(found.map(x=>x.replace(/[),.;!?]+$/,'')));
  }
  function add(reasons,points,title,detail,code){reasons.push({points,title,detail,code});}
  function hitCount(text,patterns){return patterns.filter(r=>r.test(text)).length;}
  function riskMeta(score){
    if(score>=60) return {level:'danger',label:'Alto',verdict:'Se detectaron múltiples señales que requieren intervención.',guide:'No continúes con acciones sensibles hasta verificar el origen por un canal independiente.'};
    if(score>=30) return {level:'caution',label:'Medio',verdict:'Se detectaron señales que justifican una verificación adicional.',guide:'Validá identidad, dominio y contexto antes de compartir datos o ejecutar acciones.'};
    return {level:'safe',label:'Bajo',verdict:'No se detectaron señales fuertes con las reglas locales actuales.',guide:'Mantené la verificación contextual para acciones sensibles.'};
  }
  function analyzeUrl(raw,lists={}){
    let value=String(raw||'').trim();
    if(/^www\./i.test(value)) value='https://'+value;
    const reasons=[]; let score=0,url;
    try{url=new URL(value);}catch{return {score:0,level:'neutral',label:'No válida',domain:'',domainStatus:'neutral',url:value,reasons:[{points:0,title:'URL no válida',detail:'No se pudo interpretar el enlace.',code:'invalid_url'}]};}
    const host=url.hostname.toLowerCase(), domain=normalizeDomain(host), parts=host.split('.'), tld=parts.at(-1)||'';
    const domainStatus=classifyDomain(domain,lists);
    const shadowedBrand=brandDomains.find(canonical=>host.includes(canonical+'.')&&!domainMatches(host,canonical));
    if(url.protocol==='http:'){score+=12;add(reasons,12,'Conexión sin HTTPS','La URL usa HTTP sin cifrado.','http');}
    if(shadowedBrand){score+=22;add(reasons,22,'Dominio de marca usado como señuelo',shadowedBrand+' aparece dentro de otro host; el dominio real es '+host+'.','brand_shadow');}
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(host)){score+=28;add(reasons,28,'Dirección IP directa','Puede ocultar la identidad real del sitio.','ip_host');}
    if(host.includes('xn--')){score+=18;add(reasons,18,'Dominio codificado','Puede usarse para imitar visualmente otro dominio.','punycode');}    if(suspiciousTlds.has(tld)){score+=14;add(reasons,14,'Extensión de dominio sensible','Requiere verificación adicional.','sensitive_tld');}
    if(shorteners.has(host)){score+=18;add(reasons,18,'Enlace acortado','Oculta el destino final antes de abrirlo.','shortener');}
    if(parts.length>4){score+=10;add(reasons,10,'Muchos subdominios','Puede intentar aparentar pertenecer a otra organización.','many_subdomains');}
    if(url.username||url.password){score+=30;add(reasons,30,'Credenciales embebidas','La URL contiene credenciales antes del host.','embedded_credentials');}
    if(url.username&&(/[.]/.test(url.username)||brandDomains.some(canonical=>decodeURIComponent(url.username).toLowerCase().includes(canonical)))){score+=18;add(reasons,18,'Confusión de autoridad en URL','El texto antes de @ puede parecer un dominio, pero el host real es '+host+'.','authority_confusion');}
    if(value.length>180){score+=8;add(reasons,8,'URL inusualmente larga','La longitud dificulta la inspección visual.','long_url');}
    if(/login|verify|account|secure|update|password|payment|wallet|unlock|support/i.test(url.pathname+url.search)){score+=12;add(reasons,12,'Ruta sensible','Contiene términos asociados con acceso, verificación o pagos.','sensitive_path');}
    if(url.port&&!['80','443'].includes(url.port)){score+=8;add(reasons,8,'Puerto no habitual','Utiliza un puerto diferente de los estándares web.','unusual_port');}
    if(domainStatus==='blocked'){score=Math.max(score,95);add(reasons,40,'Dominio bloqueado localmente','Está en la lista de bloqueo definida por el operador.','local_block');}
    if(domainStatus==='trusted'){add(reasons,0,'Dominio reconocido localmente','Está en la lista de confianza, sin anular otras señales técnicas.','local_trust');}
    score=clamp(score);
    return {score,...riskMeta(score),domain,domainStatus,url:value,reasons};
  }
  function analyzeMessage(text,kind='auto',lists={}){
    const value=String(text||''), links=urlsIn(value), reasons=[]; let score=0;
    const messageMode=kind==='message'||(kind==='auto'&&!(links.length===1&&value.trim()===links[0]));
    if(messageMode){
      const u=hitCount(value,urgency),c=hitCount(value,credential),m=hitCount(value,money),i=hitCount(value,impersonation);
      if(u){const p=Math.min(18,u*7);score+=p;add(reasons,p,'Urgencia o presión','El mensaje intenta acelerar una decisión.','urgency');}
      if(c){const p=Math.min(24,c*9);score+=p;add(reasons,p,'Solicitud relacionada con acceso','Menciona credenciales, códigos o verificación.','credentials');}
      if(m){const p=Math.min(20,m*6);score+=p;add(reasons,p,'Dinero o medios de pago','Menciona pagos, transferencias, premios o activos.','money');}
      if(i&&(u||c||m||links.length)){score+=10;add(reasons,10,'Posible suplantación','Menciona una organización junto con otras señales.','impersonation');}
      if(/[A-ZÁÉÍÓÚÑ]{8,}/.test(value)){score+=5;add(reasons,5,'Uso intensivo de mayúsculas','Puede ser una técnica de presión.','caps');}
      if((value.match(/!/g)||[]).length>=3){score+=4;add(reasons,4,'Exceso de exclamaciones','Señal débil de presión emocional.','exclamations');}
    }
    const linkResults=links.map(link=>analyzeUrl(link,lists));
    for(const item of linkResults){score+=item.score;reasons.push(...item.reasons.map(r=>({...r,title:`${r.title} · ${item.domain||'URL'}`})));}
    if(links.length>=3){score+=7;add(reasons,7,'Múltiples enlaces','Varios destinos aumentan la superficie de riesgo.','multiple_links');}
    score=clamp(score);
    if(!value.trim()) return {score:0,level:'neutral',label:'Sin datos',verdict:'No hay contenido para analizar.',guide:'Ingresá un mensaje o URL.',reasons:[],links:[],linkResults:[],text:value,kind};
    return {score,...riskMeta(score),reasons,links,linkResults,text:value,kind};  }
  function rankLinks(links,lists={}){
    return unique((links||[]).filter(Boolean)).map(x=>analyzeUrl(x,lists)).sort((a,b)=>b.score-a.score||a.domain.localeCompare(b.domain));
  }
  return {normalizeDomain,classifyDomain,urlsIn,analyzeUrl,analyzeMessage,rankLinks,riskMeta};
});