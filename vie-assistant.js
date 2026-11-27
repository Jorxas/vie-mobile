/* VIE Assistant — panneau de chat « Vie ». Parle uniquement au serveur local (/api/chat), jamais à Anthropic directement ; aucun secret ici.
   Règle d'or : Vie PROPOSE, l'utilisateur CONFIRME. Toute écriture passe par window.VieHost.mutate (commit V1 : validation, transaction vérifiée, mode récupération/incertain). */
(()=>{'use strict';
const C=window.VieCore,A=window.VieActions,H=window.VieHost;
const AG=window.VieAgentUI||null;// mode Agent « Ordinateur » (facultatif : sans lui, le panneau reste un simple chat)
const $=s=>document.querySelector(s);
const launcher=$('#vie-launch');
if(!C||!A||!H){if(launcher){launcher.disabled=true;launcher.title='Assistant indisponible (scripts non chargés)';}return;}
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
// --- Stockage local (hors vie-personal-v1) : préférences, conversation à durée limitée, journal des actions approuvées. Aucun identifiant ni clé. ---
const KP='vie-assistant-prefs-v1',KC='vie-assistant-chat-v1',KA='vie-assistant-audit-v1';
const DAY=864e5,TTL_CHAT=7*DAY,TTL_AUDIT=30*DAY,MAX_CHAT=40,MAX_AUDIT=50,MAX_SEND=12,MAX_INPUT=2000;
const ls=()=>{try{return window.localStorage;}catch(e){return null;}};
const rd=k=>{try{const s=ls(),raw=s&&s.getItem(k);return raw?JSON.parse(raw):null;}catch(e){return null;}};
const wr=(k,v)=>{try{const s=ls();if(!s)return false;s.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}};
const rm=k=>{try{const s=ls();if(s)s.removeItem(k);}catch(e){/* silencieux : historique non critique */}};
// --- Catalogue des modèles : le SERVEUR en est l'autorité (/api/health -> catalog) et revalide chaque requête. Cette copie n'est qu'un affichage de secours quand le serveur est injoignable
// (le pill reste visible, mais rien ne peut être envoyé) ; test_vie_browser.cjs vérifie qu'elle est identique à celle du serveur. Aucun identifiant n'est inventé ici.
const FALLBACK_CATALOG={default:{model:'claude-haiku-5-5',effort:'medium'},models:[
{id:'claude-haiku-5-5',name:'Haiku 5.5',description:'Questions courtes, le moins cher',costTier:1,costLabel:'Économique',efforts:['low','medium','high','xhigh']},
{id:'claude-sonnet-5-5',name:'Sonnet 5.5',description:'Bon compromis qualité / coût',costTier:2,costLabel:'Intermédiaire',efforts:['low','medium','high','xhigh']},
{id:'claude-opus-5-5',name:'Opus 5.5',description:'Raisonnement le plus poussé, le plus coûteux',costTier:3,costLabel:'Élevé',efforts:['low','medium','high','xhigh']}],
efforts:[{id:'low',label:'Faible'},{id:'medium',label:'Moyen'},{id:'high',label:'Élevé'},{id:'xhigh',label:'Très élevé'}]};
// Le catalogue reçu est retraité champ par champ (types, longueurs, valeurs) avant tout affichage ; toute anomalie -> null -> catalogue de secours.
function cleanCatalog(raw){try{if(!raw||typeof raw!=='object'||!Array.isArray(raw.models)||!Array.isArray(raw.efforts)||!raw.default)return null;
const str=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n;
const efforts=raw.efforts.map(e=>e&&str(e.id,12)&&/^[a-z]+$/.test(e.id)&&str(e.label,30)?{id:e.id,label:e.label}:null);if(!efforts.length||efforts.length>8||efforts.some(e=>!e))return null;
const known=new Set(efforts.map(e=>e.id));
const models=raw.models.map(m=>m&&str(m.id,60)&&/^claude-[a-z0-9-]+$/.test(m.id)&&str(m.name,40)&&str(m.description,120)&&Number.isInteger(m.costTier)&&m.costTier>=1&&m.costTier<=3&&str(m.costLabel,30)&&Array.isArray(m.efforts)&&m.efforts.length>0&&m.efforts.every(e=>known.has(e))?{id:m.id,name:m.name,description:m.description,costTier:m.costTier,costLabel:m.costLabel,efforts:m.efforts.slice()}:null);
if(!models.length||models.length>12||models.some(m=>!m)||new Set(models.map(m=>m.id)).size!==models.length)return null;
const dm=models.find(m=>m.id===raw.default.model);if(!dm||!dm.efforts.includes(raw.default.effort))return null;
return{default:{model:dm.id,effort:raw.default.effort},models,efforts};}catch(e){return null;}}
// Anciens niveaux (avant le sélecteur de la zone de saisie) -> choix équivalent : le modèle et l'effort mémorisés restent ceux que l'utilisateur utilisait (« rapide » était le défaut).
const LEGACY_MODES={rapide:['default','medium'],equilibre:['claude-sonnet-5-5','medium'],approfondi:['claude-sonnet-5-5','high'],expert:['claude-opus-5-5','high']};
const nid=()=>'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// Version du texte de consentement : un consentement donné sur un texte antérieur (inexact : il annonçait les notes exclues alors que celles des idées partaient) n'est pas reconduit.
const CONSENT_V=2;let legacyConsent=false;
// model : « default » (défaut recommandé du serveur, résolu côté serveur) ou un identifiant du catalogue ; effort : un niveau du catalogue. Rien d'autre n'est mémorisé à ce sujet (aucun secret).
let devMode=(()=>{try{return sessionStorage.getItem('vie-dev')==='1';}catch(e){return false;}})();
// Le basculement du panneau n'est qu'une PRÉFÉRENCE d'affichage : il ne compte que si le serveur a lui-même activé le mode structure (VIE_DEV=on au démarrage). Il n'autorise aucune écriture.
const devOn=()=>devMode&&srv.dev===true;
let prefs={v:2,model:'default',effort:FALLBACK_CATALOG.default.effort,share:false,consent:false,consentV:0,consentAt:'',migrationDismissed:false};
{const p=rd(KP);if(p&&typeof p==='object'){const FM=FALLBACK_CATALOG.models,FE=FALLBACK_CATALOG.efforts;
let m=null,e=null;if(p.v===2||p.mode==='custom'){m=p.model;e=p.effort;}else if(Object.prototype.hasOwnProperty.call(LEGACY_MODES,p.mode)){[m,e]=LEGACY_MODES[p.mode];}
if(m==='default'||FM.some(x=>x.id===m))prefs.model=m;if(FE.some(x=>x.id===e))prefs.effort=e;legacyConsent=p.consent===true&&p.consentV!==CONSENT_V;prefs.consent=p.consent===true&&p.consentV===CONSENT_V;prefs.consentV=prefs.consent?CONSENT_V:0;prefs.share=prefs.consent&&p.share===true;prefs.consentAt=prefs.consent&&typeof p.consentAt==='string'?p.consentAt.slice(0,40):'';prefs.migrationDismissed=p.migrationDismissed===true;}}
const savePrefs=()=>wr(KP,prefs);
let chat=[],audit=[];
{const c=rd(KC),t=Date.now();if(c&&Array.isArray(c.messages)&&t-Number(c.savedAt)<TTL_CHAT)chat=c.messages.filter(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'&&t-Number(m.ts)<TTL_CHAT).slice(-MAX_CHAT).map(m=>({id:nid(),role:m.role,content:m.content.slice(0,8000),ts:Number(m.ts)||t,kind:m.kind==='error'?'error':undefined,meta:m.meta&&typeof m.meta==='object'?m.meta:undefined}));else if(c)rm(KC);
const a=rd(KA);if(Array.isArray(a))audit=a.filter(e=>e&&typeof e.id==='string'&&Array.isArray(e.ops)&&t-Number(e.ts)<TTL_AUDIT).slice(0,MAX_AUDIT);}
const saveChat=()=>{const keep=chat.filter(m=>!m.agent).slice(-MAX_CHAT).map(m=>({role:m.role,content:m.content,ts:m.ts,kind:m.kind,meta:m.meta}));if(!keep.length)rm(KC);else wr(KC,{v:1,savedAt:Date.now(),messages:keep});};
const saveAudit=()=>{audit=audit.slice(0,MAX_AUDIT);return audit.length?wr(KA,audit):(rm(KA),true);};
// --- État de l'interface ---
let agentMode=false;// jamais mémorisé : on rouvre toujours en mode Chat ; le consentement de l'agent vit côté serveur (mémoire)
let cancelled=false;let bootInfo=null;let srv={state:'checking',token:'',catalog:null,budget:null,prices:null};let open=false,busy=false,applying=false,ctl=null,consentPending=false,settingsOpen=false,healthTimer=0,menuOpen=false;
const today=()=>C.iso(new Date());
const usd=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(n)||0);
// --- Choix du modèle et de l'effort (pill + menu de la zone de saisie) ---
const catalog=()=>srv.catalog||FALLBACK_CATALOG;
const modelEntry=id=>catalog().models.find(m=>m.id===id)||null;
const defaultEntry=()=>modelEntry(catalog().default.model);
const chosenEntry=()=>prefs.model==='default'?defaultEntry():(modelEntry(prefs.model)||defaultEntry());
const effortLabel=id=>(catalog().efforts.find(e=>e.id===id)||{label:String(id)}).label;
// Remet le choix mémorisé en accord avec le catalogue en vigueur (modèle retiré -> défaut ; effort non pris en charge par ce modèle -> effort du défaut). Le pill montre donc toujours ce qui partira réellement.
function reconcilePrefs(){const c=catalog();let ch=false;if(prefs.model!=='default'&&!modelEntry(prefs.model)){prefs.model='default';ch=true;}
const m=chosenEntry();if(!m.efforts.includes(prefs.effort)){prefs.effort=m.efforts.includes(c.default.effort)?c.default.effort:m.efforts[0];ch=true;}
if(ch)savePrefs();return ch;}
// Ce qui part réellement vers Anthropic. Le texte est GÉNÉRÉ depuis A.shareNotice() (libellés par champ déclarés dans vie-actions.js à côté du schéma d'envoi) ; test_vie_actions.cjs vérifie que ces libellés couvrent exactement les champs envoyés.
const SHARE_NOTICE=(()=>{const n=A.shareNotice();return`<div class="vie-notice"><p><b>Ce qui est envoyé à Anthropic</b>, via le serveur local, <b>à chaque message</b> :</p><ul><li><b>Toujours, même partage coupé</b> : le texte de ton message, l’historique récent de la conversation (jusqu’à ${MAX_SEND} messages : tes messages précédents et les réponses de Vie), la date du jour et la rubrique ouverte. Ne tape rien de secret dans le chat.</li><li><b>Si le partage est actif</b>, en plus, une sélection de champs de tes fiches choisie d’après les mots de ta question (une question générale n’envoie que les compteurs) :<ul>${n.items.map(x=>`<li><b>${esc(x.title)}</b> : ${esc(x.text)}.</li>`).join('')}</ul></li></ul><p><b>Jamais envoyés</b> : ${n.never.map(esc).join(' ; ')}.</p><p><b>Mais</b> tout texte que tu as saisi à la main dans les champs envoyés (intitulés, libellés, prochaine action, objectif, titres de cours…) part tel quel, tronqué à 160 caractères en général : n’y écris rien que tu ne veuilles pas transmettre. Sous chaque réponse, Vie affiche les rubriques réellement envoyées. Si tu désactives le partage, les demandes suivantes ne contiennent plus aucune fiche et les réponses précédentes qui s’appuyaient sur tes fiches ne sont plus renvoyées dans l’historique ; tes propres messages, eux, y restent. Ce qu’Anthropic a déjà reçu reste soumis à ses conditions d’utilisation de l’API (à consulter sur anthropic.com).</p></div>`;})();
// --- Structure du panneau ---
const panel=document.createElement('aside');panel.id='vie-panel';panel.className='vie-panel';panel.setAttribute('role','complementary');panel.setAttribute('aria-label','Assistant Vie');panel.inert=true;
panel.innerHTML=`<header class="vie-head"><div class="vie-title"><span class="vie-logo" aria-hidden="true">✦</span><div><strong>Vie</strong><small>Copilote · propose, tu confirmes</small></div></div><div class="vie-head-actions"><button type="button" class="vie-icon" data-vie="toggle-settings" aria-expanded="false" aria-controls="vie-settings" title="Partage des données, journal, confidentialité">⚙<span class="sr-only">Réglages de Vie</span></button><button type="button" class="vie-icon" data-vie="clear" title="Effacer la conversation">⌫<span class="sr-only">Effacer la conversation</span></button><button type="button" class="vie-icon" data-vie="close" title="Replier (Échap)">×<span class="sr-only">Fermer Vie</span></button></div></header>
<div id="vie-modes" class="vie-modes" role="group" aria-label="Mode de Vie"></div>
<div id="vie-status" class="vie-status" role="status"></div>
<section id="vie-agent" class="vie-agent" aria-label="Mode Agent" hidden></section>
<section id="vie-settings" class="vie-settings" aria-label="Réglages de Vie" hidden></section>
<div id="vie-log" class="vie-log" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation avec Vie" tabindex="0"></div>
<footer class="vie-foot"><div id="vie-meta" class="vie-meta"></div><form id="vie-form" autocomplete="off"><label for="vie-input" class="sr-only">Message pour Vie</label><textarea id="vie-input" rows="2" maxlength="${MAX_INPUT}" placeholder="Demande à Vie… (Entrée pour envoyer)"></textarea><div class="vie-compose"><div class="vie-model" id="vie-model"><button type="button" class="vie-pill" id="vie-pill" aria-haspopup="menu" aria-expanded="false" aria-controls="vie-menu"></button><div class="vie-pop" id="vie-pop" hidden></div></div><span id="vie-count" class="vie-count" aria-hidden="true"></span><button type="button" class="btn secondary small" data-vie="cancel" hidden>Annuler</button><button type="submit" class="btn primary small" id="vie-send">Envoyer</button></div></form></footer>`;
document.body.appendChild(panel);
const elLog=$('#vie-log'),elStatus=$('#vie-status'),elSet=$('#vie-settings'),elMeta=$('#vie-meta'),elInput=$('#vie-input'),elSend=$('#vie-send'),elCancel=panel.querySelector('[data-vie="cancel"]'),elCount=$('#vie-count'),elPill=$('#vie-pill'),elPop=$('#vie-pop'),elModel=$('#vie-model'),elModes=$('#vie-modes'),elAgent=$('#vie-agent');
// --- Texte : échappé d'abord, puis mise en forme minimale (gras, code, listes) ---
const inline=s=>s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
function fmtText(t){let out='',list=false;for(const raw of esc(t).split('\n')){const li=/^\s*[-*•]\s+(.*)$/.exec(raw);if(li){if(!list){out+='<ul>';list=true;}out+=`<li>${inline(li[1])}</li>`;}else{if(list){out+='</ul>';list=false;}if(raw.trim())out+=`<p>${inline(raw)}</p>`;}}if(list)out+='</ul>';return out||'<p></p>';}
// --- Statut / bannières ---
function banner(cls,html,extra=''){return`<div class="vie-banner ${cls}">${html}${extra}</div>`;}
function renderStatus(){const st=H.status(),out=[];
if(srv.state==='file')out.push(banner('warn','<b>Vie nécessite le serveur local.</b> Le site fonctionne normalement sans l’assistant. Pour l’activer : dans un terminal, lance <code>node vie-server.cjs</code> puis ouvre <b>http://127.0.0.1:3765/</b>. Attention : cette adresse a son propre stockage (voir « Migration » dans ⚙).'));
else if(srv.state==='down')out.push(banner('warn','<b>Serveur Vie injoignable.</b> Lance <code>node vie-server.cjs</code> dans le dossier du projet et ouvre http://127.0.0.1:3765/. Le reste du site continue de fonctionner.',' <button type="button" class="btn secondary small" data-vie="retry-health">Réessayer</button>'));
else if(srv.state==='locked')out.push(banner('warn',(srv.boot&&srv.boot.attempted?'<b>Lien de connexion refusé (expiré ou déjà utilisé).</b> ':'<b>Assistant verrouillé : cette page n’est pas connectée à Vie.</b> ')+'Le site fonctionne, mais le chat, le mode Agent « Ordinateur » et le mode structure sont désactivés tant que tu ne te connectes pas. Pour te connecter en sécurité : <b>ferme cet onglet puis relance <code>start-vie.cmd</code></b>, ou appuie sur <b>Entrée dans la fenêtre noire du serveur Vie</b> : un nouveau lien à usage unique ouvre le navigateur. Ne colle jamais ce lien ailleurs.',' <button type="button" class="btn secondary small" data-vie="retry-health">Réessayer</button>'));
else if(srv.state==='nokey')out.push(banner('warn','<b>Clé API absente côté serveur.</b> Ajoute <code>ANTHROPIC_API_KEY=…</code> dans le fichier <code>.env</code> du projet (jamais dans le navigateur), puis relance <code>node vie-server.cjs</code>.',' <button type="button" class="btn secondary small" data-vie="retry-health">Réessayer</button>'));
else if(srv.state==='checking')out.push(banner('info','Vérification du serveur local…'));
if(typeof navigator!=='undefined'&&navigator.onLine===false)out.push(banner('warn','Pas de connexion Internet : Vie ne peut pas joindre Anthropic. Le reste du site fonctionne hors ligne.'));
if(legacyConsent&&!prefs.consent)out.push(banner('info','<b>Partage de données désactivé.</b> Le texte de consentement a été corrigé (il annonçait les notes exclues alors que celles des idées étaient envoyées). Ton ancien accord n’est pas reconduit : relis le texte dans ⚙ puis réactive le partage si tu le souhaites.'));
if(st.locked)out.push(banner('warn','Sauvegarde illisible (mode récupération) : Vie peut discuter mais <b>ne modifiera rien</b> et ne reçoit pas tes données.'));
else if(st.uncertain)out.push(banner('warn','Enregistrement incertain : Vie ne peut rien modifier tant que le bandeau du site n’est pas traité.'));
if(!prefs.migrationDismissed&&location.protocol.startsWith('http')&&st.hasStoredData===false&&!st.locked)out.push(banner('info','<b>Aucune donnée VIE sur cette adresse.</b> Si tu utilisais <code>index.html</code> en <code>file://</code>, ton navigateur garde ces données à part : exporte-les depuis l’ancienne page (Réglages → Exporter JSON) puis importe ici (Réglages → Importer JSON). Rien n’est transféré ni effacé automatiquement.',' <button type="button" class="btn tertiary small" data-vie="goto-settings">Ouvrir Réglages</button> <button type="button" class="btn secondary small" data-vie="dismiss-migration">Compris</button>'));
elStatus.innerHTML=out.join('');}
// --- Réglages de Vie (niveau, partage, journal, migration) ---
function renderSettings(){elSet.hidden=!settingsOpen;elSet.classList.toggle('consenting',consentPending&&settingsOpen);panel.querySelector('[data-vie="toggle-settings"]').setAttribute('aria-expanded',String(settingsOpen));if(!settingsOpen)return;
const priceNote=srv.prices?`Estimation indicative d’après les tarifs publics connus au ${esc(srv.prices.asOf)} ; ce n’est pas une facture.`:'Les coûts affichés après chaque réponse sont des estimations indicatives.';
elSet.innerHTML=`<p class="small-note vie-modelhint">Le modèle et l’effort se choisissent directement dans la zone de saisie, avec le bouton « ${esc(pillText())} » ; ils s’appliquent au message suivant. Les limites de longueur et le budget du jour restent appliqués par le serveur.</p>
<div class="vie-field"><label class="vie-switch"><input type="checkbox" id="vie-share" role="switch"${prefs.share?' checked':''}> <span>Partager mes données avec Vie</span></label><small>${prefs.share?'Activé : une sélection de champs de tes fiches, choisie selon ta question, est envoyée à Anthropic via le serveur local (détail dans « Coûts et confidentialité »).':'Désactivé (par défaut) : seul ton message est envoyé ; Vie ne voit pas tes fiches.'}</small></div>
${srv.dev===true?`<div class="vie-field"><label class="vie-switch"><input type="checkbox" id="vie-dev" role="switch"${devMode?' checked':''}> <span>Mode structure (Vie peut proposer de modifier le code de VIE)</span></label><small>${devMode?'Activé pour cet onglet : Vie lit le code de l’application (envoyé à Anthropic) et te propose des modifications, que tu relis EN ENTIER ; chacune n’est appliquée qu’après ton approbation, contrôlée par le serveur (usage unique, expirée au bout de 10 minutes), avec sauvegarde dans .vie-backups et annulation possible. Il ne touche ni au serveur, ni à la clé API.':'Autorisé par le serveur (VIE_DEV=on au démarrage), désactivé dans cet onglet. À activer pour qu’il crée de nouveaux champs ou de nouvelles fonctions (ex. suivi d’épargne).'}</small></div>`:`<div class="vie-field" id="vie-dev-off"><label class="vie-switch"><input type="checkbox" id="vie-dev" role="switch" disabled> <span>Mode structure (désactivé par le serveur)</span></label><small>Désactivé côté serveur (valeur par défaut) : Vie ne lit ni ne modifie le code. Ce réglage ne peut pas être activé depuis le navigateur ; il faut relancer le serveur avec la variable VIE_DEV=on (script start-vie-dev.cmd).</small></div>`}
${consentPending?`<div class="vie-consent" role="group" aria-labelledby="vie-consent-t"><h4 id="vie-consent-t">Avant d’activer le partage</h4>${SHARE_NOTICE}<p>Tu peux désactiver à tout moment.</p><div class="inline-actions"><button type="button" class="btn primary small" data-vie="consent-accept">J’accepte et j’active</button><button type="button" class="btn secondary small" data-vie="consent-refuse">Refuser (chat sans mes données)</button></div></div>`:''}
<details class="vie-details"><summary>Journal des actions approuvées (${audit.length})</summary><div id="vie-audit">${auditHtml()}</div></details>
<details class="vie-details"><summary>Migration depuis file:// et sauvegarde</summary><p class="small-note">Un navigateur sépare le stockage de <code>file://…/index.html</code> et de <code>http://127.0.0.1:3765</code> : ce sont deux « sites » différents, donc deux jeux de données. Rien n’est copié ni effacé automatiquement. Pour migrer : ouvre l’ancienne page → Réglages → <b>Exporter JSON</b> ; ouvre la nouvelle adresse → Réglages → <b>Importer JSON</b>. Tes données d’origine restent intactes.</p><div class="inline-actions"><button type="button" class="btn tertiary small" data-vie="goto-settings">Ouvrir Réglages (export / import)</button></div></details>
<details class="vie-details"><summary>Coûts et confidentialité</summary><div class="small-note">${SHARE_NOTICE}</div><p class="small-note">${priceNote} ${srv.budget?`Compteur du jour : ≈ ${esc(usd(srv.budget.spentUsd))} sur ${esc(usd(srv.budget.capUsd))}. Ce compteur est une estimation tenue en mémoire par le serveur Vie : il repart de zéro quand le serveur redémarre, compte par précaution les appels dont le coût est inconnu (délai dépassé, annulation) et <b>n’est pas un plafond de facturation</b> ; la vraie limite de dépense est celle réglée dans ta console Anthropic. `:''}Aucune clé n’est stockée dans le navigateur. Conversation conservée ${TTL_CHAT/DAY} jours au maximum (${MAX_CHAT} messages), journal ${TTL_AUDIT/DAY} jours.</p><div class="inline-actions"><button type="button" class="btn secondary small" data-vie="purge-chat">Purger la conversation</button><button type="button" class="btn secondary small" data-vie="purge-audit">Purger le journal</button></div></details>`;}
function auditHtml(){if(!audit.length)return'<p class="small-note">Aucune action approuvée pour le moment.</p>';return audit.map(e=>`<div class="vie-audit-row"><div><b>${esc(e.summary)}</b><small>${esc(new Date(e.ts).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}))} · ${e.status==='undone'?'annulée':'appliquée'}</small></div>${e.status==='applied'?`<button type="button" class="btn secondary small" data-vie="undo" data-audit="${esc(e.id)}">Annuler</button>`:''}</div>`).join('');}
// --- Journal ---
function nowAudit(items,ops){const one=ops.length===1;const first=ops[0];const summary=one?`${{update:'Modifié',create:'Créé',delete:'Supprimé'}[first.kind]} : ${A.ENT[first.entity].noun} « ${first.label} »`:`Lot de ${ops.length} modifications`;audit.unshift({id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),ts:Date.now(),summary:summary.slice(0,200),status:'applied',ops});return audit[0];}
// --- Messages ---
function metaLine(m){const x=m.meta;if(!x)return'';const bits=[];if(x.label)bits.push(esc(x.label));if(x.model)bits.push(esc(x.model)+(x.effort?` · difficulté ${esc(x.effort)}`:''));if(Number.isFinite(x.inputTokens))bits.push(`${x.inputTokens} entrée / ${x.outputTokens} sortie`);if(Number.isFinite(x.costUsd))bits.push(`≈ ${esc(usd(x.costUsd))} (estimation)`);const share=x.sections&&x.sections.length?`Données envoyées à Anthropic : ${esc(x.sections.join(', '))}${x.kb?` · ${esc(x.kb)} Ko`:''}`:'Aucune fiche envoyée (seuls ton message et l’historique de la conversation sont partis)';return`<div class="vie-msgmeta">${bits.join(' · ')}<br>${share}</div>`;}
function cardHtml(m,c){const p=c.prep||{},st=c.status;const rows=(p.rows||[]).length?`<table class="vie-diff"><caption class="sr-only">Valeurs concernées</caption><thead><tr><th scope="col">Champ</th><th scope="col">${p.kind==='create'?'—':'Avant'}</th><th scope="col">${p.kind==='delete'?'—':'Après'}</th></tr></thead><tbody>${p.rows.map(r=>`<tr><th scope="row">${esc(r.label)}</th><td>${r.old===null?'—':esc(r.old)}</td><td>${r.next===null?'—':`<b>${esc(r.next)}</b>`}</td></tr>`).join('')}</tbody></table>`:'';
const key=`${m.id}:${c.pid}`;let foot='';
if(st==='pending')foot=`<div class="inline-actions"><button type="button" class="btn primary small" data-vie="apply" data-card="${esc(key)}">${p.destructive?'Supprimer…':p.sensitive?'Appliquer…':'Appliquer'}</button><button type="button" class="btn secondary small" data-vie="refuse" data-card="${esc(key)}">Refuser</button></div>`;
else if(c.proposal&&c.proposal.kind==='code'&&st==='applied')foot=`<p class="vie-state ok">✓ Appliqué (sauvegarde <code>${esc(c.backup||'')}</code>).${c.restart?' Le serveur a redémarré : l’annulation depuis Vie n’est plus possible (la sauvegarde reste dans .vie-backups).':''} Recharge la page pour utiliser la nouvelle version.</p>${c.undoError?`<p class="vie-state bad" role="alert">Annulation impossible : ${esc(c.undoError)}</p>`:''}<div class="inline-actions"><button type="button" class="btn primary small" data-vie="reload">Recharger la page</button>${c.undo?`<button type="button" class="btn secondary small" data-vie="code-undo" data-card="${esc(key)}">Annuler la modification</button>`:''}</div>`;
else if(c.proposal&&c.proposal.kind==='code'&&st==='undone')foot=`<p class="vie-state">↶ Annulé : le fichier a été restauré (une copie de l’état annulé reste dans .vie-backups).${c.restart?' Le serveur a redémarré.':''} Recharge la page.</p><div class="inline-actions"><button type="button" class="btn primary small" data-vie="reload">Recharger la page</button></div>`;
else if(c.proposal&&c.proposal.kind==='code'&&st==='failed')foot=`<p class="vie-state bad" role="alert">✗ Non appliqué : ${esc(c.error||'échec')}</p>`;
else if(st==='applied')foot=`<p class="vie-state ok">✓ Appliqué.${c.auditId&&audit.some(e=>e.id===c.auditId&&e.status==='applied')?` <button type="button" class="btn secondary small" data-vie="undo" data-audit="${esc(c.auditId)}">Annuler</button>`:''}</p>`;
else if(st==='undone')foot='<p class="vie-state">↶ Annulé.</p>';else if(st==='refused')foot='<p class="vie-state">Refusé : rien n’a été modifié.</p>';
else if(st==='failed')foot=`<p class="vie-state bad" role="alert">✗ Non appliqué : ${esc(c.error||'échec')} <br>Rien n’a été modifié.</p>`;
else if(st==='invalid')foot=`<p class="vie-state bad">Proposition inapplicable : ${esc(c.error||'invalide')}</p>`;
else if(st==='auto')foot=`<p class="vie-state ok">✓ ${esc(c.note||'Fait')}</p>`;
return`<div class="vie-card ${esc(st)}${p.sensitive?' sensitive':''}" data-cardkey="${esc(key)}"><h4 tabindex="-1">${esc(p.title||'Proposition')}</h4>${p.targetId?`<div class="vie-target">Cible : <b>${esc(p.target)}</b> · identifiant <code>${esc(p.targetId)}</code></div>`:''}${rows}${p.consequence?`<p class="vie-cons"><b>Conséquence :</b> ${esc(p.consequence)}</p>`:''}${c.proposal&&c.proposal.reason?`<p class="vie-reason">Raison indiquée par Vie : ${esc(c.proposal.reason)}</p>`:''}${c.extra?`<div class="vie-extra">${c.extra}</div>`:''}${foot}</div>`;}
function bulkBar(m){const pend=(m.cards||[]).filter(c=>c.status==='pending'&&c.prep&&c.prep.kind!=='navigate'&&c.prep.kind!=='replan'&&c.prep.kind!=='code');if(pend.length<2)return'';return`<div class="vie-bulk" role="group" aria-label="Lot de ${pend.length} modifications"><b>Lot de ${pend.length} modifications</b><small>Appliquées ensemble ou pas du tout.</small><div class="inline-actions"><button type="button" class="btn primary small" data-vie="apply-all" data-msg="${esc(m.id)}">Tout appliquer (${pend.length})…</button><button type="button" class="btn secondary small" data-vie="refuse-all" data-msg="${esc(m.id)}">Tout refuser</button></div></div>`;}
function msgHtml(m){if(m.agent&&m.role==='assistant'&&m.kind!=='error'&&AG)return AG.msgHtml(m,{fmt:fmtText,cards:x=>bulkBar(x)+(x.cards||[]).map(c=>cardHtml(x,c)).join('')});if(m.role==='user')return`<div class="vie-msg user"><div class="vie-bubble">${esc(m.content).replace(/\n/g,'<br>')}</div></div>`;
if(m.kind==='error')return`<div class="vie-msg bot error"><div class="vie-bubble" role="alert">${esc(m.content)}</div></div>`;
const cards=m.cards||[];return`<div class="vie-msg bot"><div class="vie-bubble">${fmtText(m.content)}</div>${m.note?`<p class="vie-note">${esc(m.note)}</p>`:''}${bulkBar(m)}${cards.map(c=>cardHtml(m,c)).join('')}${metaLine(m)}</div>`;}
const SUGGESTIONS=['Résume ma semaine','Où en sont mes finances ce mois-ci ?','Quelles candidatures dois-je relancer ?','Ouvre la rubrique Finances'];
function emptyHtml(){if(agentMode&&AG)return AG.emptyHtml(prefs.share);return`<div class="vie-empty"><p><b>Salut, je suis Vie.</b> Je peux répondre à tes questions sur ton tableau de bord, t’ouvrir une rubrique, recalculer ta semaine et te <b>proposer</b> des modifications que tu valides une par une.</p><p class="small-note">${prefs.share?'Partage de données : activé.':'Partage de données : désactivé — je ne vois pas tes fiches (active-le dans ⚙ pour que je réponde avec tes données).'}</p><div class="vie-suggest">${SUGGESTIONS.map(s=>`<button type="button" class="chip" data-vie="suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;}
const shown=()=>chat.filter(m=>!!m.agent===agentMode);
function renderLog(focusKey,stick=true){const typing=busy&&!agentMode?'<div class="vie-msg bot typing" aria-label="Vie rédige une réponse"><div class="vie-bubble"><span class="vie-dots" aria-hidden="true"><i></i><i></i><i></i></span> Vie réfléchit…</div></div>':'';elLog.innerHTML=(shown().length?shown().map(msgHtml).join(''):emptyHtml())+typing;elLog.setAttribute('aria-busy',String(busy));if(focusKey){const h=elLog.querySelector(`[data-cardkey="${CSS.escape(focusKey)}"] h4`);if(h)h.focus({preventScroll:false});}else if(stick)elLog.scrollTop=elLog.scrollHeight;}
function renderMeta(){renderPicker();renderModes();const st=H.status();const sharing=prefs.share&&prefs.consent&&!st.locked;elMeta.innerHTML=`<span class="${sharing?'on':''}">${sharing?'● Données partagées':'○ Données non partagées'}</span>${srv.budget?`<span title="Estimation tenue en mémoire par le serveur Vie (remise à zéro au redémarrage). Ce n’est pas un plafond de facturation : la vraie limite est celle de ta console Anthropic.">Compteur estimé du jour ≈ ${esc(usd(srv.budget.spentUsd))} / ${esc(usd(srv.budget.capUsd))}<small> (en mémoire, remis à zéro au redémarrage du serveur)</small></span>`:''}`;
const agentOk=!agentMode||(AG&&AG.ready()&&AG.consented());const canSend=srv.state==='ready'&&!busy&&agentOk;elSend.disabled=!canSend;elSend.title=canSend?'':(busy?'Réponse en cours…':!agentOk?'Mode Agent inactif ou non autorisé (voir le panneau Agent)':'Serveur Vie indisponible (voir le message en haut)');elCancel.hidden=!busy;}
// --- Mode Agent « Ordinateur » (à côté du chat existant ; le sélecteur modèle · effort est le même) ---
function setMode(mode){const want=mode==='agent'&&!!AG;if(busy||agentMode===want)return;agentMode=want;renderAll();if(want)(srv.token?Promise.resolve():refreshHealth()).then(()=>AG.refresh()).then(()=>renderAll());}
function renderModes(){if(!AG){elModes.hidden=true;elAgent.hidden=true;return;}elModes.hidden=false;
elModes.innerHTML=`<button type="button" class="vie-mode${agentMode?'':' on'}" data-vie="mode" data-mode="chat" aria-pressed="${!agentMode}">Chat</button><button type="button" class="vie-mode${agentMode?' on':''}" data-vie="mode" data-mode="agent" aria-pressed="${agentMode}" title="Explorer tes fichiers et proposer des actions : chaque action sensible demande ton accord">Ordinateur</button>`;
elAgent.hidden=!agentMode;if(agentMode)elAgent.innerHTML=AG.panelHtml();}
function sendAgent(text,sharing,snap,fp0,st){if(!AG.ready()||!AG.consented()){renderAll();return;}
chat.push({id:nid(),role:'user',content:text,ts:Date.now(),agent:true});
// Historique de l'agent : mémoire seulement (jamais enregistré, il peut contenir des extraits de fichiers).
const hist=chat.filter(x=>x.agent&&x.kind!=='error'&&x.content).slice(-7).map(x=>({role:x.role,content:x.content.slice(0,4000)}));while(hist.length&&hist[0].role!=='user')hist.shift();
const body={mode:'custom',model:prefs.model,effort:prefs.effort,share:sharing,messages:hist,view:st.view,today:today()};if(sharing)body.context=snap;
const m={id:nid(),role:'assistant',content:'',ts:Date.now(),cards:[],agent:{state:'starting',items:[],since:0,fp0}};chat.push(m);
busy=true;cancelled=false;elInput.value='';updateCount();renderAll();AG.start(body,m);}
function finishAgent(m,d,failMsg){busy=false;
if(!d){const idx=chat.indexOf(m);if(idx>=0&&!m.agent.items.length)chat.splice(idx,1);else m.agent.state='error';chat.push({id:nid(),role:'assistant',kind:'error',agent:true,content:failMsg||'Échec du mode Agent.',ts:Date.now()});}
else{m.content=String(d.reply||'');m.agent.note=d.note||'';m.agent.meta={label:d.label,model:d.model,effort:d.effort,usd:d.usage&&d.usage.usd,estimated:!!(d.usage&&d.usage.estimated)};attachProposals(m,{proposals:d.proposals,rejected:d.rejected},m.agent.fp0);}
renderAll();AG.refresh().then(()=>{const s=AG.status();if(s&&s.budget)srv.budget=s.budget;renderAll();});if(!menuOpen)elInput.focus();}
function renderAll(focusKey){renderStatus();renderSettings();renderLog(focusKey);renderMeta();}
// --- Serveur local ---
async function refreshHealth(){if(location.protocol==='file:'){srv={state:'file',token:'',catalog:null,budget:null,prices:null};return;}
try{if(window.VieBoot&&!bootInfo)bootInfo=await window.VieBoot.ready;   // l'échange du ticket de lancement (vie-boot.js) précède toute lecture de l'état
const r=await fetch('/api/health',{headers:{accept:'application/json'},cache:'no-store'});const j=await r.json();if(!r.ok||!j||j.service!=='vie')throw new Error('x');
if(j.authenticated!==true){srv={state:'locked',token:'',catalog:null,budget:null,prices:null,boot:bootInfo};if(AG)AG.refresh();return;}
srv={state:j.keyConfigured?'ready':'nokey',token:j.token,catalog:cleanCatalog(j.catalog),budget:j.budget||null,prices:j.prices||null,dev:!!(j.dev&&j.dev.enabled===true),devLimits:j.dev&&Number.isInteger(j.dev.maxOld)&&Number.isInteger(j.dev.maxNew)?{maxOld:j.dev.maxOld,maxNew:j.dev.maxNew}:null};}catch(e){srv={state:'down',token:'',catalog:null,budget:null,prices:null};}
if(srv.catalog)reconcilePrefs();}
function pushError(text){chat.push({id:nid(),role:'assistant',kind:'error',content:text,ts:Date.now()});saveChat();}
// --- Envoi ---
// Historique renvoyé à Anthropic. Une réponse construite à partir des fiches (meta.sections non vide, ou meta absente : par prudence) ne repart PAS quand le partage est coupé :
// elle peut citer des données privées. Les réponses issues d'un ancien format de contexte qui incluait les notes d'idées (meta.sv absent) ne repartent jamais.
// Le message de l'utilisateur qui l'a provoquée est retiré avec elle pour garder une conversation cohérente.
const usedFiches=m=>m.role==='assistant'&&!(m.meta&&Array.isArray(m.meta.sections)&&m.meta.sections.length===0);
const legacyIdeas=m=>m.role==='assistant'&&!!(m.meta&&Array.isArray(m.meta.sections)&&m.meta.sections.some(s=>/^ideas\b/.test(String(s)))&&m.meta.sv!==2);
function buildHistory(sharing){let list=chat.filter(m=>m.kind!=='error'&&!m.agent);const drop=new Set();
list.forEach((m,i)=>{if((!sharing&&usedFiches(m))||legacyIdeas(m)){drop.add(i);if(i>0&&list[i-1].role==='user')drop.add(i-1);}});
list=list.filter((_,i)=>!drop.has(i));
let h=list.slice(-MAX_SEND).map(m=>({role:m.role,content:m.content.slice(0,4000)}));while(h.length&&h[0].role!=='user')h.shift();return h;}
async function send(text){text=String(text||'').trim().slice(0,MAX_INPUT);if(!text||busy)return;
if(srv.state!=='ready'){await refreshHealth();if(srv.state!=='ready'){renderAll();return;}}
if(navigator.onLine===false){pushError('Pas de connexion Internet : Vie ne peut pas joindre Anthropic. Réessaie une fois reconnecté.');renderAll();return;}
const st=H.status();const sharing=prefs.share&&prefs.consent&&prefs.consentV===CONSENT_V&&!st.locked;
// Le contexte est construit ET validé localement (schéma fermé, mêmes règles que le serveur) avant toute écriture dans la conversation ou tout envoi.
const fp0=A.fingerprints(H.getState());
let snap=null;if(sharing){snap=A.buildSnapshot(H.getState(),{message:text,view:st.view,today:today()});try{A.validateSnapshot(snap);}catch(e){pushError('Partage annulé : le contexte à joindre n’a pas passé la validation locale ('+String(e&&e.message||'invalide').slice(0,120)+'). Rien n’a été envoyé.');renderAll();return;}}
if(agentMode&&AG){sendAgent(text,sharing,snap,fp0,st);return;}
chat.push({id:nid(),role:'user',content:text,ts:Date.now()});saveChat();
// Le choix du pill est lu ICI, au moment de l'envoi : un changement ultérieur ne touche ni cette demande ni les réponses déjà affichées (leur modèle réel est gardé dans meta). Le serveur revalide modèle et effort.
const body={mode:'custom',model:prefs.model,effort:prefs.effort,share:sharing,messages:buildHistory(sharing),view:st.view,today:today()};
let sent=[];if(sharing){body.context=snap;sent=snap.sections.map(s=>{const n={tasks:snap.tasks,transactions:snap.transactions,applications:snap.applications,projects:snap.projects,courses:snap.courses,habits:snap.habits,goals:snap.goals,ideas:snap.ideas}[s];return Array.isArray(n)?`${s} (${n.length})`:s;});}
if(devOn())body.dev=true;const payload=JSON.stringify(body);
busy=true;cancelled=false;ctl=new AbortController();const guardTimer=setTimeout(()=>ctl.abort(),125000);elInput.value='';updateCount();renderAll();
try{const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json','x-vie-token':srv.token},body:payload,signal:ctl.signal});let j=null;try{j=await r.json();}catch(e){j=null;}
if(!r.ok||!j||j.ok!==true){const code=j&&j.error;if(code==='bad_token'||code==='bad_session'||r.status===0)await refreshHealth();pushError(j&&j.message?j.message:`Erreur du serveur Vie (HTTP ${r.status}).`);if(j&&j.budget&&srv.state==='ready')srv.budget=j.budget;}
else{if(j.budget)srv.budget=j.budget;onReply(j,sent,payload.length,fp0);}}
catch(e){if(e&&e.name==='AbortError')pushError(cancelled?'Demande annulée : rien n’a été modifié.':'La demande a pris trop de temps et a été interrompue : rien n’a été modifié.');else{await refreshHealth();pushError(srv.state==='ready'?'Échec réseau vers le serveur local. Réessaie.':'Le serveur local Vie ne répond plus. Relance node vie-server.cjs.');}}
finally{clearTimeout(guardTimer);busy=false;ctl=null;renderAll();if(!menuOpen)elInput.focus();}}
const DEV_FILES_UI=['index.html','styles.css','app.js','vie-assistant.js'];
/*UNICODE-POLICY-BEGIN*/
// POLITIQUE UNICODE du code proposé (même politique que vie-dev.cjs, vérifiée par test de parité exhaustif sur les 0x110000 points de code) : seuls des caractères VISIBLES et non ambigus sont admis.
// Refusés : tout Default_Ignorable_Code_Point (variation U+FE00-FE0F, U+180B-180F, U+E0100-E01EF ; largeur nulle ; bidirectionnel ; balises ; fillers), format (Cf), contrôle (Cc), substitut isolé, usage privé, non-attribué / non-caractère, tout séparateur sauf l'espace ASCII, braille vide U+2800. Blancs admis : espace, tabulation, LF, paire CR+LF.
const HID_RANGES=[[0,8],[11,31],[127,160],[173,173],[0x34F,0x34F],[0x61C,0x61C],[0x1680,0x1680],[0x115F,0x1160],[0x17B4,0x17B5],[0x180B,0x180F],[0x2000,0x200F],[0x2028,0x202F],[0x205F,0x206F],[0x2800,0x2800],[0x3000,0x3000],[0x3164,0x3164],[0xD800,0xDFFF],[0xE000,0xF8FF],[0xFDD0,0xFDEF],[0xFE00,0xFE0F],[0xFEFF,0xFEFF],[0xFFA0,0xFFA0],[0xFFF0,0xFFFF],[0x1BCA0,0x1BCA3],[0x1D173,0x1D17A],[0xE0000,0xE0FFF],[0xF0000,0x10FFFF]];
const HID_PROPS=(()=>{try{return /[\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}\p{Cs}\p{Co}\p{Cn}\p{Zs}\p{Zl}\p{Zp}]/u;}catch(e){return /[^\x20-\x7e\t\n]/;}})();
const hidCp=c=>HID_RANGES.some(r=>c>=r[0]&&c<=r[1])||(c&0xFFFE)===0xFFFE||HID_PROPS.test(String.fromCodePoint(c));
const hiddenFirst=t=>{for(let i=0;i<t.length;){const c=t.codePointAt(i),at=i;i+=c>0xFFFF?2:1;if(c===32||c===9||c===10)continue;if(c===13){if(t.charCodeAt(i)!==10)return{cp:c,index:at};continue;}if(hidCp(c))return{cp:c,index:at};}return null;};
const hasHidden=t=>hiddenFirst(t)!==null;
const cpLab=c=>'U+'+c.toString(16).toUpperCase().padStart(4,'0');
/*UNICODE-POLICY-END*/
const nInt=v=>Number.isInteger(v)&&v>=0&&v<=1e7;
// Surligne chaque caractère non ASCII (accents FR/DE, emoji, homoglyphes éventuels) sans changer le texte (textContent identique) ; le point de code est dans l'info-bulle.
const markNA=h=>h.replace(/[^\x00-\x7f]/gu,ch=>'<mark class="vie-na" title="'+cpLab(ch.codePointAt(0))+'">'+ch+'</mark>');
const naList=t=>{const seen=new Map();for(const ch of t)if(ch.codePointAt(0)>127)seen.set(ch,(seen.get(ch)||0)+1);const a=[...seen].slice(0,12).map(([ch,k])=>'<code>'+esc(ch)+' '+cpLab(ch.codePointAt(0))+(k>1?' ×'+k:'')+'</code>');return a.length?a.join(' ')+(seen.size>12?' … (+'+(seen.size-12)+' autres)':''):'aucun';};
function codeCard(raw,n){const lim=srv.devLimits||{maxOld:6000,maxNew:12000},s=raw&&raw.stats;
// Une proposition qui ne peut pas être relue EN ENTIER (trop grande, invisible, ambiguë, incohérente) est inapplicable : jamais d'aperçu tronqué ni de texte dont une partie échappe à la relecture.
const shaped=!!raw&&typeof raw==='object'&&DEV_FILES_UI.includes(raw.file)&&typeof raw.old==='string'&&typeof raw.new==='string'&&raw.old.length>=1&&raw.old.length<=lim.maxOld&&raw.new.length<=lim.maxNew
&&typeof raw.id==='string'&&/^[A-Za-z0-9_-]{8,40}$/.test(raw.id)&&typeof raw.nonce==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(raw.nonce)&&typeof raw.hash==='string'&&/^[0-9a-f]{64}$/.test(raw.hash)&&Number.isFinite(raw.expiresAt)
&&!!s&&typeof s==='object'&&s.oldChars===raw.old.length&&s.newChars===raw.new.length&&nInt(s.oldLines)&&nInt(s.newLines)&&nInt(s.atLine)&&nInt(s.nonAscii);
const hz=shaped?[['le texte à remplacer',hiddenFirst(raw.old)],['le nouveau texte',hiddenFirst(raw.new)],['la raison',hiddenFirst(String(raw.reason||'').replace(/[\r\n]+/g,' '))]].find(x=>x[1]):null;
const ok=shaped&&!hz;
const f=ok?raw.file:'?';
const c={pid:raw&&/^p\d{1,2}$/.test(String(raw.pid))?raw.pid:'p'+(n+1),proposal:ok?{kind:'code',file:raw.file,old:raw.old,new:raw.new,reason:String(raw.reason||'').slice(0,300),id:raw.id,nonce:raw.nonce,hash:raw.hash,expiresAt:raw.expiresAt}:null,stats:ok?s:null,status:ok?'pending':'invalid',error:hz?'proposition refusée : '+hz[0]+' contient un caractère invisible, de contrôle, spécial ou ambigu ('+cpLab(hz[1].cp)+', position '+hz[1].index+'). La carte ne peut pas garantir que tu vois tout : rien n’est applicable.':'proposition de code invalide ou trop grande pour être relue en entier : refusée'};
c.prep={ok:!!ok,kind:'code',title:'Modification du code : '+f,rows:[],sensitive:true,consequence:'Remplace UNE zone de '+f+' (aucune autre partie du fichier ne change). Sauvegarde automatique (.vie-backups), contrôle de syntaxe, retour arrière automatique si échec, annulation possible depuis cette carte. Approbation à usage unique contrôlée par le serveur, valable 10 minutes.'};
if(ok){const exp=new Date(raw.expiresAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
c.extra='<div class="vie-codediff"><p class="vie-codemeta">Fichier <b>'+esc(f)+'</b> · à partir de la ligne '+s.atLine+' · <b>'+s.oldChars+'</b> caractères ('+s.oldLines+' lignes) remplacés par <b>'+s.newChars+'</b> ('+s.newLines+' lignes)'+(s.nonAscii?' · '+s.nonAscii+' caractère(s) non ASCII dans le nouveau texte':'')+' · empreinte <code>'+esc(raw.hash.slice(0,12))+'</code> · valable jusqu’à '+esc(exp)+'</p><b class="vie-codelbl">Avant (texte intégral de la zone remplacée)</b><pre class="vie-code-old" tabindex="0">'+markNA(esc(raw.old))+'</pre><b class="vie-codelbl">Après (texte intégral de la zone de remplacement)</b><pre class="vie-code-new" tabindex="0">'+markNA(esc(raw.new))+'</pre>'
+'<p class="vie-codecheck"><b>Contrôle automatique du texte affiché</b> : '+(raw.old.length+raw.new.length)+' caractères au total ; aucun caractère invisible, de contrôle, bidirectionnel, de variation ni espace spécial (refusés par le serveur ET par ce panneau) ; seuls l’espace, la tabulation et la fin de ligne sont admis comme blancs. Non ASCII dans l’après : '+naList(raw.new)+' (surlignés dans les deux zones ; survole pour le code Unicode).</p>'
+'<p class="small-note">Ce n’est pas un diff ligne à ligne : « Avant » et « Après » sont deux zones affichées en entier. Le reste du fichier'+(nInt(s.fileChars)?' ('+s.fileChars+' caractères)':'')+' n’est pas affiché ; il n’est pas modifié, et le serveur refuse d’écrire si le fichier a changé depuis la proposition. Des caractères visuellement semblables (par exemple « а » cyrillique et « a » latin) ne sont pas détectables automatiquement : relis aussi les identifiants.</p></div>';}
return c;}
async function waitServer(){for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,700));try{const r=await fetch('/api/health',{cache:'no-store'});const j=await r.json();if(r.ok&&j&&j.service==='vie')return true;}catch(e){/* redémarrage en cours */}}return false;}
const codeCall=async(path,a)=>{const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-vie-token':srv.token},body:JSON.stringify({id:a.id,nonce:a.nonce,hash:a.hash,confirm:true})});let j=null;try{j=await r.json();}catch(e){j=null;}return{r,j};};
async function applyCode(m,c){if(codeBusy)return;const p=c.proposal,s=c.stats;
if(Date.now()>p.expiresAt){c.status='failed';c.error='approbation expirée : redemande la modification à Vie';renderLog();return;}
if(!confirm('Modifier le code de VIE ?\n\nFichier : '+p.file+' (à partir de la ligne '+s.atLine+')\nRemplace '+s.oldChars+' caractères ('+s.oldLines+' lignes) par '+s.newChars+' ('+s.newLines+' lignes)\nEmpreinte : '+p.hash.slice(0,12)+'\n\nConfirme que tu as relu l’avant/après INTÉGRAL affiché dans la carte. Une sauvegarde est faite ; l’approbation ne sert qu’une fois.'))return;codeBusy=true;
try{const{r,j}=await codeCall('/api/code',p);
if(!r.ok||!j||j.ok!==true){c.status='failed';c.error=j&&j.message?j.message:'HTTP '+r.status;}
else{c.status='applied';c.backup=typeof j.backup==='string'?j.backup:'';c.restart=j.restart===true;const u=j.undo;c.undo=!c.restart&&u&&typeof u.id==='string'&&typeof u.nonce==='string'&&typeof u.hash==='string'?{id:u.id,nonce:u.nonce,hash:u.hash}:null;
if(c.restart){renderLog();await waitServer();await refreshHealth();}}}
catch(e){c.status='failed';c.error='serveur injoignable';}
finally{codeBusy=false;renderLog();}}
async function undoCode(m,c){if(codeBusy||!c.undo)return;
if(!confirm('Annuler cette modification de '+c.proposal.file+' ?\n\nLe fichier retrouve exactement son contenu d’avant (sauvegarde '+c.backup+'). Refusé par le serveur si le fichier a changé depuis. Approbation à usage unique.'))return;codeBusy=true;
const u=c.undo;c.undo=null;
try{const{r,j}=await codeCall('/api/code/undo',u);
if(!r.ok||!j||j.ok!==true){c.undoError=j&&j.message?j.message:'HTTP '+r.status;}
else{c.status='undone';c.restart=j.restart===true;if(c.restart){renderLog();await waitServer();await refreshHealth();}}}
catch(e){c.undoError='serveur injoignable';}
finally{codeBusy=false;renderLog();}}
let codeBusy=false;
function onReply(j,sent,bytes,fp0){const m={id:nid(),role:'assistant',content:String(j.reply||''),ts:Date.now(),cards:[],meta:{sv:2,label:j.label,model:j.model,effort:j.effort,inputTokens:j.usage&&j.usage.inputTokens,outputTokens:j.usage&&j.usage.outputTokens,costUsd:j.usage&&j.usage.approxCostUsd,sections:sent,kb:sent.length?(bytes/1024).toFixed(1).replace('.',','):''}};
attachProposals(m,j,fp0);chat.push(m);saveChat();}
// Cartes de propositions (chat ET agent) : mêmes contrôles, même confirmation par l'utilisateur ; l'agent ne fait que proposer.
function attachProposals(m,j,fp0){const state=H.getState();let dropped=Array.isArray(j.rejected)?j.rejected.length:0;
for(const raw of Array.isArray(j.proposals)?j.proposals.slice(0,8):[]){if(raw&&raw.kind==='code'){m.cards.push(codeCard(raw,m.cards.length));continue;}let p;try{p=A.normalizeProposal(raw);}catch(e){dropped++;continue;}
const c={pid:p.pid||'p'+(m.cards.length+1),proposal:p,status:'pending'};
// Réponse tardive : une proposition sur un créneau désigné par sa position (cb-N, ws-N) est refusée si la liste a changé depuis l'envoi de la demande.
const stale=A.staleIndexed(fp0,state,p);if(stale){c.status='invalid';c.error=stale;c.prep={ok:false,title:'Proposition de Vie',rows:[]};m.cards.push(c);continue;}
if(p.kind==='navigate'){c.prep=A.prepare(state,p,today());if(H.navigate(p.section)){c.status='auto';c.note=`Rubrique « ${A.VIEW_LABELS[p.section]} » ouverte.`;}else{c.status='invalid';c.error='rubrique inconnue';}}
else if(p.kind==='replan')runReplan(c,p);
else{c.prep=A.prepare(state,p,today());if(!c.prep.ok){c.status='invalid';c.error=c.prep.error;c.prep={...c.prep,title:'Proposition de Vie',rows:[]};}}
m.cards.push(c);}
if(dropped)m.note=`${dropped} proposition(s) invalide(s) ont été ignorées par sécurité.`;}
function runReplan(c,p){const st=H.status();const wk=p.weekStart||today();c.prep={ok:true,kind:'replan',title:'Programme de la semaine recalculé',rows:[],consequence:'Le programme est calculé à l’affichage par le planificateur local ; il n’est pas stocké, donc rien n’est modifié. Pour déplacer une tâche, Vie peut proposer de changer sa date : tu valides.',sensitive:false};
if(!H.showWeek(wk)){c.status='invalid';c.error='date de semaine invalide';return;}
const plan=C.buildWeekPlan(H.getState(),wk);const li=a=>a.length?'<ul>'+a.slice(0,5).map(x=>`<li>${esc(x)}</li>`).join('')+(a.length>5?`<li>… et ${a.length-5} autre(s)</li>`:'')+'</ul>':'';
const blocks=plan.days.reduce((n,d)=>n+d.blocks.length,0);
c.status='auto';c.note=`Semaine du ${plan.weekStart} affichée : ${blocks} blocs, ${plan.conflicts.length} conflit(s), ${plan.unscheduled.length} à replanifier.`;
c.extra=(plan.conflicts.length?`<p><b>Conflits</b></p>${li(plan.conflicts)}`:'')+(plan.unscheduled.length?`<p><b>À replanifier</b></p>${li(plan.unscheduled.map(u=>`${u.date} · ${u.title} — ${u.reason}`))}`:'');
if(st.locked)c.extra+='<p class="small-note">Mode récupération : affichage de démonstration.</p>';}
// --- Application des propositions (confirmation explicite, mise à jour atomique, journal) ---
function findCard(key){const[mid,pid]=String(key).split(':');const m=chat.find(x=>x.id===mid);return m&&m.cards?{m,c:m.cards.find(x=>x.pid===pid)}:{};}
function applyCards(m,cards){if(applying||!cards.length)return;applying=true;let focus=null;
try{const st=H.status();if(st.locked||st.uncertain){cards.forEach(c=>{c.status='failed';c.error=st.locked?'mode récupération actif : aucune écriture':'enregistrement incertain : aucune écriture';});return;}
const bulk=cards.length>1,destructive=cards.some(c=>c.prep.destructive),sensitive=bulk||cards.some(c=>c.prep.sensitive);
if(sensitive){const lines=cards.map(c=>'• '+c.prep.title+(c.prep.rows.length?' ('+c.prep.rows.map(r=>`${r.label} : ${r.old===null?'—':r.old} → ${r.next===null?'supprimé':r.next}`).join(' ; ')+')':'')).join('\n');
if(!confirm((bulk?`Appliquer ces ${cards.length} modifications ensemble ?\n\n`:destructive?'Supprimer cet élément ?\n\n':'Appliquer cette modification sensible ?\n\n')+lines+(destructive?'\n\nUne sauvegarde JSON va être téléchargée avant la suppression.':'')))return;}
if(destructive&&!H.exportBackup()){cards.forEach(c=>{c.status='failed';c.error='sauvegarde préalable impossible : suppression annulée';});return;}
const ops=[];let fail=null;
const res=H.mutate(draft=>{const batch=A.beginBatch(draft);for(const c of cards){const r=A.apply(draft,c.proposal,c.prep.base,batch);if(!r.ok){fail={card:c,error:r.error};return r;}ops.push(r.op);}return{ok:true};},bulk?`${cards.length} modifications appliquées par Vie.`:'Modification appliquée par Vie.');
if(res.ok){const e=nowAudit(cards,ops);cards.forEach(c=>{c.status='applied';c.auditId=e.id;});if(!saveAudit())H.toast('Modification appliquée, mais le journal local n’a pas pu être écrit : l’annulation automatique ne sera pas disponible.');}
else{cards.forEach(c=>{c.status='failed';c.error=fail&&fail.card===c?fail.error:(fail?'lot annulé : une autre modification a échoué ('+fail.error+')':res.error);});}
focus=`${m.id}:${cards[0].pid}`;}
finally{applying=false;renderAll(focus);}}
function undoEntry(id){const e=audit.find(x=>x.id===id);if(!e||e.status!=='applied'||applying)return;if(e.ops.length>1&&!confirm(`Annuler ce lot de ${e.ops.length} modifications ?`))return;applying=true;
try{const res=H.mutate(draft=>{for(const op of e.ops.slice().reverse()){const r=A.undoOp(draft,op);if(!r.ok)return r;}return{ok:true};},'Action de Vie annulée.');
if(res.ok){e.status='undone';saveAudit();for(const m of chat)for(const c of m.cards||[])if(c.auditId===id)c.status='undone';}
else H.toast('Annulation impossible : '+(res.error||'état modifié depuis')+' Rien n’a été changé.');}
finally{applying=false;renderAll();}}
// --- Pill « Modèle · effort » et menu « Choisir un modèle » (ancré au pill, rôles ARIA menu / menuitemradio) ---
// Le choix ne déclenche AUCUN appel : il est mémorisé (prefs) et lu à l'envoi du message suivant. Pas de rangée « Mode approfondi » : aucune fonction réelle équivalente n'existe côté serveur.
const pillText=()=>`${chosenEntry().name} · ${effortLabel(prefs.effort)}`;
function renderPicker(){const m=chosenEntry();
elPill.innerHTML=`<span class="sr-only">Modèle et effort : </span><span class="vie-pill-txt">${esc(pillText())}</span><svg class="vie-chev" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true" focusable="false"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
elPill.title=`${m.name}${prefs.model==='default'?' (défaut recommandé)':''}, effort ${effortLabel(prefs.effort)} — choisir le modèle et l’effort du prochain message`;
elPill.setAttribute('aria-expanded',String(menuOpen));
if(menuOpen)renderMenu();}
function menuHtml(){const c=catalog(),def=defaultEntry(),ch=chosenEntry(),$$=n=>'$'.repeat(n);
const row=(key,name,desc,m,checked)=>`<button type="button" role="menuitemradio" aria-checked="${checked}" tabindex="-1" class="vie-opt" data-pick="${esc(key)}"><span class="vie-opt-main"><span class="vie-opt-name">${esc(name)}</span><span class="vie-opt-desc">${esc(desc)}</span></span><span class="vie-cost" aria-hidden="true" title="Coût relatif : ${esc(m.costLabel)}">${$$(m.costTier)}</span><span class="sr-only">Coût relatif : ${esc(m.costLabel)}.</span><span class="vie-check" aria-hidden="true">✓</span></button>`;
const rows=[row('default','Défaut (recommandé)',`${def.name} · ${effortLabel(c.default.effort)} — ${def.description}`,def,prefs.model==='default'),...c.models.slice().reverse().map(m=>row(m.id,m.name,m.description,m,prefs.model===m.id))].join('');
const notch=e=>`<button type="button" role="menuitemradio" aria-checked="${prefs.effort===e.id}" tabindex="-1" class="vie-notch" data-effort="${esc(e.id)}"><i aria-hidden="true"></i><span>${esc(e.label)}</span></button>`;
const legend=c.models.map(m=>`${$$(m.costTier)} ${m.costLabel.toLowerCase()}`).join(' · ');
return`<div class="vie-pop-head" id="vie-pop-title">Choisir un modèle</div><div role="menu" id="vie-menu" aria-labelledby="vie-pop-title"><div role="group" aria-label="Modèle">${rows}</div><div class="vie-pop-effort" role="group" aria-labelledby="vie-eff-title"><div class="vie-eff-title" id="vie-eff-title" role="presentation">Effort (<b>${esc(effortLabel(prefs.effort))}</b>)</div><div class="vie-notches">${c.efforts.filter(e=>ch.efforts.includes(e.id)).map(notch).join('')}</div></div></div><p class="vie-pop-note">S’applique au <b>prochain message</b> ; les réponses déjà affichées ne changent pas. Coût relatif : ${esc(legend)} (estimation indicative, pas une facture).${srv.catalog?'':' <b>Serveur injoignable : liste locale non vérifiée.</b>'}</p>`;}
function renderMenu(){const f=elPop.contains(document.activeElement)?document.activeElement.closest('[data-pick],[data-effort]'):null;const key=f?(f.dataset.pick!==undefined?'[data-pick="'+CSS.escape(f.dataset.pick)+'"]':'[data-effort="'+CSS.escape(f.dataset.effort)+'"]'):null;const top=elPop.scrollTop;
elPop.innerHTML=menuHtml();elPop.scrollTop=top;if(key){const t=elPop.querySelector(key);if(t)t.focus({preventScroll:true});}}
function openMenu(){if(menuOpen)return;menuOpen=true;elPop.hidden=false;elPill.setAttribute('aria-expanded','true');renderMenu();const t=elPop.querySelector('[data-pick][aria-checked="true"]')||elPop.querySelector('[data-pick]');if(t){t.focus({preventScroll:true});t.scrollIntoView({block:'nearest'});}}
function closeMenu(refocus){if(!menuOpen)return;menuOpen=false;elPop.hidden=true;elPop.innerHTML='';elPill.setAttribute('aria-expanded','false');if(refocus)elPill.focus();}
function setModel(id){if(id!=='default'&&!modelEntry(id))return;closeMenu(true);prefs.model=id;reconcilePrefs();savePrefs();renderMeta();}
function setEffort(id){if(!chosenEntry().efforts.includes(id)||!catalog().efforts.some(e=>e.id===id))return;prefs.effort=id;savePrefs();renderMeta();}
elPill.addEventListener('click',()=>{menuOpen?closeMenu(false):openMenu();});
elPill.addEventListener('keydown',e=>{if((e.key==='ArrowDown'||e.key==='ArrowUp')&&!menuOpen){e.preventDefault();openMenu();}});
elPop.addEventListener('click',e=>{const b=e.target.closest('[data-pick],[data-effort]');if(!b||!elPop.contains(b))return;if(b.dataset.pick!==undefined)setModel(b.dataset.pick);else setEffort(b.dataset.effort);});
// Flèches haut/bas : de ligne en ligne (modèles, puis la rangée d'effort) ; gauche/droite : entre les crans d'effort ; Entrée/Espace valident (comportement natif du bouton) ; Échap ou Tab ferment et rendent le focus au pill.
elPop.addEventListener('keydown',e=>{const k=e.key;
if(k==='Escape'){e.preventDefault();e.stopPropagation();closeMenu(true);return;}
if(k==='Tab'){e.preventDefault();closeMenu(true);return;}
const picks=[...elPop.querySelectorAll('[data-pick]')],efforts=[...elPop.querySelectorAll('[data-effort]')],cur=document.activeElement,inEff=efforts.includes(cur);
if(k==='ArrowDown'||k==='ArrowUp'||k==='Home'||k==='End'){e.preventDefault();const rows=[...picks,efforts.find(x=>x.getAttribute('aria-checked')==='true')||efforts[0]].filter(Boolean);let i=inEff?rows.length-1:rows.indexOf(cur);if(i<0)i=0;
i=k==='Home'?0:k==='End'?rows.length-1:(i+(k==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[i].focus({preventScroll:true});rows[i].scrollIntoView({block:'nearest'});}
else if((k==='ArrowRight'||k==='ArrowLeft')&&inEff){e.preventDefault();const i=efforts.indexOf(cur);efforts[(i+(k==='ArrowRight'?1:-1)+efforts.length)%efforts.length].focus({preventScroll:true});}});
// Clic ou focus hors du menu -> fermeture sans voler le focus.
document.addEventListener('pointerdown',e=>{if(menuOpen&&!elModel.contains(e.target))closeMenu(false);},true);
document.addEventListener('focusin',e=>{if(menuOpen&&!elModel.contains(e.target))closeMenu(false);});
// --- Ouverture / fermeture ---
function setOpen(v,focus=true){if(!v)closeMenu(false);open=v;panel.classList.toggle('open',v);panel.inert=!v;document.body.classList.toggle('vie-open',v);launcher.setAttribute('aria-expanded',String(v));launcher.setAttribute('aria-label',v?'Replier l’assistant Vie':'Ouvrir l’assistant Vie');
if(v){renderAll();refreshHealth().then(()=>AG&&agentMode?AG.refresh():null).then(()=>{renderAll();});if(focus)elInput.focus();}else if(focus)launcher.focus();}
function updateCount(){const n=elInput.value.length;elCount.textContent=n>MAX_INPUT-300?`${n} / ${MAX_INPUT}`:'';}
// --- Événements ---
launcher.addEventListener('click',()=>setOpen(!open));
document.addEventListener('keydown',e=>{if(e.altKey&&!e.ctrlKey&&!e.metaKey&&(e.key==='v'||e.key==='V')){e.preventDefault();setOpen(!open);}else if(e.key==='Escape'&&open&&!document.querySelector('dialog[open]')){if(menuOpen)closeMenu(true);else setOpen(false);}});
$('#vie-form').addEventListener('submit',e=>{e.preventDefault();send(elInput.value);});
elInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(elInput.value);}});
elInput.addEventListener('input',updateCount);
panel.addEventListener('change',e=>{const t=e.target;if(t.id==='vie-dev'){if(srv.dev!==true){t.checked=false;devMode=false;renderAll();return;}if(t.checked&&!confirm('Activer le mode structure ?\n\nVie pourra lire le code de l’application (envoyé à Anthropic) et te proposer de le modifier. Rien n’est appliqué sans ton approbation, vérifiée par le serveur ; chaque modification est sauvegardée dans .vie-backups. Le serveur, la clé API et les tests ne sont pas modifiables.'))t.checked=false;devMode=t.checked;try{sessionStorage.setItem('vie-dev',devMode?'1':'0');}catch(x){}renderAll();return;}if(t.id==='vie-share'){if(t.checked&&!prefs.consent){t.checked=false;consentPending=true;renderSettings();const g=elSet.querySelector('.vie-consent h4');if(g){g.tabIndex=-1;g.focus();}}else{prefs.share=t.checked;consentPending=false;savePrefs();renderAll();}}});
panel.addEventListener('click',e=>{const b=e.target.closest('[data-vie]');if(!b)return;const a=b.dataset.vie;
switch(a){
case'close':setOpen(false);break;
case'toggle-settings':settingsOpen=!settingsOpen;renderSettings();break;
case'clear':if(!chat.length)break;if(confirm('Effacer toute la conversation avec Vie ? (Les données de VIE et le journal des actions ne sont pas touchés.)')){chat=[];saveChat();renderAll();}break;
case'cancel':cancelled=true;if(ctl)ctl.abort();if(AG&&AG.active())AG.cancel();break;
case'mode':setMode(b.dataset.mode);{const t=elModes.querySelector('[data-mode="'+b.dataset.mode+'"]');if(t)t.focus();}break;
case'retry-health':srv.state='checking';renderStatus();refreshHealth().then(renderAll);break;
case'suggest':elInput.value=b.dataset.text||'';updateCount();send(elInput.value);break;
case'consent-accept':prefs.consent=true;prefs.consentV=CONSENT_V;legacyConsent=false;prefs.share=true;prefs.consentAt=new Date().toISOString();consentPending=false;savePrefs();renderAll();break;
case'consent-refuse':prefs.share=false;consentPending=false;savePrefs();renderAll();break;
case'goto-settings':H.navigate('settings');break;
case'dismiss-migration':prefs.migrationDismissed=true;savePrefs();renderStatus();break;
case'purge-chat':if(confirm('Purger la conversation enregistrée ?')){chat=[];saveChat();renderAll();}break;
case'purge-audit':if(confirm('Purger le journal des actions ? Les modifications déjà faites ne seront plus annulables depuis Vie.')){audit=[];saveAudit();renderAll();}break;
case'undo':undoEntry(b.dataset.audit);break;
case'reload':location.reload();break;
case'code-undo':{const{m,c}=findCard(b.dataset.card);if(m&&c&&c.status==='applied'&&c.proposal&&c.proposal.kind==='code')undoCode(m,c);break;}
case'apply':{const{m,c}=findCard(b.dataset.card);if(m&&c&&c.status==='pending'){if(c.proposal&&c.proposal.kind==='code')applyCode(m,c);else applyCards(m,[c]);}break;}
case'refuse':{const{c}=findCard(b.dataset.card);if(c&&c.status==='pending'){c.status='refused';renderLog(b.dataset.card);}break;}
case'apply-all':{const m=chat.find(x=>x.id===b.dataset.msg);if(m)applyCards(m,(m.cards||[]).filter(c=>c.status==='pending'&&c.prep&&c.prep.ok&&c.prep.kind!=='navigate'&&c.prep.kind!=='replan'&&c.prep.kind!=='code'));break;}
case'refuse-all':{const m=chat.find(x=>x.id===b.dataset.msg);if(m){(m.cards||[]).forEach(c=>{if(c.status==='pending')c.status='refused';});renderLog();}break;}
}});
window.addEventListener('online',()=>{if(open)renderAll();});window.addEventListener('offline',()=>{if(open)renderAll();});
window.addEventListener('storage',e=>{if(e.key===KA){const a=rd(KA);audit=Array.isArray(a)?a:[];if(open)renderSettings();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&open)renderStatus();});
renderMeta();renderLog();
if(AG)AG.attach({panel,token:()=>srv.token,locked:()=>srv.state==='locked',render:k=>renderLog(k,k===undefined),renderAll,toast:t=>H.toast(t),budget:b=>{srv.budget=b;},setMode,fail:(m,msg)=>finishAgent(m,null,msg),finish:(m,d)=>finishAgent(m,d)});
window.VieAssistant=Object.freeze({agentMode:()=>agentMode,open:()=>setOpen(true),close:()=>setOpen(false),isOpen:()=>open,catalog:()=>JSON.parse(JSON.stringify(catalog())),catalogVerified:()=>!!srv.catalog});
})();
