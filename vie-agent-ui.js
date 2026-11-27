/* VIE Agent UI — mode « Ordinateur » du panneau Vie. Parle uniquement au serveur local (/api/agent/*) : aucun secret ici, aucun accès direct aux fichiers.
   Toute écriture, suppression, déplacement ou commande passe par une CARTE D'APPROBATION que seul un clic de l'utilisateur peut valider ; le contenu des fichiers n'est jamais mis en historique.
   Tout texte venu du serveur (chemins, commandes, sorties) est échappé : jamais d'innerHTML sans esc(). */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const CONSENT_V=1;
let br=null,st=null,run=null,clock=0,alertMsg='';
const usd=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(n)||0);
async function api(method,sub,body){try{const r=await fetch('/api/agent/'+sub,{method,headers:{'x-vie-token':br?br.token():'',...(body!==undefined?{'content-type':'application/json'}:{})},body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'});let j=null;try{j=await r.json();}catch(e){j=null;}return{ok:r.ok&&!!j&&j.ok===true,status:r.status,j};}catch(e){return{ok:false,status:0,j:null};}}
async function refresh(){if(!br||location.protocol==='file:'||!br.token()){st=null;return null;}const r=await api('GET','status');st=r.ok?r.j:null;return st;}
const agent=()=>st&&st.agent||null;
const ready=()=>!!(agent()&&agent().enabled&&agent().state==='ready'&&st.keyConfigured);
const consented=()=>!!(agent()&&agent().consent&&agent().consent.given);
const active=()=>!!run;
// --- Panneau « agent » (bannière d'état, consentement, périmètre de partage) ---
function banner(cls,html){return`<div class="vie-banner ${cls}">${html}</div>`;}
function inactiveReason(){const a=agent();
if(location.protocol==='file:')return'Le mode Agent nécessite le serveur local Vie (le site hors ligne fonctionne sans lui).';
if(br&&br.locked&&br.locked())return'Mode Agent verrouillé : cette page n’est pas connectée à Vie. Relance <code>start-vie.cmd</code> (ou appuie sur Entrée dans la fenêtre du serveur) pour ouvrir une session sécurisée.';
if(!st)return'Statut du mode Agent indisponible (serveur injoignable ?).';
if(!a||!a.enabled||a.state==='disabled')return'Le mode Agent est désactivé sur ce serveur (<code>VIE_AGENT=off</code>).';
if(a.state==='sdk-missing')return`Le moteur de l’agent (<code>${esc(a.sdk.package)}</code> version ${esc(a.sdk.pinned)}) n’est pas installé. Dans le dossier de Vie, lance <code>${esc(a.install)}</code> (environ 300 Mo, après ton accord) puis relance <code>start-vie.cmd</code>.`;
if(!st.keyConfigured)return'Clé API absente côté serveur (<code>ANTHROPIC_API_KEY</code> dans <code>.env</code>, jamais dans le navigateur).';
return'';}
function consentHtml(){const a=agent();return`<div class="vie-consent vie-ag-consent" role="group" aria-labelledby="vie-agc-t"><h4 id="vie-agc-t" tabindex="-1">Autoriser le mode Agent « Ordinateur » ?</h4>
<p><b>${esc(a.consent.text)}</b></p>
<ul><li><b>Ce que l’agent peut faire seul</b> : lister, lire et chercher dans les dossiers que ton compte Windows peut lire (pas seulement Perso/Vie), y compris d’autres lecteurs. Les secrets (<code>.env</code>, clés SSH, jetons, profils de navigateur, identifiants) sont exclus et masqués par défaut ; ce filtre est une protection heuristique, pas une garantie.</li>
<li><b>Ce qui part vers Claude (Anthropic)</b> : ton message, ainsi que les extraits des fichiers lus et les sorties de commandes que l’agent juge utiles pour répondre. Ce qui a déjà été envoyé ne peut pas être repris ; révoquer l’accès empêche seulement les envois suivants.</li>
<li><b>Ce qui exige ton clic APPROUVER à chaque fois</b> : toute écriture, suppression, déplacement, commande (même de diagnostic), installation, opération réseau. Une approbation ne vaut que pour cette action exacte, expire vite et n’est jamais réutilisée. L’agent n’a <b>aucun droit administrateur</b> (pas d’UAC) et ne se modifie pas lui-même.</li>
<li><b>Coût</b> : facturé à l’usage sur ta clé API, selon le modèle choisi (bouton sous la zone de saisie). Plafond estimé par exécution : ${esc(usd(st.runCapUsd))}, compté dans le compteur du jour (estimation, pas une facture).</li>
<li><b>Ce que ce n’est pas</b> : pas un équivalent garanti de ChatGPT ni de Claude Code dans VS Code ; sans le serveur local, le site reste hors ligne et sans agent. L’historique de ces échanges n’est jamais enregistré.</li></ul>
<div class="inline-actions"><button type="button" class="btn primary small" data-ag="consent-accept">J’autorise</button><button type="button" class="btn secondary small" data-ag="consent-refuse">Pas maintenant</button></div></div>`;}
function scopeHtml(){const a=agent(),sc=a.scope||[];const n=sc.length;
return`<div class="vie-ag-bar"><span class="on">● Agent actif · accès aux fichiers autorisé</span><small>Dossier de travail : <code>${esc(a.workdir)}</code> · lecture de PDF : ${a.tools&&a.tools.pdftotext?'<b>pdftotext</b> trouvé':'<b>pdftotext absent</b> (Poppler à installer pour lire les PDF)'}</small></div>
<details class="vie-details"><summary>Fichiers dont des extraits ont pu être envoyés à Claude (${n})</summary>${n?`<ul class="vie-ag-scope">${sc.slice(-60).map(s=>`<li><code>${esc(s.path)}</code> <small>${s.bytes?esc(s.bytes)+' octets · ':''}${esc(s.tool)} · ${esc(new Date(s.at).toLocaleTimeString('fr-FR'))}</small></li>`).join('')}</ul>${n>60?`<p class="small-note">… et ${n-60} autre(s).</p>`:''}`:'<p class="small-note">Aucun fichier lu pour le moment dans cette session.</p>'}
<p class="small-note">Chemins et tailles seulement : jamais le contenu. Cette liste est gardée en mémoire par le serveur et disparaît à son arrêt.</p>
<div class="inline-actions"><button type="button" class="btn secondary small" data-ag="scope-clear"${n?'':' disabled'}>Effacer la liste</button><button type="button" class="btn secondary small" data-ag="consent-revoke">Révoquer l’accès aux fichiers</button></div></details>`;}
const alertHtml=()=>alertMsg?`<p class="vie-note hot vie-ag-alert" role="alert"><b>⚠</b> ${esc(alertMsg)}</p>`:'';
function panelHtml(){const why=inactiveReason();
if(why)return alertHtml()+banner('warn',`<b>Agent local inactif.</b> ${why} Le chat et le reste du site fonctionnent normalement.`)+(location.protocol==='file:'?'':` <button type="button" class="btn secondary small" data-ag="retry">Réessayer</button>${!st||consented()?' <button type="button" class="btn secondary small" data-ag="consent-revoke">Révoquer l’accès aux fichiers</button>':''}`);
if(!consented())return alertHtml()+consentHtml();
return alertHtml()+scopeHtml();}
// --- Messages de l'agent (chronologie) ---
const PEND=m=>(m.agent.items||[]).some(i=>i.kind==='approval'&&i.state==='pending');
function ingest(m,evs){const A=m.agent;for(const e of evs){A.since=Math.max(A.since||0,e.seq);
if(e.type==='tool')A.items.push({kind:'tool',e});
else if(e.type==='approval')A.items.push({kind:'approval',id:e.id,state:'pending',e});
else if(e.type==='approval_result'){const it=A.items.find(i=>i.kind==='approval'&&i.id===e.id);if(it)it.state=e.state;}
else if(e.type==='receipt'){A.items.push({kind:'receipt',e});if(e.hash){const ap=A.items.find(i=>i.kind==='approval'&&i.state==='approved'&&!i.exec&&i.e.hash===e.hash);if(ap)ap.exec=e.result;}}
else if(e.type==='text')A.last=e.text;
else if(e.type==='status')A.status=e.text;}}
const STATE_LBL={sending:'envoi de ta décision…',pending:'en attente de ta décision',approved:'approuvée — exécution non confirmée pour l’instant (seul un reçu le prouve)',denied:'refusée : rien n’a été fait',expired:'expirée : rien n’a été fait',cancelled:'annulée : rien n’a été fait'};
// Carte INCOMPLÈTE = texte reçu différent de ce que le serveur annonce (longueurs), ou carte non marquée complète : on n'approuve jamais ce qu'on ne voit pas en entier.
const incomplete=e=>e.complete!==true||(e.details||[]).some(d=>typeof d.value!=='string'||d.len!==d.value.length)||(e.command!=null&&e.command!==''&&e.commandLen!==String(e.command).length);
function approvalHtml(m,it){const e=it.e,bad=incomplete(e),pend=it.state==='pending'&&m.agent.state==='running';
const exp=Math.max(0,Math.ceil((e.expiresAt-Date.now())/1000));
const paths=(e.paths||[]).map(p=>`<li><code>${esc(p.path)}</code> <small>(${esc(p.role)})</small></li>`).join('');
const det=(e.details||[]).map(d=>`<div class="vie-ag-det"><b>${esc(d.label)}</b> <small>(${esc(d.len)} car.)</small>${d.pre?`<pre>${esc(d.value)}</pre>`:` : ${esc(d.value)}`}</div>`).join('');
const risk=(e.risks||[]).map(r=>`<li${/^(RÉSEAU|INSTALLATION|HORS)/.test(r)?' class="hot"':''}>${esc(r)}</li>`).join('');
const after=(e.afterRead||[]).length?`<p class="small-note">Demandée après lecture de : ${e.afterRead.map(p=>`<code>${esc(p)}</code>`).join(', ')}. Un fichier peut contenir des instructions trompeuses : ne valide que ce que TU veux.</p>`:'';
const foot=pend?`${e.network?`<label class="vie-switch vie-ag-ack"><input type="checkbox" data-ag="ack" data-id="${esc(e.id)}"> <span>Je confirme que cette action peut envoyer des données hors de mon PC (réseau).</span></label>`:''}<div class="inline-actions"><button type="button" class="btn primary small" data-ag="approve" data-id="${esc(e.id)}"${e.network||bad?' disabled':''}>APPROUVER</button><button type="button" class="btn secondary small" data-ag="deny" data-id="${esc(e.id)}">REFUSER</button></div>`
:`<p class="vie-state${it.state==='approved'&&it.exec==='done'?' ok':''}">${esc(cardLbl(it))}</p>`;
return`<section class="vie-ag-card ${esc(it.state)}${e.network||e.install?' hot':''}" data-cardkey="ag:${esc(e.id)}" aria-label="Demande d’approbation"><h4 tabindex="-1">Approbation requise : ${esc(e.title)}</h4>
<p class="vie-ag-tool">Outil : <b>${esc(e.tool)}</b>${pend?` · expire dans <span data-ag-exp="${esc(e.expiresAt)}">${Math.floor(exp/60)}:${String(exp%60).padStart(2,'0')}</span>`:''} · empreinte <code>${esc(String(e.hash).slice(0,12))}</code></p>
${bad?'<p class="vie-note hot" role="alert"><b>⚠ Carte incomplète ou altérée</b> : le texte reçu ne correspond pas à ce que le serveur annonce. APPROUVER est désactivé : refuse cette demande.</p>':''}${paths?`<ul class="vie-ag-paths">${paths}</ul>`:''}${e.command?`<div class="vie-ag-det"><b>Commande exacte</b><pre>${esc(e.command)}</pre></div>`:''}${det}
<ul class="vie-ag-risks">${risk}</ul><p class="vie-cons"><b>Retour arrière :</b> ${esc(e.rollback)}</p>${after}${foot}</section>`;}
const EXEC_LBL={done:'approuvée et exécutée — le reçu ci-dessous fait foi',failed:'approuvée mais en échec — voir le reçu',unconfirmed:'approuvée — résultat non confirmé : vérifie manuellement',interrupted:'approuvée puis INTERROMPUE : la commande a été arrêtée (effets partiels possibles) — voir le reçu',cancelled:'approuvée mais NON exécutée : consentement révoqué ou exécution interrompue',refused:'approuvée mais NON exécutée : refusée au moment d’agir',expired:'approuvée mais NON exécutée'};
const cardLbl=it=>it.state==='approved'&&it.exec?(EXEC_LBL[it.exec]||'approuvée — voir le reçu'):(STATE_LBL[it.state]||it.state);
const RES_LBL={done:'✓ Fait',failed:'✗ Échec',denied:'Refusé par toi',expired:'Expirée',cancelled:'Annulée',refused:'Refusé par la politique',unconfirmed:'? Non confirmé',interrupted:'⏹ Interrompue'};
function receiptHtml(it){const e=it.e;const lbl=RES_LBL[e.result]||esc(e.result);
return`<div class="vie-ag-receipt ${e.ok?'ok':'bad'}"><b>Reçu</b> · ${esc(e.operation)} · <span class="vie-ag-res">${esc(lbl)}</span>${(e.paths||[]).length?` · ${e.paths.map(p=>`<code>${esc(p.path)}</code>`).join(' → ')}`:''}${e.command?` · <code>${esc(e.command)}</code>`:''}<br><small>${esc(e.detail||'')}${e.sha256?` · sha256 ${esc(e.sha256.slice(0,16))}…`:''}${e.backup?` · sauvegarde : <code>${esc(e.backup)}</code>`:''}</small>${e.output?`<pre>${esc(e.output)}</pre>`:''}</div>`;}
function toolHtml(it){const e=it.e;const p=(e.paths||[])[0];return`<li class="${e.ok?'':'bad'}">${e.ok?'🔎':'✗'} <b>${esc(e.tool)}</b>${p?` <code>${esc(p.path)}</code>`:''}${(e.shared||[]).length?` <small>· ${e.shared.length} extrait(s) envoyé(s) à Claude</small>`:''}${e.note?` <small>· ${esc(e.note)}</small>`:''}</li>`;}
const STATE_HEAD={starting:'Démarrage…',running:'L’agent travaille…',done:'Terminé',error:'Arrêté sur une erreur',cancelled:'Annulé'};
function msgHtml(m,h){const A=m.agent;const items=A.items||[];
const tools=items.filter(i=>i.kind==='tool');
const flow=[];let batch=[];const flush=()=>{if(batch.length){flow.push(`<ul class="vie-ag-tools" aria-label="Fichiers consultés">${batch.map(toolHtml).join('')}</ul>`);batch=[];}};
for(const it of items){if(it.kind==='tool')batch.push(it);else{flush();flow.push(it.kind==='approval'?approvalHtml(m,it):receiptHtml(it));}}flush();
const live=A.state==='running'||A.state==='starting';
const head=`<div class="vie-ag-head"><span aria-hidden="true">🖥</span> Mode Agent · <b>${esc(STATE_HEAD[A.state]||A.state)}</b>${live&&!PEND(m)?` <span class="vie-dots" aria-hidden="true"><i></i><i></i><i></i></span>`:''}${tools.length?` <small>· ${tools.length} consultation(s)</small>`:''}</div>`;
const body=m.content?`<div class="vie-bubble">${h.fmt(m.content)}</div>`:(live&&A.last?`<p class="small-note vie-ag-last">${esc(A.last.slice(0,300))}</p>`:'');
const nt=[A.note,m.note].filter(Boolean).join(' ');const note=nt?`<p class="vie-note">${esc(nt)}</p>`:'';
const meta=A.meta?`<div class="vie-msgmeta">Mode Agent · ${esc(A.meta.label||'')} · ${esc(A.meta.model||'')} · difficulté ${esc(A.meta.effort||'')}${A.meta.usd!=null?` · ≈ ${esc(usd(A.meta.usd))} (${A.meta.estimated?'plafond estimé, coût non rapporté':'estimation'})`:''}<br>Fichiers dont des extraits ont pu être envoyés à Claude : ${tools.reduce((n,i)=>n+((i.e.shared||[]).length),0)} · rien de cet échange n’est enregistré dans l’historique.</div>`:'';
return`<div class="vie-msg bot agent"><div class="vie-ag-wrap">${head}${flow.join('')}${body}${note}${h.cards(m)}${meta}</div></div>`;}
function emptyHtml(prefsShare){return`<div class="vie-empty"><p><b>Mode Agent « Ordinateur ».</b> Je peux explorer tes fichiers (cours, exercices, sources), lancer des diagnostics et te <b>proposer</b> des évolutions de ton tableau de bord. Toute écriture ou commande attendra ton clic <b>APPROUVER</b>.</p><p class="small-note">${prefsShare?'Partage des données Vie : activé (je vois tes fiches).':'Partage des données Vie : désactivé (active-le dans ⚙ pour que je croise tes cours avec tes objectifs).'}</p><div class="vie-suggest">${['Analyse mes cours et adapte mes objectifs','Retrouve mes exercices sur le tri et résume-les','Liste mes dossiers de cours et dis-moi ce qui manque','Fais un diagnostic Git du dossier de travail'].map(s=>`<button type="button" class="chip" data-vie="suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;}
// --- Exécution : démarrage, suivi par interrogation régulière, décisions ---
function stop(){if(run){clearTimeout(run.timer);run=null;}}
const ERR={agent_consent_required:'Le consentement du mode Agent est requis (voir la carte en haut du panneau).',sdk_missing:null,agent_busy:'Une exécution de l’agent est déjà en cours.'};
async function start(body,m){
const r=await api('POST','run',body);
if(!r.ok){stop();const code=r.j&&r.j.error;if(code==='agent_consent_required'||code==='sdk_missing')await refresh();br.fail(m,(r.j&&r.j.message)||ERR[code]||`Échec du démarrage de l’agent (HTTP ${r.status}).`);return;}
run={runId:r.j.runId,m,timer:0,errors:0};m.agent.state='running';m.agent.runCapUsd=r.j.runCapUsd;if(r.j.budget)br.budget(r.j.budget);br.render();poll();}
async function poll(){if(!run)return;const cur=run;const m=cur.m;
const r=await api('GET',`events?run=${encodeURIComponent(cur.runId)}&since=${m.agent.since||0}`);
if(run!==cur)return;
if(!r.ok){cur.errors++;if(cur.errors>5||r.status===404||r.status===403){stop();m.agent.state='error';br.fail(m,'Le suivi de l’agent a été perdu (serveur arrêté ou session expirée). Les actions déjà approuvées ont pu s’exécuter : vérifie les reçus.');return;}cur.timer=setTimeout(poll,1200);return;}
cur.errors=0;const before=m.agent.items.length;ingest(m,r.j.events||[]);
const newAp=m.agent.items.slice(before).find(i=>i.kind==='approval');
const done=(r.j.events||[]).find(e=>e.type==='done');
if(done){stop();m.agent.state=done.state;br.finish(m,done);return;}
if((r.j.events||[]).length)br.render(newAp?`ag:${newAp.e.id}`:undefined);
cur.timer=setTimeout(poll,PEND(m)?500:700);}
async function decide(id,allow,ack){if(!run)return;const m=run.m;const it=m.agent.items.find(i=>i.kind==='approval'&&i.id===id);if(!it||it.state!=='pending')return;
if(allow&&incomplete(it.e)){br.toast('Carte incomplète : approbation impossible. Refuse cette demande.');return;}
const body={runId:run.runId,id,nonce:it.e.nonce,hash:it.e.hash,allow};if(allow&&it.e.network)body.ackNetwork=ack===true;
it.state='sending';br.render();
const r=await api('POST','decision',body);
// L'état définitif (approuvée / refusée / expirée / annulée) vient du serveur par le prochain suivi ; ici on ne revient qu'à « en attente » ou « expirée » en cas d'échec.
if(r.ok)it.state=allow?'approved':'denied';
else{it.state=r.j&&(r.j.error==='expired'||r.j.error==='already_decided'||r.j.error==='run_finished')?'expired':'pending';br.toast((r.j&&r.j.message)||'Décision non enregistrée.');}
br.render();}
const failMsg=r=>(r.j&&r.j.message)||(r.status===0?'serveur injoignable':'HTTP '+r.status);
async function cancel(){if(!run)return;const r=await api('POST','cancel',{runId:run.runId});if(r.ok){alertMsg='';return;}
alertMsg='Annulation NON confirmée par le serveur ('+failMsg(r)+') : l’agent peut encore travailler. Réessaie ; sinon révoque l’accès aux fichiers.';br.toast(alertMsg);br.renderAll();}
function tick(){const now=Date.now();document.querySelectorAll('[data-ag-exp]').forEach(el=>{const s=Math.max(0,Math.ceil((Number(el.dataset.agExp)-now)/1000));el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');});}
// Onglet resté ouvert pendant qu'un autre révoquait / que le serveur redémarrait : l'état affiché est re-lu au retour sur l'onglet (au plus une fois par seconde, et sans redessiner le panneau si rien n'a changé : un clic en cours ne doit pas tomber à côté).
let lastSync=0;async function resync(){const t=Date.now();if(t-lastSync<1000||!br)return;lastSync=t;try{const sig=()=>{const a=agent();return JSON.stringify(st?[!!st.keyConfigured,a&&a.enabled,a&&a.state,a&&a.consent&&a.consent.given,a&&a.unsafe,a&&a.running]:null);};const before=sig();await refresh();if(sig()!==before)br.renderAll();}catch(e){/* hors ligne : l'état « inactif » reste affiché */}}
function attach(bridge){br=bridge;if(!clock)clock=setInterval(tick,1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resync();});window.addEventListener('focus',resync);
br.panel.addEventListener('change',e=>{const t=e.target;if(t&&t.dataset&&t.dataset.ag==='ack'){const b=br.panel.querySelector(`[data-ag="approve"][data-id="${CSS.escape(t.dataset.id)}"]`);if(b)b.disabled=!t.checked;}});
br.panel.addEventListener('click',async e=>{const b=e.target.closest('[data-ag]');if(!b||b.tagName==='INPUT')return;const a=b.dataset.ag;
if(a==='approve'){const box=br.panel.querySelector(`[data-ag="ack"][data-id="${CSS.escape(b.dataset.id)}"]`);decide(b.dataset.id,true,box?box.checked:false);}
else if(a==='deny')decide(b.dataset.id,false);
else if(a==='consent-accept'){const r=await api('POST','consent',{accept:true,v:CONSENT_V});if(!r.ok)br.toast((r.j&&r.j.message)||'Consentement non enregistré.');else alertMsg='';await refresh();br.renderAll();}
else if(a==='consent-refuse'){br.setMode('chat');}
else if(a==='consent-revoke'){if(!confirm('Révoquer l’accès aux fichiers ? Toute exécution en cours sera interrompue. Ce qui a déjà été envoyé à Claude ne peut pas être repris.'))return;const r=await api('POST','consent',{accept:false});await refresh();
if(r.ok&&!consented())alertMsg='';else{alertMsg='Révocation NON enregistrée ('+failMsg(r)+') : l’accès aux fichiers reste actif et l’agent peut continuer. Réessaie ; en dernier recours, arrête le serveur Vie (Ctrl+C dans sa fenêtre).';br.toast(alertMsg);}
br.renderAll();}
else if(a==='scope-clear'){await api('POST','scope/clear',{});await refresh();br.renderAll();}
else if(a==='retry'){await refresh();br.renderAll();}});}
window.VieAgentUI=Object.freeze({attach,refresh,ready,consented,active,start,cancel,stop,panelHtml,msgHtml,emptyHtml,inactiveReason,status:()=>st,CONSENT_V});
})();
