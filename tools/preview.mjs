// Local-only preview: in-memory database, synthetic invitation, no real collection.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import worker,{token} from '../worker/index.mjs';
import {database} from '../tests/d1-adapter.mjs';

const env={DB:database(),ADMIN_TOKEN:token(),PUBLIC_ORIGIN:'http://127.0.0.1:8787',CONTACT_EMAIL:'',RETENTION_DAYS:'180',PRIVACY_REVIEWED:'true'};
const origin=env.PUBLIC_ORIGIN, root=fileURLToPath(new URL('../docs/',import.meta.url));
const server=http.createServer(async(req,res)=> {
  try {
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')) {
      let bytes=[],length=0;
      for await(const chunk of req) {length+=chunk.length;if(length>40960){res.writeHead(413).end();return;}bytes.push(chunk);}
      const request=new Request(origin+url.pathname.slice(4)+url.search,{method:req.method,headers:req.headers,
        body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(bytes)});
      const response=await worker.fetch(request,env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(req.method!=='GET'){res.writeHead(405).end();return;}
    const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const path=resolve(root,'.'+pathname);
    if(!path.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
    let content=await readFile(path);
    if(pathname==='/config.js') content=Buffer.from(content.toString().replace("apiBase: ''",`apiBase: '${origin}/api'`));
    if(pathname==='/index.html') content=Buffer.from(content.toString().replace('Une exploration du rappel en mémoire','Aperçu local · aucune collecte réelle'));
    const type=pathname.endsWith('.html')?'text/html':pathname.endsWith('.css')?'text/css':pathname.endsWith('.js')?'text/javascript':'text/plain';
    res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(content);
  } catch {res.writeHead(404).end('Introuvable');}
});
server.listen(8787,'127.0.0.1',async()=> {
  const result=await worker.fetch(new Request(origin+'/admin/invitations',{method:'POST',headers:{Authorization:`Bearer ${env.ADMIN_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({count:3})}),env);
  const data=await result.json();
  console.log(`Aperçu local : ${origin}\nDonnées temporaires, effacées à l’arrêt. Codes de démonstration :`);
  for(const invitation of data.invitations)console.log(invitation.code);
});
