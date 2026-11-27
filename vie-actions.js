/* VIE Actions — contrat partagé client/serveur de l'assistant Vie.
   Listes blanches d'entités et de champs, validation stricte des propositions, extraction minimale du contexte.
   Aucune écriture ici : `apply` ne modifie qu'un BROUILLON fourni par l'appelant (jamais l'état réel). */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports&&typeof require==='function'?require('./core.js'):root.VieCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.VieActions=api;})(typeof window!=='undefined'?window:globalThis,function(C){'use strict';
const VIEWS=['today','week','projects','study','career','life','finance','goals','ideas','settings'];
const VIEW_LABELS={today:'Vue d’ensemble',week:'Ma semaine',projects:'Mes projets',study:'Études',career:'Candidatures',life:'Vie & habitudes',finance:'Finances',goals:'Objectifs',ideas:'Idées',settings:'Réglages'};
class ActionError extends Error{constructor(msg,extra){super(msg);this.name='ActionError';if(extra)Object.assign(this,extra);}}
const fail=(m,x)=>{throw new ActionError(m,x);};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(n)||0);
// --- Types de champs ---------------------------------------------------------------------------------
const S=(min,max)=>({k:'str',min,max}),I=(min,max)=>({k:'int',min,max}),N=(min,max,o={})=>({k:'num',min,max,...o}),B={k:'bool'},BN={k:'boolnull'},D={k:'date'},DE={k:'date',empty:true},T={k:'time'},U={k:'url'};
const E=(...v)=>({k:'enum',v}),R=(coll,empty)=>({k:'ref',coll,empty});
const CTRL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const[y,m,d]=s.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;}
// Normalise une valeur proposée. Tolère uniquement les chaînes numériques canoniques ("12.5", "true") ; tout le reste est refusé.
function norm(sp,v,label){switch(sp.k){
case'str':{if(typeof v!=='string')fail(`${label} : texte attendu`);const s=v.trim();if(CTRL.test(s))fail(`${label} : caractères de contrôle interdits`);if(s.length<sp.min||s.length>sp.max)fail(`${label} : ${sp.min?'entre '+sp.min+' et ':'au plus '}${sp.max} caractères`);return s;}
case'int':case'num':{let n=v;if(typeof n==='string'&&/^-?\d{1,12}(\.\d{1,6})?$/.test(n.trim()))n=Number(n);if(typeof n!=='number'||!Number.isFinite(n))fail(`${label} : nombre attendu`);if(sp.k==='int'&&!Number.isInteger(n))fail(`${label} : entier attendu`);if(sp.k==='num')n=Math.round(n*100)/100;if(n<sp.min||n>sp.max)fail(`${label} : valeur entre ${sp.min} et ${sp.max}`);if(sp.step&&Math.abs(n/sp.step-Math.round(n/sp.step))>1e-9)fail(`${label} : par pas de ${sp.step}`);return n;}
case'bool':{if(v===true||v==='true')return true;if(v===false||v==='false')return false;return fail(`${label} : booléen attendu`);}
case'boolnull':{if(v===null||v==='null')return null;if(v===true||v==='true')return true;if(v===false||v==='false')return false;return fail(`${label} : oui, non ou non défini`);}
case'date':{if(v===''&&sp.empty)return'';if(!validDate(v))fail(`${label} : date AAAA-MM-JJ valide attendue`);return v;}
case'time':{if(typeof v!=='string'||!Number.isFinite(C.minTime(v)))fail(`${label} : heure HH:MM attendue`);return v;}
case'enum':{if(typeof v!=='string')fail(`${label} : valeur attendue parmi ${sp.v.join(', ')}`);const alt=v.trim().replace(/'/g,'’');const hit=sp.v.find(x=>x===v.trim()||x===alt);if(hit===undefined)fail(`${label} : valeur attendue parmi ${sp.v.join(', ')}`);return hit;}
case'ref':{if(v===''&&sp.empty)return'';if(typeof v!=='string'||!/^[A-Za-z0-9_:.-]{1,100}$/.test(v))fail(`${label} : identifiant invalide`);return v;}
case'url':{if(v==='')return'';if(typeof v!=='string'||v.length>500||CTRL.test(v)||!/^https?:\/\/\S+$/.test(v))fail(`${label} : lien http(s) attendu`);try{new URL(v);}catch(e){fail(`${label} : lien invalide`);}return v;}
default:return fail('type interne inconnu');}}
function fmt(sp,v){if(v===null||v===undefined)return'non défini';if(sp.k==='bool')return v?'Oui':'Non';if(sp.k==='boolnull')return v===null?'À confirmer':v?'Oui':'Non';if(sp.k==='num')return sp.money?money(v):String(v).replace('.',',');if(sp.k==='ref')return v===''?'(aucun)':String(v);if(sp.k==='int'&&sp.day)return C.weekdays[v]||String(v);return v===''?'(vide)':String(v);}
// --- Entités autorisées (liste blanche) ----------------------------------------------------------------
const TASK_CATS=['projects','study','career','wellness','rest'];
const ENT={
tasks:{type:'list',coll:'tasks',noun:'tâche',sens:'normal',ops:['update','create','delete'],fields:{title:S(1,160),projectId:R('projects',true),category:E(...TASK_CATS),priority:E('haute','normale','basse'),duration:I(15,480),date:DE,done:B,notes:S(0,2000)},labels:{title:'Intitulé',projectId:'Projet',category:'Catégorie',priority:'Priorité',duration:'Durée (min)',date:'Date',done:'Terminée',notes:'Notes'},req:['title'],defaults:()=>({projectId:'',category:'projects',priority:'normale',duration:45,date:'',done:false,origin:'assistant',notes:''}),label:r=>r.title},
transactions:{type:'list',coll:'transactions',noun:'dépense',sens:'finance',ops:['update','create','delete'],fields:{date:D,label:S(1,120),amount:N(0.01,1e6,{money:true}),category:E('vie','projets','alimentation','habits','transport','autre')},labels:{date:'Date',label:'Libellé',amount:'Montant',category:'Catégorie'},req:['date','label','amount'],defaults:()=>({type:'expense',category:'vie'}),label:r=>`${r.label} · ${r.date}`},
applications:{type:'list',coll:'applications',noun:'candidature',sens:'normal',ops:['update','create','delete'],fields:{company:S(1,120),role:S(1,160),status:E('brouillon','envoyée','entretien','refusée','offre'),sentAt:DE,followup:DE,url:U,notes:S(0,2000)},labels:{company:'Entreprise',role:'Poste',status:'Statut',sentAt:'Date d’envoi',followup:'Date de relance',url:'Lien',notes:'Notes'},req:['company','role'],defaults:()=>({status:'brouillon',sentAt:'',followup:'',url:'',notes:''}),label:r=>`${r.company} — ${r.role}`},
projects:{type:'list',coll:'projects',noun:'projet',sens:'normal',ops:['update','create'],fields:{name:S(1,100),domain:S(0,50),tier:E('focus','supervision','incubator'),status:S(0,100),description:S(0,1000),goal:S(0,1000),next:S(0,1000),target:S(0,1000),evidence:S(0,1000)},labels:{name:'Nom',domain:'Domaine',tier:'Niveau de suivi',status:'État déclaré',description:'Description',goal:'Objectif',next:'Prochaine action',target:'Indicateur de succès',evidence:'Sources / preuves'},req:['name'],defaults:()=>({domain:'Projet',tier:'incubator',status:'À préciser',description:'',goal:'',next:'',target:'À préciser',source:'Proposé par Vie, validé par l’utilisateur',evidence:'Aucune preuve',color:'#eeeeff',steps:[]}),finish:r=>{r.short=r.short||String(r.name).slice(0,2).toUpperCase();},label:r=>r.name},
courses:{type:'list',coll:'courses',noun:'cours',sens:'normal',ops:['update'],fields:{name:S(1,120),progress:S(0,300),next:S(0,1000),timePerWeek:I(0,1000)},labels:{name:'Matière',progress:'Situation',next:'Prochaine échéance',timePerWeek:'Révision / semaine (min)'},req:[],defaults:()=>({}),label:r=>r.name},
goals:{type:'list',coll:'goals',noun:'objectif',sens:'normal',ops:['update','create'],fields:{title:S(1,250),horizon:S(0,100),deadline:DE,metric:S(0,300),status:E('À préparer','En préparation','En cours','À mesurer','Terminé')},labels:{title:'Objectif',horizon:'Horizon',deadline:'Échéance',metric:'Mesure',status:'État'},req:['title'],defaults:()=>({horizon:'3 mois',deadline:'',metric:'',status:'À préparer'}),label:r=>r.title},
ideas:{type:'list',coll:'ideas',noun:'idée',sens:'normal',ops:['update','create'],fields:{title:S(1,160),status:E('En réflexion','À explorer','Archivée'),notes:S(0,2000)},labels:{title:'Nom',status:'Statut',notes:'Description'},req:['title'],defaults:()=>({status:'En réflexion',notes:''}),label:r=>r.title},
habits:{type:'list',coll:'habits',noun:'habitude',sens:'normal',ops:['update'],fields:{name:S(1,120),goal:I(0,14)},labels:{name:'Nom',goal:'Objectif / semaine'},req:[],defaults:()=>({}),label:r=>r.name},
habitChecks:{type:'checks',noun:'case d’habitude',sens:'normal',ops:['update'],fields:{done:B},labels:{done:'Cochée'},req:[],defaults:()=>({}),label:(r,id)=>id},
settings:{type:'singleton',noun:'réglage',sens:'settings',ops:['update'],fields:{sleepHours:N(7,10,{step:0.5}),budgetLiving:N(0,1e6,{money:true}),budgetProjects:N(0,1e6,{money:true}),savingsMonthly:N(0,1e6,{money:true}),foodBudget:N(0,1e6,{money:true}),targetMonthly:N(0,1e6,{money:true}),targetType:E('non précisé','chiffre d’affaires','bénéfice'),foodIncludedInLiving:BN},labels:{sleepHours:'Sommeil cible (h/nuit)',budgetLiving:'Dépenses de vie / mois',budgetProjects:'Budget projets / mois',savingsMonthly:'Économies / mois',foodBudget:'Budget alimentation / mois',targetMonthly:'Revenu cible / mois',targetType:'Type de revenu',foodIncludedInLiving:'Alimentation incluse dans la vie courante'},req:[],defaults:()=>({}),label:()=>'Réglages'},
courseBlocks:{type:'indexed',prefix:'cb',coll:'courseBlocks',noun:'créneau de cours',sens:'planning',ops:['update','create','delete'],fields:{title:S(0,120),day:{k:'int',min:0,max:6,day:true},start:T,end:T},labels:{title:'Matière',day:'Jour',start:'Début',end:'Fin'},req:['day','start','end'],defaults:()=>({title:'Cours'}),label:r=>`${r.title||'Cours'} · ${C.weekdays[r.day]} ${r.start}–${r.end}`},
workShifts:{type:'indexed',prefix:'ws',coll:'workShifts',noun:'horaire de travail',sens:'planning',ops:['update','create','delete'],fields:{day:{k:'int',min:0,max:6,day:true},start:T,end:T,confirmed:B},labels:{day:'Jour',start:'Début',end:'Fin',confirmed:'Confirmé par l’utilisateur'},req:['day','start','end'],defaults:()=>({confirmed:false}),label:r=>`Travail · ${C.weekdays[r.day]} ${r.start}–${r.end}`}};
const ENTITY_KEYS=Object.keys(ENT);
const ALL_FIELDS=[...new Set(ENTITY_KEYS.flatMap(k=>Object.keys(ENT[k].fields)))];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
// --- Normalisation des propositions (outil Claude -> proposition ; proposition serveur -> proposition) ------
function only(o,keys,what){for(const k of Object.keys(o))if(!keys.includes(k))fail(`${what} : paramètre inconnu « ${k} »`);}
function normReason(r){if(r===undefined||r===null||r==='')return'';if(typeof r!=='string')fail('raison : texte attendu');const s=r.trim();if(CTRL.test(s))fail('raison : caractères de contrôle interdits');return s.slice(0,300);}
function normId(id){if(typeof id!=='string'||!/^[A-Za-z0-9_:.-]{1,120}$/.test(id))fail('identifiant exact attendu (lettres, chiffres, _ : . -)');return id;}
function entityOf(key,op){if(typeof key!=='string'||!own(ENT,key))fail(`type inconnu « ${String(key).slice(0,40)} »`);if(!ENT[key].ops.includes(op))fail(`« ${ENT[key].noun} » n’autorise pas l’action ${op}`);return ENT[key];}
function normChanges(ent,arr,creating){if(!Array.isArray(arr)||arr.length<1||arr.length>12)fail('liste de champs : 1 à 12 éléments attendus');const out=[],seen=new Set();for(const c of arr){if(!plain(c))fail('champ invalide');only(c,['field','value'],'champ');const f=c.field;if(typeof f!=='string'||!own(ent.fields,f))fail(`champ « ${String(f).slice(0,40)} » non autorisé pour ${ent.noun}`);if(seen.has(f))fail(`champ « ${f} » en double`);seen.add(f);if(c.value===undefined)fail(`champ « ${f} » sans valeur`);out.push({field:f,value:norm(ent.fields[f],c.value,ent.labels[f]||f)});}
if(creating)for(const r of ent.req)if(!seen.has(r))fail(`champ obligatoire manquant : ${ent.labels[r]||r}`);return out;}
function normalizeProposal(p){if(!plain(p))fail('proposition invalide');only(p,['pid','kind','entity','id','changes','section','weekStart','reason'],'proposition');const out={};if(p.pid!==undefined){if(typeof p.pid!=='string'||!/^p\d{1,2}$/.test(p.pid))fail('pid invalide');out.pid=p.pid;}
switch(p.kind){
case'navigate':if(!VIEWS.includes(p.section))fail('section inconnue');return{...out,kind:'navigate',section:p.section,reason:normReason(p.reason)};
case'replan':{let ws='';if(p.weekStart!==undefined&&p.weekStart!==''){if(!validDate(p.weekStart))fail('weekStart : date AAAA-MM-JJ attendue');ws=p.weekStart;}return{...out,kind:'replan',weekStart:ws,reason:normReason(p.reason)};}
case'update':{const ent=entityOf(p.entity,'update');return{...out,kind:'update',entity:p.entity,id:normId(p.id),changes:normChanges(ent,p.changes,false),reason:normReason(p.reason)};}
case'create':{const ent=entityOf(p.entity,'create');if(p.id!==undefined)fail('création : identifiant attribué par l’application');return{...out,kind:'create',entity:p.entity,changes:normChanges(ent,p.changes,true),reason:normReason(p.reason)};}
case'delete':entityOf(p.entity,'delete');return{...out,kind:'delete',entity:p.entity,id:normId(p.id),reason:normReason(p.reason)};
default:return fail('type de proposition inconnu');}}
const TOOL_KIND={navigate_section:'navigate',replan_week:'replan',propose_update:'update',propose_create:'create',propose_delete:'delete'};
function normalizeToolCall(name,input){if(!own(TOOL_KIND,name))fail('outil inconnu');if(!plain(input))fail('entrée d’outil invalide');const kind=TOOL_KIND[name];
if(kind==='navigate'){only(input,['section','reason'],name);return normalizeProposal({kind,section:input.section,reason:input.reason});}
if(kind==='replan'){only(input,['weekStart','reason'],name);return normalizeProposal({kind,weekStart:input.weekStart,reason:input.reason});}
if(kind==='update'){only(input,['entity','id','changes','reason'],name);return normalizeProposal({kind,entity:input.entity,id:input.id,changes:input.changes,reason:input.reason});}
if(kind==='create'){only(input,['entity','values','reason'],name);return normalizeProposal({kind,entity:input.entity,changes:input.values,reason:input.reason});}
only(input,['entity','id','reason'],name);return normalizeProposal({kind,entity:input.entity,id:input.id,reason:input.reason});}
// --- Définition des outils Claude (descriptions générées depuis la liste blanche) --------------------------
function catalog(op){return ENTITY_KEYS.filter(k=>ENT[k].ops.includes(op)).map(k=>{const e=ENT[k];const f=Object.keys(e.fields).map(n=>{const sp=e.fields[n];return sp.k==='enum'?`${n}(${sp.v.join('|')})`:sp.k==='int'||sp.k==='num'?`${n}(${sp.min}..${sp.max})`:sp.k==='date'?`${n}(AAAA-MM-JJ)`:sp.k==='time'?`${n}(HH:MM)`:n;}).join(', ');const idHint=e.type==='indexed'?` ids « ${e.prefix}-N »`:e.type==='checks'?' id « idHabitude:AAAA-MM-JJ »':e.type==='singleton'?' id « settings »':'';return`- ${k} (${e.noun})${idHint} : ${f}`;}).join('\n');}
const fieldItem={type:'object',additionalProperties:false,required:['field','value'],properties:{field:{type:'string',enum:ALL_FIELDS},value:{type:['string','number','boolean','null']}}};
function toolDefs(share){const tools=[
{name:'navigate_section',description:'Ouvre une rubrique de l’application (aucune modification de données). Utiliser quand l’utilisateur demande d’aller quelque part ou de voir une rubrique.',input_schema:{type:'object',additionalProperties:false,required:['section'],properties:{section:{type:'string',enum:VIEWS},reason:{type:'string',maxLength:200}}}},
{name:'replan_week',description:'Recalcule et affiche le programme de la semaine avec le planificateur local de l’application (le programme n’est pas stocké : cela ne modifie aucune donnée). Utiliser pour « recalcule ma semaine ». Pour déplacer une tâche, proposer ensuite une modification de sa date.',input_schema:{type:'object',additionalProperties:false,properties:{weekStart:{type:'string',description:'Date AAAA-MM-JJ d’un jour de la semaine voulue ; vide = semaine en cours'},reason:{type:'string',maxLength:200}}}},
{name:'propose_create',description:'Propose de CRÉER un élément. L’utilisateur devra confirmer ; rien n’est créé sans lui. Types et champs autorisés :\n'+catalog('create'),input_schema:{type:'object',additionalProperties:false,required:['entity','values'],properties:{entity:{type:'string',enum:ENTITY_KEYS.filter(k=>ENT[k].ops.includes('create'))},values:{type:'array',minItems:1,maxItems:12,items:fieldItem},reason:{type:'string',maxLength:200}}}}];
if(!share)tools.push(
{name:'propose_update',description:'Propose de MODIFIER les RÉGLAGES de l’utilisateur (entity=settings, id=settings) : budget projets (budgetProjects), budget de vie (budgetLiving), budget alimentation (foodBudget), revenu cible (targetMonthly), sommeil… Ne nécessite pas de voir ses données. L’utilisateur devra confirmer. Autres éléments (tâches, dépenses…) : indisponibles tant que le partage est désactivé. Champs autorisés : '+catalog('update').split('\n').filter(l=>/settings|réglage/i.test(l)).join(' '),input_schema:{type:'object',additionalProperties:false,required:['entity','id','changes'],properties:{entity:{type:'string',enum:['settings']},id:{type:'string',enum:['settings']},changes:{type:'array',minItems:1,maxItems:12,items:fieldItem},reason:{type:'string',maxLength:200}}}});
if(share)tools.push(
{name:'propose_update',description:'Propose de MODIFIER des champs d’un élément existant, désigné par son identifiant EXACT tel qu’il figure dans les données fournies. L’utilisateur devra confirmer. Ne jamais inventer d’identifiant ; si plusieurs éléments conviennent ou si l’identifiant est inconnu, poser une question au lieu d’appeler l’outil. Types et champs autorisés :\n'+catalog('update'),input_schema:{type:'object',additionalProperties:false,required:['entity','id','changes'],properties:{entity:{type:'string',enum:ENTITY_KEYS.filter(k=>ENT[k].ops.includes('update'))},id:{type:'string',maxLength:120},changes:{type:'array',minItems:1,maxItems:12,items:fieldItem},reason:{type:'string',maxLength:200}}}},
{name:'propose_delete',description:'Propose de SUPPRIMER un élément existant (identifiant EXACT des données fournies). Action sensible : l’utilisateur devra confirmer. Types autorisés :\n'+catalog('delete'),input_schema:{type:'object',additionalProperties:false,required:['entity','id'],properties:{entity:{type:'string',enum:ENTITY_KEYS.filter(k=>ENT[k].ops.includes('delete'))},id:{type:'string',maxLength:120},reason:{type:'string',maxLength:200}}}});
return tools;}
// --- Application sur un BROUILLON ---------------------------------------------------------------------------
const bad=(error,conflict)=>({ok:false,error,conflict:!!conflict});
// Position d'un identifiant dans une liste : -1 si absent, ERREUR s'il en désigne plusieurs (données invalides) — jamais « le premier trouvé ».
function idxOf(arr,id){let at=-1;for(let i=0;i<arr.length;i++)if(arr[i].id===id){if(at>=0)fail(`Identifiant ambigu : « ${String(id).slice(0,60)} » désigne plusieurs éléments (données invalides). Aucune modification.`,{conflict:true});at=i;}return at;}
// Un identifiant positionnel n'a qu'UNE écriture canonique (« cb-7 », jamais « cb-07 » ni « cb-007 ») : deux écritures d'un même indice seraient deux noms pour une même cible.
const indexIdRe=ent=>new RegExp('^'+ent.prefix+'-(0|[1-9]\\d{0,2})$');
function locate(state,ent,id){
if(ent.type==='singleton')return id==='settings'?{rec:state.settings,index:0}:null;
if(ent.type==='list'){const i=idxOf(state[ent.coll],id);return i<0?null:{rec:state[ent.coll][i],index:i};}
if(ent.type==='indexed'){const m=indexIdRe(ent).exec(id);if(!m)return null;const arr=state.settings[ent.coll],i=Number(m[1]);return Array.isArray(arr)&&arr[i]?{rec:arr[i],index:i}:null;}
if(ent.type==='checks'){const m=/^([A-Za-z0-9_.-]{1,100}):(\d{4}-\d{2}-\d{2})$/.exec(id);if(!m||!validDate(m[2]))return null;if(idxOf(state.habits,m[1])<0)return null;return{rec:{done:state.habitChecks[id]===true},index:0};}
return null;}
// --- Empreintes exactes des listes désignées par POSITION (cb-N, ws-N) ---------------------------------------------------------
// Un identifiant positionnel ne désigne plus le même élément dès que la liste change (suppression, insertion, import). On compare donc la liste ENTIÈRE,
// sérialisée de façon canonique (clés triées) : égalité structurelle exacte, pas de hachage donc pas de collision possible.
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':v===undefined?'undefined':JSON.stringify(v);
const INDEXED=Object.keys(ENT).filter(k=>ENT[k].type==='indexed').map(k=>ENT[k]);
const FP_MAX=100000;
function collArr(state,ent){const a=state&&state.settings&&state.settings[ent.coll];return Array.isArray(a)?a:null;}
function collFp(state,ent){const a=collArr(state,ent);if(!a)fail(`Liste « ${ent.noun} » introuvable`);const s=stable(a);if(s.length>FP_MAX)fail(`Liste « ${ent.noun} » trop volumineuse pour une vérification sûre`);return s;}
// {courseBlocks:<empreinte>|null, workShifts:<empreinte>|null}
function fingerprints(state){const o={};for(const e of INDEXED){const a=collArr(state,e);o[e.coll]=a?stable(a):null;}return o;}
// Lot d'opérations : empreinte de chaque liste AU DÉPART + table position d'origine -> position courante (les suppressions/créations du lot décalent les positions).
function beginBatch(draft){const cx={};for(const e of INDEXED){const a=collArr(draft,e);if(a)cx[e.coll]={fp:stable(a),n:a.length,idx:a.map((_,i)=>i)};}return cx;}
function locateIndexed(draft,ent,id,base,cx){
const m=indexIdRe(ent).exec(id);if(!m)return null;
if(!base||typeof base.__coll!=='string')fail(`Aucune empreinte de référence pour la liste « ${ent.noun} » : actualise la proposition`,{conflict:true});
const c=cx[ent.coll],a=collArr(draft,ent);if(!c||!a)fail(`Liste « ${ent.noun} » introuvable`);
if(c.fp!==base.__coll)fail(`Conflit : la liste « ${ent.noun} » a changé depuis la proposition (« ${id} » ne désigne peut-être plus le même élément)`,{conflict:true});
const orig=Number(m[1]);if(orig>=c.n)return null;
const pos=c.idx.indexOf(orig);if(pos<0)fail(`Conflit : « ${id} » a déjà été supprimé par une autre modification du même lot`,{conflict:true});
return a[pos]?{rec:a[pos],index:pos}:null;}
// Réponse tardive : une proposition update/delete sur un créneau n'est recevable que si la liste est identique à celle qui existait à l'envoi de la demande.
function staleIndexed(fp0,state,p){if(!p||(p.kind!=='update'&&p.kind!=='delete'))return null;const ent=ENT[p.entity];if(!ent||ent.type!=='indexed')return null;
if(!fp0||typeof fp0[ent.coll]!=='string')return`Impossible de vérifier que la liste « ${ent.noun} » n’a pas changé depuis ta demande : proposition ignorée.`;
return fingerprints(state)[ent.coll]===fp0[ent.coll]?null:`La liste « ${ent.noun} » a changé pendant que Vie répondait : « ${p.id} » ne désigne peut-être plus le même élément. Redemande à Vie.`;}
function listOf(draft,ent){return ent.type==='list'?draft[ent.coll]:ent.type==='indexed'?draft.settings[ent.coll]:null;}
function rules(draft,ent,next,prev){
for(const[f,sp]of Object.entries(ent.fields))if(sp.k==='ref'&&next[f]&&!draft[sp.coll].some(x=>x.id===next[f]))fail(`${ent.labels[f]} : « ${next[f]} » n’existe pas`);
if(ent.coll==='applications'&&['envoyée','entretien','offre','refusée'].includes(next.status)&&!next.sentAt)fail('Candidature : la date d’envoi est obligatoire pour ce statut');
if(ent.coll==='projects'&&next.tier==='focus'&&draft.projects.filter(x=>x.tier==='focus'&&x.id!==next.id).length>=2)fail('Projet : deux projets sont déjà en focus ; passe d’abord l’un d’eux en supervision');
if(ent.type==='indexed'&&!(C.minTime(next.end)>C.minTime(next.start)))fail('Créneau : la fin doit être après le début (un horaire de nuit se saisit en deux plages)');}
function validateDraft(draft){try{C.validateImported(draft);}catch(e){fail('Données invalides après modification : '+String(e.message).slice(0,160));}}
// apply(draft, proposition normalisée, base, lot) : modifie `draft` ; `base` = valeurs observées à l'affichage (détection de conflit, empreinte de la liste pour les créneaux indexés).
// `lot` (A.beginBatch) est partagé par toutes les propositions appliquées ensemble sur le même brouillon ; sans lui, chaque appel repart de l'état courant du brouillon.
function apply(draft,p,base,ctx){try{
if(p.kind==='navigate'||p.kind==='replan')return{ok:true,noop:true};
const ent=ENT[p.entity];if(!ent||!ent.ops.includes(p.kind))return bad('Action non autorisée sur ce type');
const cx=ctx||beginBatch(draft);const fpAfter=()=>ent.type==='indexed'?{collAfter:collFp(draft,ent)}:{};
if(p.kind==='create'){const rec={...ent.defaults()};for(const c of p.changes)rec[c.field]=c.value;if(ent.type==='list'){do{rec.id=C.uid();}while(draft[ent.coll].some(r=>r.id===rec.id));}
rules(draft,ent,rec,null);if(ent.finish)ent.finish(rec);const arr=listOf(draft,ent);if(!arr)return bad('Création impossible pour ce type');arr.push(rec);if(ent.type==='indexed'&&cx[ent.coll])cx[ent.coll].idx.push(-1);validateDraft(draft);
return{ok:true,op:{kind:'create',entity:p.entity,id:ent.type==='list'?rec.id:`${ent.prefix}-${arr.length-1}`,index:arr.length-1,afterRecord:clone(rec),label:ent.label(rec),...fpAfter()}};}
const t=ent.type==='indexed'?locateIndexed(draft,ent,p.id,base,cx):locate(draft,ent,p.id);if(!t)return bad(`Élément introuvable : « ${p.id} » (identifiant exact requis)`,false);
if(p.kind==='delete'){if(!base||base.__rec===undefined)return bad('Suppression sans état de référence');if(JSON.stringify(t.rec)!==base.__rec)return bad('Conflit : cet élément a été modifié depuis la proposition',true);
const arr=listOf(draft,ent);if(!arr)return bad('Suppression impossible pour ce type');const before=clone(t.rec);arr.splice(t.index,1);if(ent.type==='indexed'&&cx[ent.coll])cx[ent.coll].idx.splice(t.index,1);validateDraft(draft);
return{ok:true,op:{kind:'delete',entity:p.entity,id:p.id,index:t.index,beforeRecord:before,label:ent.label(before,p.id),...fpAfter()}};}
// update
const before={},after={};for(const c of p.changes){const old=t.rec[c.field];if(base&&own(base,c.field)&&!eq(base[c.field],old))return bad(`Conflit : « ${ent.labels[c.field]} » a changé depuis la proposition (valeur actuelle : ${fmt(ent.fields[c.field],old)})`,true);before[c.field]=old;after[c.field]=c.value;}
if(p.changes.every(c=>eq(before[c.field],c.value)))return bad('Aucun changement : les valeurs proposées sont déjà en place');
const prevRec=clone(t.rec),next={...t.rec,...after};rules(draft,ent,next,prevRec);
if(ent.type==='checks')draft.habitChecks[p.id]=next.done;else if(ent.type==='singleton')draft.settings=next;else listOf(draft,ent)[t.index]=next;
validateDraft(draft);
return{ok:true,op:{kind:'update',entity:p.entity,id:p.id,index:t.index,before,after,beforeRecord:ent.type==='indexed'?prevRec:undefined,afterRecord:ent.type==='indexed'?clone(next):undefined,label:ent.label(next,p.id),...fpAfter()}};
}catch(e){if(e instanceof ActionError)return bad(e.message,e.conflict);return bad('Erreur interne : proposition non appliquée');}}
// Annulation d'une opération déjà appliquée, uniquement si l'état actuel est encore celui que l'assistant avait produit.
// Créneaux indexés : la liste ENTIÈRE doit être identique à celle qu'avait laissée l'opération (empreinte `collAfter`) ; sans empreinte, l'annulation est refusée.
function undoOp(draft,op){try{const ent=ENT[op.entity];if(!ent)return bad('Type inconnu');
if(ent.type==='indexed'){const a=collArr(draft,ent);if(!a)return bad('Liste introuvable : annulation impossible',true);
if(typeof op.collAfter!=='string')return bad('Annulation refusée : cette opération n’a pas d’empreinte de la liste (enregistrée par une version antérieure)',true);
if(collFp(draft,ent)!==op.collAfter)return bad(`Conflit : la liste « ${ent.noun} » a changé depuis, annulation refusée`,true);}
if(op.kind==='update'){if(ent.type==='indexed'){const arr=draft.settings[ent.coll];if(!arr[op.index]||!eq(arr[op.index],op.afterRecord))return bad('Conflit : ce créneau a changé depuis, annulation refusée',true);arr[op.index]=clone(op.beforeRecord);validateDraft(draft);return{ok:true};}
const t=locate(draft,ent,op.id);if(!t)return bad('Élément introuvable : annulation impossible',true);for(const f of Object.keys(op.after))if(!eq(t.rec[f],op.after[f]))return bad(`Conflit : « ${ent.labels[f]} » a changé depuis, annulation refusée`,true);
if(ent.type==='checks')draft.habitChecks[op.id]=op.before.done;else if(ent.type==='singleton')draft.settings={...t.rec,...clone(op.before)};else listOf(draft,ent)[t.index]={...t.rec,...clone(op.before)};validateDraft(draft);return{ok:true};}
if(op.kind==='create'){const arr=listOf(draft,ent);if(!arr)return bad('Annulation impossible');const i=ent.type==='list'?idxOf(arr,op.id):op.index;if(i<0||!arr[i]||!eq(arr[i],op.afterRecord))return bad('Conflit : l’élément créé a été modifié ou supprimé depuis',true);arr.splice(i,1);validateDraft(draft);return{ok:true};}
if(op.kind==='delete'){const arr=listOf(draft,ent);if(!arr)return bad('Annulation impossible');if(ent.type==='list'&&idxOf(arr,op.id)>=0)return bad('Conflit : un élément avec cet identifiant existe déjà',true);if(ent.type==='indexed'&&!(op.index>=0&&op.index<=arr.length))return bad('Conflit : position introuvable, annulation refusée',true);arr.splice(Math.min(op.index,arr.length),0,clone(op.beforeRecord));validateDraft(draft);return{ok:true};}
return bad('Opération inconnue');}catch(e){if(e instanceof ActionError)return bad(e.message,e.conflict);return bad('Erreur interne : annulation non appliquée');}}
// --- Prévisualisation exacte (cible, ancienne valeur, nouvelle valeur, conséquence) -----------------------------
function consequence(state,draft,p,ent,today){const parts=[];const ym=today.slice(0,7);
if(p.entity==='transactions'){const a=C.expensesInMonth(state,ym),b=C.expensesInMonth(draft,ym);if(a!==b)parts.push(`Dépenses saisies du mois ${ym} : ${money(a)} → ${money(b)}.`);else parts.push('Aucun effet sur le total du mois en cours.');}
if(p.entity==='settings'){const s0=state.settings,s1=draft.settings;const t0=s0.budgetLiving+s0.budgetProjects,t1=s1.budgetLiving+s1.budgetProjects;if(t0!==t1)parts.push(`Enveloppe totale : ${money(t0)} → ${money(t1)}.`);if(s0.sleepHours!==s1.sleepHours)parts.push(`Sommeil réservé par le planificateur : ${s0.sleepHours} h → ${s1.sleepHours} h par nuit.`);if(!parts.length)parts.push('Réglage enregistré ; le programme est recalculé à l’affichage.');}
if(ent.type==='indexed'){const a=C.buildWeekPlan(state,today),b=C.buildWeekPlan(draft,today);parts.push(`Conflits dans la semaine en cours : ${a.conflicts.length} → ${b.conflicts.length} ; tâches à replanifier : ${a.unscheduled.length} → ${b.unscheduled.length}.`);}
if(p.entity==='tasks'&&p.kind!=='delete'){const d=(p.changes||[]).find(c=>c.field==='date');if(d&&d.value){const a=C.buildWeekPlan(state,d.value),b=C.buildWeekPlan(draft,d.value);parts.push(`Semaine du ${a.weekStart} — tâches à replanifier : ${a.unscheduled.length} → ${b.unscheduled.length}.`);}}
if(p.kind==='delete')parts.push('Suppression : une sauvegarde JSON complète est téléchargée juste avant, et l’action reste annulable depuis le journal de Vie tant que rien n’a changé ensuite.');
if(p.kind==='create'&&!parts.length)parts.push('Un nouvel élément sera ajouté ; il pourra être annulé depuis le journal de Vie.');
return parts.length?parts.join(' '):'Aucun autre calcul n’est affecté.';}
function prepare(state,p,today){try{
if(p.kind==='navigate')return{ok:true,kind:'navigate',title:`Ouvrir « ${VIEW_LABELS[p.section]} »`,rows:[],consequence:'Navigation uniquement : aucune donnée modifiée.',sensitive:false,destructive:false};
if(p.kind==='replan')return{ok:true,kind:'replan',title:'Recalculer le programme de la semaine',rows:[],consequence:'Le programme est calculé par le planificateur local à l’affichage ; il n’est pas stocké, donc rien n’est modifié.',sensitive:false,destructive:false};
const ent=ENT[p.entity];if(!ent||!ent.ops.includes(p.kind))return{ok:false,error:'Action non autorisée sur ce type'};
let base=null,target='',targetId='';
if(p.kind!=='create'){const t=locate(state,ent,p.id);if(!t)return{ok:false,error:`Élément introuvable : « ${p.id} ». Vie ne peut modifier que des éléments existants désignés par leur identifiant exact.`};targetId=p.id;target=ent.label(t.rec,p.id);base=p.kind==='delete'?{__rec:JSON.stringify(t.rec)}:Object.fromEntries(p.changes.map(c=>[c.field,t.rec[c.field]]));if(ent.type==='indexed')base.__coll=collFp(state,ent);}
const draft=clone(state),r=apply(draft,p,base);if(!r.ok)return{ok:false,error:r.error,conflict:r.conflict};
const verb={update:'Modifier',create:'Créer',delete:'Supprimer'}[p.kind];
let rows;if(p.kind==='update')rows=p.changes.map(c=>({label:ent.labels[c.field]||c.field,old:fmt(ent.fields[c.field],base[c.field]),next:fmt(ent.fields[c.field],c.value)}));
else if(p.kind==='create')rows=p.changes.map(c=>({label:ent.labels[c.field]||c.field,old:null,next:fmt(ent.fields[c.field],c.value)}));
else{const rec=JSON.parse(base.__rec);rows=Object.keys(ent.fields).filter(f=>own(rec,f)&&rec[f]!==''&&rec[f]!==undefined).slice(0,6).map(f=>({label:ent.labels[f]||f,old:fmt(ent.fields[f],rec[f]),next:null}));}
return{ok:true,kind:p.kind,entity:p.entity,noun:ent.noun,targetId,target:p.kind==='create'?r.op.label:target,title:`${verb} : ${ent.noun}${p.kind==='create'?'':' « '+target+' »'}`,rows,consequence:consequence(state,draft,p,ent,today),base,sensitive:ent.sens!=='normal'||p.kind==='delete',destructive:p.kind==='delete',sens:ent.sens};
}catch(e){return{ok:false,error:e instanceof ActionError?e.message:'Erreur interne de prévisualisation'};}}
// --- Extraction minimale du contexte ------------------------------------------------------------------------------
const SECTION_KEYS={tasks:/t[âa]che|todo|[àa] faire|priorit|[ée]ch[ée]ance|deadline|exercice/i,transactions:/d[ée]pens|financ|budget|argent|€|euro|montant|co[ûu]t|achat|paiement|revenu|transaction|pay[ée]|factur|abonnement|netflix|loyer/i,applications:/candidat|stage|entretien|poste|offre|werkstudent|relanc|emploi|\bcv\b/i,projects:/projet|lernlabor|marketing|mainclip|publication|hermes|focus|jalon|medienarchiv|essensplan|dressing|tracing|3d/i,courses:/\bcours\b|[ée]tude|\bexam|r[ée]vision|mati[èe]re|universit|software|game design|mobile|virtual/i,habits:/habitude|sport|salle|piano|gym|ranger|routine|coder|social/i,goals:/objectif|vision|revue|\bbut\b/i,ideas:/id[ée]e|incubat/i,planning:/semaine|planning|programme|horaire|agenda|emploi du temps|calendrier|cr[ée]neau|travail|sommeil|replanif|recalcul|conflit|journ[ée]e|demain|aujourd/i,settings:/r[ée]glage|param[èe]tre|sommeil|budget|revenu cible|alimentation/i};
const ALL_TRIGGER=/\b(tout|ensemble|r[ée]sum|bilan|point global|vue d|panorama)\b/i;
const VIEW_SECTIONS={today:['tasks','projects','planning'],week:['planning','tasks'],projects:['projects'],study:['courses','tasks','planning'],career:['applications'],life:['habits','settings'],finance:['transactions','settings'],goals:['goals'],ideas:['ideas'],settings:['settings','planning']};
const SECTION_NAMES=['tasks','transactions','applications','projects','courses','habits','goals','ideas','planning','settings'];
function pickSections(message,view){const msg=String(message||'');if(ALL_TRIGGER.test(msg))return[...SECTION_NAMES];const hit=SECTION_NAMES.filter(s=>SECTION_KEYS[s].test(msg));return hit.length?hit:(VIEW_SECTIONS[view]||[]).slice();}
const EXP_CATS=ENT.transactions.fields.category.v,cents=n=>Math.round(n*100)/100;
const cut=(s,n=160)=>{s=String(s==null?'':s);return s.length>n?s.slice(0,n-1)+'…':s;};
function buildSnapshot(state,{message='',view='today',today=C.iso(new Date())}={}){
const sections=pickSections(message,view);const snap={today,view,overview:{tasks:{ouvertes:state.tasks.filter(t=>!t.done).length,terminees:state.tasks.filter(t=>t.done).length},depensesSaisies:state.transactions.length,candidatures:state.applications.length,projets:state.projects.length,cours:state.courses.length,habitudes:state.habits.length,objectifs:state.goals.length,idees:state.ideas.length},sections};
if(sections.includes('tasks')){const open=state.tasks.filter(t=>!t.done).slice(0,40),done=state.tasks.filter(t=>t.done).slice(-10);snap.tasks=[...open,...done].map(t=>({id:t.id,title:cut(t.title),projectId:t.projectId||'',category:t.category,priority:t.priority,duration:t.duration,date:t.date||'',done:!!t.done}));}
if(sections.includes('transactions')){const rows=state.transactions.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60);snap.transactions=rows.map(x=>({id:x.id,date:x.date,label:cut(x.label),amount:x.amount,category:EXP_CATS.includes(x.category)?x.category:'autre',type:x.type}));const ym=today.slice(0,7);const byCat={};let total=0;for(const x of state.transactions)if(x.type==='expense'&&String(x.date).startsWith(ym)){const c=EXP_CATS.includes(x.category)?x.category:'autre',a=Number(x.amount)||0;byCat[c]=cents((byCat[c]||0)+a);total+=a;}snap.derived={...(snap.derived||{}),monthExpenses:{month:ym,total:cents(total),byCategory:byCat}};}
if(sections.includes('applications'))snap.applications=state.applications.slice(0,40).map(a=>({id:a.id,company:cut(a.company),role:cut(a.role),status:a.status,sentAt:a.sentAt||'',followup:a.followup||''}));
if(sections.includes('projects'))snap.projects=state.projects.slice(0,30).map(p=>({id:p.id,name:cut(p.name),tier:p.tier,status:cut(p.status),next:cut(p.next),goal:cut(p.goal),stepsDone:(p.steps||[]).filter(s=>s.done).length,stepsTotal:(p.steps||[]).length}));
if(sections.includes('courses'))snap.courses=state.courses.slice(0,12).map(c=>({id:c.id,name:cut(c.name),progress:cut(c.progress),next:cut(c.next),timePerWeek:c.timePerWeek}));
if(sections.includes('habits')){snap.habits=state.habits.slice(0,12).map(h=>({id:h.id,name:cut(h.name),goal:h.goal,doneThisWeek:C.habitCount(state,h.id,today)}));const w=C.monday(today),keys=[];for(const h of state.habits.slice(0,12))for(let i=0;i<7;i++){const k=`${h.id}:${C.iso(C.addDays(w,i))}`;if(state.habitChecks[k]===true)keys.push(k);}snap.habitChecks=keys.slice(0,80);}
if(sections.includes('goals'))snap.goals=state.goals.slice(0,12).map(g=>({id:g.id,title:cut(g.title),horizon:g.horizon,deadline:g.deadline||'',metric:cut(g.metric),status:g.status}));
if(sections.includes('ideas'))snap.ideas=state.ideas.slice(0,30).map(i=>({id:i.id,title:cut(i.title),status:i.status}));
if(sections.includes('settings')){const s=state.settings;snap.settings={sleepHours:s.sleepHours,budgetLiving:s.budgetLiving,budgetProjects:s.budgetProjects,foodBudget:s.foodBudget,foodIncludedInLiving:s.foodIncludedInLiving,targetMonthly:s.targetMonthly,targetType:s.targetType};}
if(sections.includes('planning')){snap.workShifts=(state.settings.workShifts||[]).slice(0,20).map((s,i)=>({id:'ws-'+i,day:s.day,start:s.start,end:s.end,confirmed:!!s.confirmed}));snap.courseBlocks=(state.settings.courseBlocks||[]).slice(0,40).map((b,i)=>({id:'cb-'+i,title:cut(b.title,120),day:b.day,start:b.start,end:b.end}));const plan=C.buildWeekPlan(state,today);snap.settings=snap.settings||{};snap.settings.sleepHours=state.settings.sleepHours;snap.derived={...(snap.derived||{}),plan:{weekStart:plan.weekStart,conflits:plan.conflicts.slice(0,6).map(x=>cut(x,200)),aReplanifier:plan.unscheduled.slice(0,8).map(u=>({date:u.date,title:cut(u.title),reason:cut(u.reason,120)}))}};}
return snap;}
// Validation serveur du contexte reçu : mêmes listes blanches, types primitifs, tailles bornées.
const SNAP_FIELDS={tasks:{id:'s',title:'s',projectId:'s',category:'s',priority:'s',duration:'n',date:'s',done:'b'},transactions:{id:'s',date:'s',label:'s',amount:'n',category:'s',type:'s'},applications:{id:'s',company:'s',role:'s',status:'s',sentAt:'s',followup:'s'},projects:{id:'s',name:'s',tier:'s',status:'s',next:'s',goal:'s',stepsDone:'n',stepsTotal:'n'},courses:{id:'s',name:'s',progress:'s',next:'s',timePerWeek:'n'},habits:{id:'s',name:'s',goal:'n',doneThisWeek:'n'},goals:{id:'s',title:'s',horizon:'s',deadline:'s',metric:'s',status:'s'},ideas:{id:'s',title:'s',status:'s'},workShifts:{id:'s',day:'n',start:'s',end:'s',confirmed:'b'},courseBlocks:{id:'s',title:'s',day:'n',start:'s',end:'s'}};
const SNAP_CAP={tasks:50,transactions:60,applications:40,projects:30,courses:12,habits:12,goals:12,ideas:30,workShifts:20,courseBlocks:40};
// Schéma FERMÉ pour tout ce qui n'est pas une ligne de liste : chaque clé et chaque type sont déclarés ; une clé inconnue est refusée, jamais transmise.
const tN=(min,max)=>({t:'n',min,max}),tS=(max,re)=>({t:'s',max,re}),tB={t:'b'},tBN={t:'bn'},tO=shape=>({t:'o',shape}),tA=(item,max)=>({t:'a',item,max}),tM=(keys,val)=>({t:'m',keys,val});
const COUNT=tN(0,1e6),MONEY=tN(0,1e10);
const SCHEMA={
overview:tO({tasks:tO({ouvertes:COUNT,terminees:COUNT}),depensesSaisies:COUNT,candidatures:COUNT,projets:COUNT,cours:COUNT,habitudes:COUNT,objectifs:COUNT,idees:COUNT}),
derived:tO({monthExpenses:tO({month:tS(7,/^\d{4}-\d{2}$/),total:MONEY,byCategory:tM(EXP_CATS,MONEY)}),plan:tO({weekStart:tS(10,/^\d{4}-\d{2}-\d{2}$/),conflits:tA(tS(200),6),aReplanifier:tA(tO({date:tS(10),title:tS(160),reason:tS(120)}),8)})}),
settings:tO({sleepHours:tN(0,24),budgetLiving:MONEY,budgetProjects:MONEY,foodBudget:MONEY,foodIncludedInLiving:tBN,targetMonthly:MONEY,targetType:tS(100)})};
function closed(sc,v,label){switch(sc.t){
case'n':if(typeof v!=='number'||!Number.isFinite(v)||v<sc.min||v>sc.max)fail(`contexte : ${label} : nombre invalide`);return;
case's':if(typeof v!=='string'||v.length>sc.max||(sc.re&&!sc.re.test(v)))fail(`contexte : ${label} : texte invalide`);return;
case'b':if(typeof v!=='boolean')fail(`contexte : ${label} : booléen attendu`);return;
case'bn':if(v!==null&&typeof v!=='boolean')fail(`contexte : ${label} : booléen ou null attendu`);return;
case'o':if(!plain(v))fail(`contexte : ${label} invalide`);for(const k of Object.keys(v)){if(!own(sc.shape,k))fail(`contexte : champ « ${k.slice(0,40)} » non autorisé dans ${label}`);closed(sc.shape[k],v[k],label+'.'+k);}return;
case'a':if(!Array.isArray(v)||v.length>sc.max)fail(`contexte : ${label} : liste invalide ou trop longue`);v.forEach(x=>closed(sc.item,x,label+'[]'));return;
case'm':if(!plain(v))fail(`contexte : ${label} invalide`);for(const k of Object.keys(v)){if(!sc.keys.includes(k))fail(`contexte : clé « ${k.slice(0,40)} » non autorisée dans ${label}`);closed(sc.val,v[k],label+'.'+k);}return;}
fail('contexte : schéma interne inconnu');}
// Exclusion récursive (défense en profondeur, appliquée à TOUT le contexte, à toute profondeur) : clés de champs privés ou de secrets, motifs de clés API, volume de nœuds.
const SENSITIVE_KEY=/^(notes?|description|desc|urls?|links?|href|e-?mail|mail|phone|tel|telephone|password|passwd|pwd|secret|token|api[-_]?key|authorization|cookie|session|credentials?|display[-_]?name|first[-_]?name|last[-_]?name|prenom|iban|bic|address|adresse)$/i;
const SECRET_VALUE=/sk-(ant|proj|live|test)-[A-Za-z0-9_-]{8,}/i;
const MAX_NODES=6000;
function dataOnly(v,depth,label,acc){acc=acc||{n:0};if(++acc.n>MAX_NODES)fail('contexte : trop d’éléments');if(depth>6)fail(`contexte : ${label} trop profond`);if(v===null||typeof v==='boolean')return;if(typeof v==='number'){if(!Number.isFinite(v))fail(`contexte : nombre invalide (${label})`);return;}if(typeof v==='string'){if(v.length>400)fail(`contexte : texte trop long (${label})`);if(SECRET_VALUE.test(v))fail(`contexte : motif de clé secrète détecté (${label})`);return;}if(Array.isArray(v)){if(v.length>100)fail(`contexte : liste trop longue (${label})`);v.forEach(x=>dataOnly(x,depth+1,label,acc));return;}if(plain(v)){const ks=Object.keys(v);if(ks.length>40)fail(`contexte : trop de clés (${label})`);for(const k of ks){if(k==='__proto__'||k==='constructor'||k==='prototype'||k.length>60)fail(`contexte : clé interdite (${label})`);if(SENSITIVE_KEY.test(k))fail(`contexte : champ privé « ${k} » interdit (${label})`);dataOnly(v[k],depth+1,label,acc);}return;}fail(`contexte : type invalide (${label})`);}
function validateSnapshot(s){if(!plain(s))fail('contexte invalide');const top=['today','view','overview','sections','settings','habitChecks','derived',...Object.keys(SNAP_FIELDS)];only(s,top,'contexte');const acc={n:0};
if(s.today!==undefined&&!validDate(s.today))fail('contexte : date invalide');if(s.view!==undefined&&!VIEWS.includes(s.view))fail('contexte : rubrique invalide');
if(s.sections!==undefined&&(!Array.isArray(s.sections)||s.sections.length>12||s.sections.some(x=>!SECTION_NAMES.includes(x))))fail('contexte : sections invalides');
for(const[k,fields]of Object.entries(SNAP_FIELDS)){if(s[k]===undefined)continue;if(!Array.isArray(s[k])||s[k].length>SNAP_CAP[k])fail(`contexte : ${k} invalide ou trop long`);for(const r of s[k]){if(!plain(r))fail(`contexte : élément de ${k} invalide`);for(const f of Object.keys(r)){if(!own(fields,f))fail(`contexte : champ « ${f} » non autorisé dans ${k}`);const t=fields[f],v=r[f];if(t==='n'?(typeof v!=='number'||!Number.isFinite(v)):t==='b'?typeof v!=='boolean':typeof v!=='string')fail(`contexte : type invalide pour ${k}.${f}`);}dataOnly(r,1,k,acc);}}
if(s.habitChecks!==undefined&&(!Array.isArray(s.habitChecks)||s.habitChecks.length>100||s.habitChecks.some(x=>typeof x!=='string'||x.length>140)))fail('contexte : habitChecks invalide');
if(s.habitChecks!==undefined)dataOnly(s.habitChecks,1,'habitChecks',acc);
for(const k of['overview','settings','derived'])if(s[k]!==undefined){closed(SCHEMA[k],s[k],k);dataOnly(s[k],1,k,acc);}
if(JSON.stringify(s).length>60000)fail('contexte : trop volumineux');return s;}
// --- Avis de partage : SEULE source de ce que l'interface annonce à l'utilisateur ----------------------------------------------------
// Un libellé français par champ réellement transmis. Un test vérifie que ces tables couvrent EXACTEMENT SNAP_FIELDS, SCHEMA, habitChecks et les champs du planning :
// ajouter un champ au contexte sans le déclarer ici (ou l'inverse) fait échouer le test, donc l'interface ne peut pas promettre autre chose que ce que le code envoie.
const SHARE_ROWS={
tasks:['Tâches',{id:'identifiant',title:'intitulé',projectId:'projet',category:'catégorie',priority:'priorité',duration:'durée',date:'date',done:'terminée ou non'}],
transactions:['Dépenses',{id:'identifiant',date:'date',label:'libellé',amount:'montant',category:'catégorie',type:'type'}],
applications:['Candidatures',{id:'identifiant',company:'entreprise',role:'poste',status:'statut',sentAt:'date d’envoi',followup:'date de relance'}],
projects:['Projets',{id:'identifiant',name:'nom',tier:'niveau de suivi',status:'état',next:'prochaine action',goal:'objectif',stepsDone:'nombre d’étapes faites',stepsTotal:'nombre d’étapes'}],
courses:['Cours',{id:'identifiant',name:'nom',progress:'situation',next:'prochaine échéance',timePerWeek:'minutes de révision par semaine'}],
habits:['Habitudes',{id:'identifiant',name:'nom',goal:'objectif par semaine',doneThisWeek:'cases cochées cette semaine'}],
goals:['Objectifs',{id:'identifiant',title:'titre',horizon:'horizon',deadline:'échéance',metric:'mesure',status:'état'}],
ideas:['Idées',{id:'identifiant',title:'titre',status:'statut'}],
workShifts:['Horaires de travail',{id:'position dans la liste',day:'jour',start:'début',end:'fin',confirmed:'confirmé ou non'}],
courseBlocks:['Créneaux de cours',{id:'position dans la liste',title:'intitulé',day:'jour',start:'début',end:'fin'}]};
const SHARE_OVERVIEW={'tasks.ouvertes':'tâches ouvertes','tasks.terminees':'tâches terminées',depensesSaisies:'dépenses','candidatures':'candidatures',projets:'projets',cours:'cours',habitudes:'habitudes',objectifs:'objectifs',idees:'idées'};
const SHARE_DERIVED={'monthExpenses.month':'mois en cours','monthExpenses.total':'total des dépenses du mois','monthExpenses.byCategory':'total par catégorie','plan.weekStart':'début de la semaine','plan.conflits':'conflits de la semaine (phrases qui reprennent les intitulés des tâches et des cours concernés)','plan.aReplanifier.date':'date des tâches à replanifier','plan.aReplanifier.title':'leur intitulé','plan.aReplanifier.reason':'la raison'};
const SHARE_SETTINGS={sleepHours:'sommeil cible',budgetLiving:'budget de vie courante',budgetProjects:'budget projets',foodBudget:'budget alimentation',foodIncludedInLiving:'alimentation incluse ou non dans la vie courante',targetMonthly:'revenu mensuel visé',targetType:'type de revenu (chiffre d’affaires ou bénéfice)'};
const SHARE_HABITCHECKS='cases d’habitude cochées cette semaine (identifiant de l’habitude et date)';
const SHARE_NEVER=['les champs « notes » (tâches, candidatures, idées)','les descriptions, preuves et indicateurs de succès des projets, ainsi que les noms de leurs étapes','les liens des candidatures','ton prénom','tes revues hebdomadaires','ta clé API (elle ne quitte jamais le serveur local)'];
// Entrées affichées par l'interface (consentement et « Coûts et confidentialité »), générées depuis les tables ci-dessus.
function shareNotice(){const l=o=>Object.values(o).join(', '),pick=(o,re)=>Object.entries(o).filter(([k])=>re.test(k)).map(e=>e[1]).join(', '),head=k=>`${SHARE_ROWS[k][0]} (${SNAP_CAP[k]} au plus)`;
const items=[{title:'Compteurs (dès que le partage est actif)',text:'nombre de '+l(SHARE_OVERVIEW)}];
for(const k of['tasks','transactions','applications','projects','courses','habits','goals','ideas'])items.push({title:head(k),text:l(SHARE_ROWS[k][1])+(k==='transactions'?' ; calculés : '+pick(SHARE_DERIVED,/^monthExpenses/):k==='habits'?' ; '+SHARE_HABITCHECKS:'')});
items.push({title:'Planning',text:`${head('workShifts').toLowerCase()} : ${l(SHARE_ROWS.workShifts[1])} ; ${head('courseBlocks').toLowerCase()} : ${l(SHARE_ROWS.courseBlocks[1])} ; calculés par le planificateur : ${pick(SHARE_DERIVED,/^plan/)}`});
items.push({title:'Réglages',text:l(SHARE_SETTINGS)});
return{items,never:SHARE_NEVER.slice()};}
return{VIEWS,VIEW_LABELS,ENT,ENTITY_KEYS,ALL_FIELDS,SECTION_NAMES,ActionError,validDate,norm,fmt,money,normalizeProposal,normalizeToolCall,toolDefs,locate,apply,undoOp,prepare,pickSections,buildSnapshot,validateSnapshot,clone,eq,stable,fingerprints,staleIndexed,beginBatch,SNAP_FIELDS,SNAP_CAP,SCHEMA,SHARE_LABELS:{rows:SHARE_ROWS,overview:SHARE_OVERVIEW,derived:SHARE_DERIVED,settings:SHARE_SETTINGS,habitChecks:SHARE_HABITCHECKS,never:SHARE_NEVER},shareNotice};
});
