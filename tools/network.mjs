export async function requestApi(base,path,{body,key}={},fetcher=fetch) {
  let response;
  try {
    response=await fetcher(`${base}${path}`,{
      method:body===undefined?'GET':'POST',
      headers:{...(key?{Authorization:`Bearer ${key}`} : {}),...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)
    });
  } catch(error) {
    const code=error.cause?.code;
    if(code==='ENOTFOUND') throw new Error(`Adresse du Worker introuvable (DNS) : ${base}. Copiez l’URL exacte affichée par wrangler deploy dans docs/config.js. Le sous-domaine Cloudflare peut différer du nom GitHub.`);
    if(error.name==='TimeoutError' || code==='UND_ERR_CONNECT_TIMEOUT') throw new Error(`Le serveur ${base} ne répond pas dans le délai prévu. Vérifiez la connexion et réessayez.`);
    if(['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN'].includes(code)) throw new Error(`La connexion sécurisée à ${base} n’a pas pu être vérifiée. Vérifiez le certificat et la configuration réseau sans désactiver TLS.`);
    throw new Error(`Connexion impossible à ${base}${code ? ` (${code})` : ''}. Vérifiez l’adresse du Worker et votre connexion.`);
  }
  if(!response.ok) {
    let message;
    try { message=(await response.json()).error; } catch {}
    throw new Error(typeof message==='string'?message:`Le serveur répond HTTP ${response.status}. Vérifiez le déploiement et l’adresse du Worker.`);
  }
  return response;
}
