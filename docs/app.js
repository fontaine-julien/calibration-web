import {SITE} from './config.js';

const $ = id => document.getElementById(id);
const screen = $('test-screen');
const STORAGE = 'pystats-etalonnage-session-v1';
let config, session = null, draft = null, mode = 'home', block = 'copy', tested = false;
let current = null, answer = '', events = [], started = 0, pending = null, practice = '';
const activeModes = new Set(['starting','loading','item','saving']);
const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
};
function store() {
  try { sessionStorage.setItem(STORAGE, JSON.stringify({session,draft})); }
  catch { $('availability').textContent = 'Le stockage de cet onglet est indisponible. Conservez impérativement votre clé personnelle.'; }
}
function apiBase() {
  if (!SITE.apiBase) throw new Error('Le site est en préparation. Aucune donnée de test n’est envoyée.');
  const url = new URL(SITE.apiBase);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Une connexion HTTPS est requise.');
  return url.href.replace(/\/$/,'');
}
async function api(path, {method = 'GET', body, key = session?.sessionToken} = {}) {
  const headers = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${apiBase()}${path}`, {method,headers,body:body === undefined ? undefined : JSON.stringify(body),
    cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Le service est indisponible.');
  return data;
}
function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function showScreen(panel) {
  screen.hidden = false;
  $('home').inert = true;
  for (const name of ['prep','item','message']) $(`${name}-panel`).hidden = name !== panel;
  screen.focus({preventScroll:true});
}
function setMode(value) { mode = value; screen.classList.toggle('live-test',activeModes.has(value)); }
function message(label,title,text,actionLabel,action) {
  showScreen('message');
  $('message-label').textContent = label; $('message-title').textContent = title;
  $('message-text').textContent = text; $('result-grid').replaceChildren();
  $('message-action').hidden = !actionLabel; $('message-action').textContent = actionLabel || '';
  $('message-action').onclick = action || null;
  $('message-home').hidden = activeModes.has(mode);
}
async function leaveScreen() {
  if (activeModes.has(mode)) return;
  screen.hidden = true; $('home').inert = false;
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  $('donnees').scrollIntoView(); $('rights-key').focus();
}
function prepare(phase = 'copy') {
  block = phase; tested = false; practice = ''; setMode('prep'); showScreen('prep');
  $('test-phase').textContent = phase === 'copy' ? '01 / Copie — préparation' : '02 / Multiplications — préparation';
  $('test-progress').textContent = '';
  $('prep-title').textContent = 'Vérifiez votre pavé numérique.';
  $('prep-text').textContent = 'Appuyez sur le chiffre 4 du pavé numérique, puis sur son Entrée.';
  $('practice-output').textContent = '—'; $('begin-block').disabled = true;
  $('begin-block').textContent = phase === 'copy' ? 'Commencer les 50 copies' : 'Commencer les 50 multiplications';
  $('prep-status').textContent = '';
  $('rights-key').value = session.rightsToken;
}
async function beginBlock() {
  if (!tested || mode !== 'prep') return;
  $('begin-block').disabled = true;
  try {
    if (!document.fullscreenElement) await screen.requestFullscreen();
    if (!document.hasFocus()) throw new Error('Revenez dans la fenêtre du test.');
    setMode('starting');
    await api('/begin',{method:'POST',body:{}});
    if (mode !== 'starting') return;
    await loadItem();
  } catch (error) {
    if (mode === 'starting') await interrupt('network',error.message);
    else { $('prep-status').textContent = `Le plein écran est nécessaire : ${error.message}`; $('begin-block').disabled = false; }
  }
}
async function loadItem() {
  setMode('loading'); showScreen('item');
  $('stimulus').textContent = '…'; $('answer').textContent = '\u00a0'; $('limit-note').textContent = '';
  try {
    const item = await api('/item',{method:'POST',body:{}});
    if (mode !== 'loading') return;
    current = item; answer = ''; events = [];
    $('test-phase').textContent = item.phase === 'copy' ? '01 / Recopiez le nombre' : '02 / Donnez le résultat';
    $('test-progress').textContent = `${item.position} / ${item.total}`;
    // The timer starts when the item is placed in the next paint, never at the network request.
    requestAnimationFrame(() => {
      if (mode !== 'loading') return;
      $('stimulus').textContent = item.prompt;
      started = performance.now(); setMode('item');
    });
  } catch (error) { await interrupt('network',error.message); }
}
async function saveAnswer() {
  if (mode !== 'item' || !answer) return;
  const enterMs = performance.now() - started;
  pending = {index:current.index,nonce:current.nonce,answer,events:[...events],enterMs};
  setMode('saving'); $('stimulus').textContent = '…'; $('answer').textContent = '\u00a0';
  try {
    const state = await api('/answer',{method:'POST',body:pending});
    pending = null;
    if (mode !== 'saving') return;
    if (state.state === 'pause') {
      setMode('pause');
      message('Premier bloc terminé','Prenez une pause.',
        'Les 50 copies sont enregistrées. Le prochain bloc présente 50 multiplications. Reprenez lorsque vous êtes prêt, avec le même clavier.',
        'Préparer les multiplications',() => prepare('tables'));
    } else if (state.state === 'completed') await finish();
    else if (state.state === 'active') await loadItem();
    else await interrupt('voluntary');
  } catch (error) {
    setMode('interrupted');
    message('Connexion interrompue','La passation est arrêtée.',
      'La dernière réponse peut avoir été reçue. Vous pouvez renvoyer exactement cette réponse sans créer de doublon. Le bloc ne redémarrera pas.',
      'Renvoyer la dernière réponse',retryPending);
  }
}
async function retryPending() {
  if (!pending) return;
  $('message-action').disabled = true;
  try {
    await api('/answer',{method:'POST',body:pending}); pending = null;
    await api('/interrupt',{method:'POST',body:{reason:'network'}});
    const state = await api('/status');
    if (state.state === 'completed') await finish();
    else message('Enregistrement effectué','Passation interrompue.',
      'Votre dernière réponse a été conservée. Le résultat reste identifié comme incomplet. Vous pouvez accéder à vos données ou les supprimer depuis la page d’accueil.');
  } catch (error) { $('message-text').textContent = `Envoi impossible pour le moment : ${error.message} Gardez cet onglet ouvert pour réessayer.`; }
  finally { $('message-action').disabled = false; }
}
async function finish() {
  setMode('finished');
  message('Les deux blocs sont terminés','Merci pour votre participation.',
    'Chargement de votre bilan…','Réessayer le chargement du bilan',finish);
  try {
    const {summary:s} = await api('/result');
    $('message-action').hidden = false;
    $('message-action').textContent = 'Télécharger mes données';
    $('message-action').onclick = async () => {
      $('message-action').disabled = true;
      try {
        const data = await api('/rights/data',{key:session.rightsToken});
        download('mes-donnees-etalonnage.json',JSON.stringify(data,null,2),'application/json');
      } catch (error) { $('message-text').textContent = `Téléchargement impossible : ${error.message} Vous pouvez réessayer ou utiliser l’espace Mes données.`; }
      finally { $('message-action').disabled = false; }
    };
    $('message-text').textContent = `${s.copyCorrect}/50 copies justes · ${s.tablesCorrect}/50 multiplications justes · ${s.pairs} paires retenues. ` +
      'L’écart est une mesure exploratoire, pas une preuve de mémorisation ni une mesure d’intelligence.';
    const fmt = value => value === null ? 'Non calculable' : `${value.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3})} s`;
    for (const [label,value,accent] of [['Copie',s.copySeconds,false],['Tables',s.tablesSeconds,false],['Écart tables − copie',s.differenceSeconds,true]]) {
      const box = document.createElement('div'); box.className = `metric${accent ? ' accent' : ''}`;
      const name = document.createElement('span'); name.textContent = label;
      const number = document.createElement('strong'); number.textContent = fmt(value);
      box.append(name,number); $('result-grid').append(box);
    }
  } catch (error) { $('message-text').textContent = `Les réponses sont enregistrées. Le bilan est momentanément indisponible : ${error.message}`; }
}
async function interrupt(reason,detail = '') {
  if (['interrupted','finished','home'].includes(mode)) return;
  setMode('interrupted');
  message('Vous pouvez quitter librement','Passation interrompue.',
    'Ce bloc ne sera pas repris : une interruption changerait les conditions de mesure. Vos réponses déjà reçues restent identifiées comme incomplètes. Vous pouvez les télécharger ou les supprimer.');
  try { await api('/interrupt',{method:'POST',body:{reason}}); }
  catch { $('message-text').textContent += ' Le serveur est injoignable ; l’interruption sera signalée au retour dans cet onglet. Votre clé permet de gérer les données déjà reçues.'; }
  if (detail) $('message-text').textContent += ` (${detail})`;
}

$('join-form').addEventListener('submit',async event => {
  event.preventDefault();
  if (!config?.ready || !$('adult').checked || !$('consent').checked) return;
  if (session) { $('availability').textContent = 'Une passation existe déjà dans cet onglet. Utilisez votre clé de gestion des données.'; return; }
  if (!document.fullscreenEnabled || !matchMedia('(pointer: fine)').matches) {
    $('availability').textContent = 'Utilisez un ordinateur avec un pavé numérique et un navigateur autorisant le plein écran.'; return;
  }
  $('join').disabled = true; $('availability').textContent = 'Réservation de votre invitation…';
  const code = $('invitation').value.trim();
  // Persist only the random session/rights tokens, never the invitation itself.
  if (!draft) draft = {sessionToken:token(),rightsToken:token()}; store();
  try {
    const result = await api('/claim',{method:'POST',key:null,body:{...draft,code,adult:true,consent:true,consentVersion:config.consentVersion}});
    session = {...draft,id:result.id,expiresAt:result.expiresAt}; draft = null; store();
    $('invitation').value = ''; $('availability').textContent = 'Votre invitation est réservée.';
    prepare();
  } catch (error) { $('availability').textContent = error.message; $('availability').classList.add('error'); $('join').disabled = false; }
});
$('begin-block').onclick = beginBlock;
$('save-key').onclick = () => download('ma-cle-etalonnage.txt',
  `Étalonnage PyStats — clé personnelle, à garder privée\n\nPage : ${location.href.split('#')[0]}#donnees\nIdentifiant : ${session.id}\nClé de gestion : ${session.rightsToken}\nConservation jusqu’au : ${new Date(session.expiresAt).toLocaleDateString('fr-FR')}\n\nCette clé permet de télécharger ou de supprimer vos données. Ne la partagez pas.\n${config.contact ? `Contact : ${config.contact}` : 'Aucun canal de contact direct n’est proposé. Utilisez l’espace Mes données avec votre clé.'}\n`);
$('cancel-prep').onclick = () => interrupt('voluntary');
$('message-home').onclick = leaveScreen;

window.addEventListener('keydown',event => {
  if (screen.hidden) return;
  if (event.key === 'Escape') { if (mode !== 'finished') void interrupt('escape'); return; }
  if (mode === 'prep') {
    if (event.code.startsWith('Numpad') || event.code === 'Backspace') event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'Numpad4' && event.key === '4') { practice = '4'; $('practice-output').textContent = '4'; }
    if (event.code === 'NumpadEnter' && practice === '4') {
      if (tested) { void beginBlock(); return; }
      tested = true; $('begin-block').disabled = false;
      $('prep-title').textContent = 'Votre clavier est prêt.';
      $('prep-text').textContent = block === 'copy' ? 'Recopiez chaque nombre, puis validez avec Entrée du pavé numérique.' : 'Saisissez le résultat de chaque multiplication, puis validez avec Entrée du pavé numérique.';
      $('prep-status').textContent = 'Enregistrez votre clé personnelle. Puis cliquez sur Commencer ou appuyez de nouveau sur Entrée du pavé.';
    }
    return;
  }
  if (mode === 'pause' && event.code === 'NumpadEnter' && !event.repeat) { event.preventDefault(); prepare('tables'); return; }
  if (!activeModes.has(mode)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (mode !== 'item' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
  if (event.code === 'NumpadEnter') { void saveAnswer(); return; }
  if (events.length >= 499) { void interrupt('input_limit'); return; }
  const ms = performance.now() - started;
  if (/^Numpad[0-9]$/.test(event.code) && /^[0-9]$/.test(event.key)) {
    if (answer.length >= current.maxDigits) { $('limit-note').textContent = `${current.maxDigits} chiffres maximum. Retour arrière pour corriger.`; return; }
    answer += event.key; events.push({type:'digit',value:event.key,ms});
  } else if (event.code === 'Backspace' && answer.length) {
    answer = answer.slice(0,-1); events.push({type:'backspace',ms});
  } else return;
  $('answer').textContent = answer || '\u00a0'; $('limit-note').textContent = '';
},true);
for (const name of ['pointerdown','mousedown','click','contextmenu','wheel','touchstart','paste','drop']) {
  window.addEventListener(name,event => {
    if (activeModes.has(mode)) { event.preventDefault(); event.stopImmediatePropagation(); }
  },{capture:true,passive:false});
}
document.addEventListener('fullscreenchange',() => { if (!document.fullscreenElement && activeModes.has(mode)) void interrupt('fullscreen'); });
document.addEventListener('visibilitychange',() => { if (document.hidden && activeModes.has(mode)) void interrupt('hidden'); });
window.addEventListener('blur',() => { if (activeModes.has(mode)) void interrupt('blur'); });
window.addEventListener('pagehide',() => {
  if (activeModes.has(mode) && session) {
    fetch(`${apiBase()}/interrupt`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.sessionToken}`},
      body:JSON.stringify({reason:'reload'}),keepalive:true,credentials:'omit'}).catch(() => {});
  }
});
$('get-data').onclick = async () => {
  try {
    const data = await api('/rights/data',{key:$('rights-key').value.trim()});
    download('mes-donnees-etalonnage.json',JSON.stringify(data,null,2),'application/json');
    $('rights-status').textContent = 'Vos données ont été préparées pour le téléchargement.';
  } catch (error) { $('rights-status').textContent = error.message; }
};
$('delete-data').onclick = async () => {
  if (!confirm('Retirer votre consentement et supprimer toutes vos réponses de la base active ? Cette action est définitive.')) return;
  try {
    await api('/rights/delete',{method:'POST',key:$('rights-key').value.trim(),body:{confirm:true}});
    $('rights-status').textContent = 'Votre consentement est retiré. Vos réponses et votre fiche de participation ont été supprimées de la base active. La demande figure aussi dans le journal du responsable pour supprimer les éventuelles copies déjà exportées.';
    session = null; draft = null; sessionStorage.removeItem(STORAGE); $('rights-key').value = '';
  } catch (error) { $('rights-status').textContent = error.message; }
};
$('clear-local').onclick = () => {
  if (!confirm('Effacer les clés de cet onglet ? Conservez le fichier de clé pour pouvoir gérer vos données ensuite. Cette action ne supprime pas les résultats du serveur.')) return;
  sessionStorage.removeItem(STORAGE); session = null; draft = null; $('rights-key').value = '';
  $('rights-status').textContent = 'Clés effacées de cet onglet. Les données du serveur restent conservées selon la notice.';
};
for (const a of document.querySelectorAll('[data-project]')) a.href = SITE.projectUrl;
for (const a of document.querySelectorAll('[data-profile]')) a.href = SITE.profileUrl;
async function initialize() {
  try {
    config = await api('/config',{key:null});
    for (const target of document.querySelectorAll('[data-retention]')) target.textContent = String(config.retentionDays);
    for (const target of document.querySelectorAll('[data-contact]')) {
      if (config.contact) { const link = document.createElement('a'); link.href = `mailto:${config.contact}`; link.textContent = config.contact; target.replaceChildren('Contact pour vos données : ',link); }
    }
    $('join').disabled = !config.ready;
    $('availability').textContent = config.ready ? 'Participation réservée aux adultes invités. Vous restez libre de ne pas commencer.' : 'Ouverture prochaine : les informations de confidentialité doivent encore être finalisées.';
    try { const saved = JSON.parse(sessionStorage.getItem(STORAGE)); session = saved?.session || null; draft = saved?.draft || null; } catch {}
    if (session) {
      $('rights-key').value = session.rightsToken; $('join').disabled = true;
      try {
        const state = await api('/status');
        if (state.state === 'completed') await finish();
        else if (state.state === 'ready' || state.state === 'pause') prepare(state.state === 'pause' ? 'tables' : 'copy');
        else {
          setMode('prep');
          await interrupt(state.state === 'active' ? 'reload' : 'voluntary');
        }
      } catch { $('availability').textContent = 'Une clé est conservée dans cet onglet. Utilisez « Mes données » pour vérifier votre participation.'; }
    }
  } catch (error) { $('availability').textContent = error.message; $('join').disabled = true; }
}
void initialize();
