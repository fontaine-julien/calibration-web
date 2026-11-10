import {generateProtocol, publicItem, validateAnswer, summarize} from './protocol.mjs';

const DAY = 86400000;
export const NOTICE_VERSION = '2026-11-10.1';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export function token() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
}
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function fail(status, message) { throw new HttpError(status, message); }
async function bodyOf(request) {
  // Read at most 40 KiB, even if Content-Length is missing or false.
  if (Number(request.headers.get('content-length')) > 40960) fail(413, 'Requête trop volumineuse.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON requis.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Corps manquant.');
  let length = 0, chunks = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 40960) { await reader.cancel(); fail(413, 'Requête trop volumineuse.'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'JSON invalide.'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(400, 'Objet JSON requis.');
  return value;
}
function bearer(request) { return request.headers.get('authorization')?.replace(/^Bearer /, '') || ''; }
async function requireAdmin(request, env) {
  const supplied = bearer(request);
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32 || supplied.length > 200) fail(401, 'Accès refusé.');
  const a = await hash(supplied), b = await hash(env.ADMIN_TOKEN);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (diff) fail(401, 'Accès refusé.');
}
async function config(env) {
  const days = Number(env.RETENTION_DAYS || 180);
  const contact = env.CONTACT_EMAIL || '';
  const valid = (!contact || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) && Number.isInteger(days) && days >= 1 && days <= 365;
  return {ready:valid && env.PRIVACY_REVIEWED === 'true', contact, retentionDays:days,
    consentVersion:await hash(`${NOTICE_VERSION}|${contact}|${days}`), noticeVersion:NOTICE_VERSION,
    owner:'Julien Fontaine', adultsOnly:true, itemsPerBlock:50};
}
async function person(request, env, rights = false) {
  const credential = bearer(request);
  if (!tokenPattern.test(credential)) fail(401, 'Clé absente ou invalide.');
  const field = rights ? 'rights_hash' : 'token_hash';
  const p = await env.DB.prepare(`SELECT * FROM participants WHERE ${field} = ? AND expires_at > ?`)
    .bind(await hash(credential), Date.now()).first();
  if (!p) fail(401, 'Clé inconnue, données supprimées ou conservation expirée.');
  return p;
}
function status(p) { return {id:p.id, state:p.state, nextIndex:p.next_index}; }
async function trials(env, id) {
  return (await env.DB.prepare('SELECT * FROM trials WHERE participant_id = ? ORDER BY item_index').bind(id).all()).results;
}
async function campaign(env, p) {
  const row = await env.DB.prepare('SELECT items_json FROM protocols WHERE id = ?').bind(p.protocol_id).first();
  if (!row) fail(503, 'Protocole indisponible.');
  return JSON.parse(row.items_json);
}
async function participantData(env, p) {
  const rows = await trials(env, p.id);
  // No answer key is sent to participants, including via the data-access route.
  const data = rows.map(({expected, correct, request_hash, ...rest}) => ({...rest, events:JSON.parse(rest.events_json), events_json:undefined}));
  return {id:p.id, state:p.state, consentAt:p.consent_at, consentVersion:p.consent_version,
    expiresAt:p.expires_at, pauseMs:p.pause_ms, interruption:p.interruption,
    summary:p.state === 'completed' ? summarize(rows) : null, trials:data};
}
export async function cleanup(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM erasures WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM participants WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM invitations WHERE expires_at <= ? AND NOT EXISTS (SELECT 1 FROM participants WHERE participants.id = invitations.id)').bind(now)
  ]);
}
function csv(rows) {
  const fields = ['participant_id','state','protocol_id','consent_at','consent_version','expires_at','pause_ms','interruption',
    'item_index','phase','pair_id','a','b','expected','answer','correct','first_ms','last_ms','enter_ms','corrections'];
  const cell = v => '"' + String(v ?? '').replaceAll('"','""') + '"';
  return '\uFEFF' + [fields.join(';'), ...rows.map(r => fields.map(f => cell(r[f])).join(';'))].join('\r\n');
}
async function route(request, env, url) {
  const path = url.pathname;
  if (request.method === 'GET' && path === '/config') return config(env);
  if (path.startsWith('/admin/')) {
    await requireAdmin(request, env);
    if (request.method === 'POST' && path === '/admin/invitations') {
      if (!(await config(env)).ready) fail(503, 'Vérifier les réglages et valider PRIVACY_REVIEWED avant toute invitation.');
      const {count = 1} = await bodyOf(request);
      if (!Number.isInteger(count) || count < 1 || count > 100) fail(400, 'Entre 1 et 100 invitations.');
      // One immutable server-side campaign for everyone. Nothing is returned about its sequence.
      await env.DB.prepare('INSERT OR IGNORE INTO protocols (id, items_json, created_at) VALUES (?, ?, ?)')
        .bind('campaign-1', JSON.stringify(generateProtocol()), Date.now()).run();
      const result = [];
      for (let i = 0; i < count; i++) {
        const code = token(), id = crypto.randomUUID();
        const expiresAt = Date.now() + 30 * DAY;
        await env.DB.prepare('INSERT INTO invitations (id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
          .bind(id, await hash(code), Date.now(), expiresAt).run();
        result.push({id, code, expiresAt});
      }
      return {invitations:result};
    }
    if (request.method === 'GET' && path === '/admin/sessions') {
      await cleanup(env);
      return {erasures:(await env.DB.prepare('SELECT participant_id, requested_at FROM erasures ORDER BY requested_at').all()).results,
        sessions:(await env.DB.prepare(`SELECT i.id, i.created_at, i.expires_at AS invitation_expires_at,
        i.consumed, p.state, p.next_index, p.consent_at, p.expires_at, p.interruption
        FROM invitations i LEFT JOIN participants p ON p.id = i.id ORDER BY i.created_at DESC`).all()).results};
    }
    if (request.method === 'GET' && path === '/admin/export') {
      await cleanup(env);
      const rows = (await env.DB.prepare(`SELECT t.*, p.state, p.protocol_id, p.consent_at, p.consent_version,
        p.expires_at, p.pause_ms, p.interruption FROM trials t JOIN participants p ON p.id = t.participant_id
        ORDER BY t.participant_id, t.item_index`).all()).results;
      return new Response(csv(rows), {headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="etalonnage.csv"'}});
    }
    if (request.method === 'GET' && path === '/admin/summaries') {
      await cleanup(env);
      const people = (await env.DB.prepare('SELECT id, state, expires_at FROM participants ORDER BY consent_at').all()).results;
      const rows = (await env.DB.prepare('SELECT * FROM trials ORDER BY participant_id, item_index').all()).results;
      const grouped = new Map();
      for (const row of rows) { if (!grouped.has(row.participant_id)) grouped.set(row.participant_id,[]); grouped.get(row.participant_id).push(row); }
      const summaries = people.map(p => ({...p,...summarize(grouped.get(p.id) || [])}));
      const complete = summaries.filter(p => p.state === 'completed' && p.differenceSeconds !== null);
      return {summaries, includedParticipants:complete.length,
        meanDifferenceSeconds:complete.length ? complete.reduce((sum,p) => sum + p.differenceSeconds,0) / complete.length : null};
    }
    if (request.method === 'POST' && path === '/admin/delete') {
      const {id} = await bodyOf(request);
      if (typeof id !== 'string' || id.length > 40) fail(400, 'Identifiant invalide.');
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO erasures (participant_id, requested_at, expires_at)
          SELECT id, ?, expires_at FROM participants WHERE id = ?`).bind(Date.now(),id),
        env.DB.prepare('DELETE FROM participants WHERE id = ?').bind(id),
        env.DB.prepare('UPDATE invitations SET consumed = 1 WHERE id = ?').bind(id)
      ]);
      return {deleted:true};
    }
    fail(404, 'Route inconnue.');
  }
  if (request.method === 'POST' && path === '/claim') {
    const c = await config(env);
    if (!c.ready) fail(503, 'Les inscriptions ne sont pas encore ouvertes.');
    const b = await bodyOf(request);
    if (b.consent !== true || b.adult !== true || b.consentVersion !== c.consentVersion) fail(400, 'Lire et accepter la notice actuelle et confirmer votre majorité.');
    if (![b.code, b.sessionToken, b.rightsToken].every(v => typeof v === 'string' && tokenPattern.test(v))) fail(400, 'Code ou clé invalide.');
    if (b.sessionToken === b.rightsToken || b.code === b.sessionToken || b.code === b.rightsToken) fail(400, 'Clés distinctes requises.');
    const codeHash = await hash(b.code), sessionHash = await hash(b.sessionToken), rightsHash = await hash(b.rightsToken);
    const now = Date.now();
    // The batch is transactional: two claims cannot consume the same invitation.
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO participants
        (id, protocol_id, token_hash, rights_hash, consent_version, consent_at, expires_at, retention_days, state)
        SELECT id, 'campaign-1', ?, ?, ?, ?, ?, ?, 'ready' FROM invitations
        WHERE code_hash = ? AND consumed = 0 AND expires_at > ?`)
        .bind(sessionHash, rightsHash, c.consentVersion, now, now + c.retentionDays * DAY, c.retentionDays, codeHash, now),
      env.DB.prepare(`UPDATE invitations SET consumed = 1 WHERE code_hash = ? AND EXISTS
        (SELECT 1 FROM participants p WHERE p.id = invitations.id AND p.token_hash = ? AND p.rights_hash = ?)`)
        .bind(codeHash, sessionHash, rightsHash)
    ]);
    const p = await env.DB.prepare(`SELECT p.* FROM participants p JOIN invitations i ON i.id = p.id
      WHERE i.code_hash = ? AND p.token_hash = ? AND p.rights_hash = ? AND p.expires_at > ?`)
      .bind(codeHash, sessionHash, rightsHash, now).first();
    if (!p) fail(409, 'Invitation inconnue, expirée ou déjà utilisée.');
    return {...status(p), expiresAt:p.expires_at};
  }
  if (path.startsWith('/rights/')) {
    const p = await person(request, env, true);
    if (request.method === 'GET' && path === '/rights/data') return participantData(env, p);
    if (request.method === 'POST' && path === '/rights/delete') {
      const b = await bodyOf(request);
      if (b.confirm !== true) fail(400, 'Confirmation requise.');
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO erasures (participant_id, requested_at, expires_at) VALUES (?, ?, ?)').bind(p.id,Date.now(),p.expires_at),
        env.DB.prepare('DELETE FROM participants WHERE id = ?').bind(p.id)
      ]);
      return {deleted:true};
    }
    fail(404, 'Route inconnue.');
  }
  const p = await person(request, env);
  if (request.method === 'GET' && path === '/status') return status(p);
  if (request.method === 'POST' && path === '/begin') {
    if (!['ready','pause'].includes(p.state)) fail(409, 'Ce bloc est déjà commencé.');
    const now = Date.now();
    await env.DB.prepare(`UPDATE participants SET state = 'active', pause_ms = CASE WHEN state = 'pause' THEN ? - pause_at ELSE pause_ms END
      WHERE id = ? AND state = ?`).bind(now, p.id, p.state).run();
    return {state:'active'};
  }
  if (request.method === 'POST' && path === '/item') {
    if (p.state !== 'active') fail(409, 'Aucun item actif.');
    const items = await campaign(env, p);
    // Repeated fetches return the same item. No query parameter allows arbitrary indexing.
    await env.DB.prepare('UPDATE participants SET nonce = ?, served_at = ? WHERE id = ? AND nonce IS NULL AND state = ? AND next_index = ?')
      .bind(token(), Date.now(), p.id, 'active', p.next_index).run();
    const latest = await env.DB.prepare('SELECT * FROM participants WHERE id = ?').bind(p.id).first();
    if (!latest || latest.state !== 'active' || latest.next_index !== p.next_index) fail(409, 'État modifié.');
    return publicItem(items[p.next_index], p.next_index, latest.nonce);
  }
  if (request.method === 'POST' && path === '/answer') {
    const b = await bodyOf(request);
    if (!Number.isInteger(b.index) || b.index < 0 || b.index > 99) fail(400, 'Index invalide.');
    const fingerprint = await hash(JSON.stringify(b));
    const prior = await env.DB.prepare('SELECT request_hash FROM trials WHERE participant_id = ? AND item_index = ?').bind(p.id, b.index).first();
    if (prior) {
      if (prior.request_hash !== fingerprint) fail(409, 'Cette réponse est déjà enregistrée.');
      return status(p);
    }
    if (p.state !== 'active' || b.index !== p.next_index || !p.nonce || b.nonce !== p.nonce) fail(409, 'Item non autorisé.');
    const items = await campaign(env, p), item = items[b.index];
    const m = validateAnswer(b, item);
    if (!m) fail(400, 'Saisie ou chronométrage invalide.');
    if (m.enter > Date.now() - p.served_at + 1500) fail(400, 'Chronométrage incohérent.');
    const now = Date.now(), next = b.index + 1;
    const newState = next === 50 ? 'pause' : next === 100 ? 'completed' : 'active';
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO trials
        (participant_id,item_index,pair_id,phase,a,b,expected,answer,correct,first_ms,last_ms,enter_ms,corrections,events_json,request_hash,received_at)
        SELECT id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM participants
        WHERE id = ? AND state = 'active' AND next_index = ? AND nonce = ?`)
        .bind(b.index,item.pair,item.phase,item.a,item.b,String(item.a*item.b),m.answer,m.correct,m.first,m.last,m.enter,m.corrections,JSON.stringify(b.events),fingerprint,now,p.id,b.index,b.nonce),
      env.DB.prepare(`UPDATE participants SET next_index = ?, state = ?, nonce = NULL, served_at = NULL,
        pause_at = CASE WHEN ? = 'pause' THEN ? ELSE pause_at END,
        ended_at = CASE WHEN ? = 'completed' THEN ? ELSE ended_at END
        WHERE id = ? AND next_index = ? AND state = 'active' AND EXISTS
        (SELECT 1 FROM trials WHERE participant_id = ? AND item_index = ? AND request_hash = ?)`)
        .bind(next,newState,newState,now,newState,now,p.id,b.index,p.id,b.index,fingerprint)
    ]);
    const written = await env.DB.prepare('SELECT request_hash FROM trials WHERE participant_id = ? AND item_index = ?').bind(p.id,b.index).first();
    if (!written || written.request_hash !== fingerprint) fail(409, 'Réponse concurrente ou passation interrompue.');
    return status(await env.DB.prepare('SELECT * FROM participants WHERE id = ?').bind(p.id).first());
  }
  if (request.method === 'POST' && path === '/interrupt') {
    const {reason} = await bodyOf(request);
    const allowed = ['fullscreen','hidden','blur','escape','reload','network','voluntary','input_limit'];
    await env.DB.prepare(`UPDATE participants SET state = 'interrupted', interruption = ?, ended_at = ?, nonce = NULL
      WHERE id = ? AND state IN ('ready','active','pause')`).bind(allowed.includes(reason) ? reason : 'voluntary', Date.now(), p.id).run();
    return {state:'interrupted'};
  }
  if (request.method === 'GET' && path === '/result') {
    if (p.state !== 'completed') fail(409, 'Bilan disponible à la fin uniquement.');
    return {id:p.id, summary:summarize(await trials(env,p.id))};
  }
  fail(404, 'Route inconnue.');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const headers = new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin',
      'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
    if (origin && origin === env.PUBLIC_ORIGIN) {
      headers.set('Access-Control-Allow-Origin',origin);
      headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers','Content-Type, Authorization');
      headers.set('Access-Control-Max-Age','600');
    }
    if (origin && origin !== env.PUBLIC_ORIGIN) return new Response(JSON.stringify({error:'Origine refusée.'}),{status:403,headers});
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    try {
      const result = await route(request, env, new URL(request.url));
      if (result instanceof Response) {
        for (const [k,v] of headers) if (k !== 'content-type') result.headers.set(k,v);
        return result;
      }
      return new Response(JSON.stringify(result),{headers});
    } catch (error) {
      // Do not log request bodies, tokens, answers or database errors.
      return new Response(JSON.stringify({error:error instanceof HttpError ? error.message : 'Service temporairement indisponible.'}),
        {status:error instanceof HttpError ? error.status : 503,headers});
    }
  },
  async scheduled(_event, env, ctx) { ctx.waitUntil(cleanup(env)); }
};
