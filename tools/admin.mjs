// Owner-only local console. Nothing in this directory belongs in GitHub Pages.
import {createInterface} from 'node:readline/promises';
import {emitKeypressEvents} from 'node:readline';
import {stdin,stdout} from 'node:process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {SITE} from '../docs/config.js';

async function ask(label) {
  const rl=createInterface({input:stdin,output:stdout});
  try { return (await rl.question(label)).trim(); } finally { rl.close(); }
}
async function hidden(label) {
  if (!stdin.isTTY) throw new Error('Lancez cet outil dans un terminal interactif pour saisir le secret sans affichage.');
  stdout.write(label); emitKeypressEvents(stdin); stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve,reject)=> {
    let value='';
    const finish=()=>{stdin.off('keypress',listener);stdin.setRawMode(false);stdin.pause();stdout.write('\n');};
    const listener=(text,key)=> {
      if (key?.ctrl && key.name==='c') {finish();reject(new Error('Annulé.'));}
      else if (key?.name==='return') {finish();resolve(value.trim());}
      else if (key?.name==='backspace') value=value.slice(0,-1);
      else if (text && !key?.ctrl && !key?.meta) value+=text;
    };
    stdin.on('keypress',listener);
  });
}
const privateDir=fileURLToPath(new URL('../private/',import.meta.url));
async function save(name,data) {
  await mkdir(privateDir,{recursive:true});
  const file=resolve(privateDir,name);
  await writeFile(file,data,{encoding:'utf8',flag:'wx',mode:0o600});
  console.log(`Fichier privé enregistré : ${file}`);
}
try {
  if (process.argv[2]==='secret') {
    await save('admin-secret.txt',randomBytes(32).toString('base64url')+'\n');
    console.log('Copiez ce secret dans Cloudflare sous ADMIN_TOKEN. Ne le publiez jamais.');
  } else {
    console.log('PyStats · administration privée du mini-test\n');
    const base=(SITE.apiBase || await ask('Adresse HTTPS du Worker : ')).replace(/\/$/,'');
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(base)) throw new Error('Adresse HTTPS du Worker invalide.');
    const secret=await hidden('Secret ADMIN_TOKEN (saisie masquée) : ');
    if (secret.length<32) throw new Error('Secret trop court.');
    async function api(path,body) {
      const response=await fetch(`${base}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${secret}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error((await response.json()).error || `Erreur ${response.status}`);
      return response;
    }
    let running=true;
    while(running) {
      console.log('\n1 · Créer des invitations\n2 · Voir les passations et les suppressions\n3 · Exporter les réponses en CSV privé\n4 · Supprimer les données d’une passation\n0 · Quitter');
      const choice=await ask('Choix : ');
      const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
      if (choice==='1') {
        const count=Number(await ask('Combien d’invitations (1 à 100) ? '));
        if (!Number.isInteger(count)||count<1||count>100) {console.log('Nombre invalide.');continue;}
        const data=await (await api('/admin/invitations',{count})).json();
        await save(`invitations-${stamp}.json`,JSON.stringify(data,null,2));
        console.log('Envoyez un code différent à chaque adulte. Ils expirent dans 30 jours.');
      } else if(choice==='2') {
        const data=await (await api('/admin/sessions')).json();
        console.table(data.sessions);
        if(data.erasures.length) {console.log('Demandes à répercuter dans TOUS vos anciens exports :');console.table(data.erasures);}
      } else if(choice==='3') {
        await save(`resultats-${stamp}.csv`,await (await api('/admin/export')).text());
        const summary=await (await api('/admin/summaries')).json();
        const fields=['id','state','expires_at','answered','copyCorrect','tablesCorrect','pairs','copySeconds','tablesSeconds','differenceSeconds'];
        const quoted=value=>'"'+String(value??'').replaceAll('"','""')+'"';
        await save(`bilans-${stamp}.csv`,'\uFEFF'+[fields.join(';'),...summary.summaries.map(row=>fields.map(f=>quoted(row[f])).join(';'))].join('\r\n'));
        console.log(`Écart moyen (poids égal par participant complet, ${summary.includedParticipants} inclus) : ${summary.meanDifferenceSeconds===null?'non calculable':summary.meanDifferenceSeconds.toFixed(3)+' s'}`);
        console.log('Les colonnes first_ms, last_ms et enter_ms sont en millisecondes. Respectez les dates expires_at.');
        const {erasures}=await (await api('/admin/sessions')).json();
        if(erasures.length) {console.log('Supprimez aussi ces identifiants de vos anciens fichiers :');console.table(erasures);}
      } else if(choice==='4') {
        const id=await ask('Identifiant de la passation : ');
        if(await ask('Supprimer définitivement les réponses ? Écrire SUPPRIMER : ')==='SUPPRIMER') {
          await api('/admin/delete',{id}); console.log('Données supprimées de la base active. Retirez aussi cet identifiant de vos exports locaux.');
        }
      } else if(choice==='0') running=false;
    }
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
