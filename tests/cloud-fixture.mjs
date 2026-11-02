import { readFile } from 'node:fs/promises';
import { readBundledCatalog, catalogRows } from '../.cache/tools/scripts/export-supabase-catalog.mjs';

export const alice = '11111111-1111-4111-8111-111111111111';
export const bob = '22222222-2222-4222-8222-222222222222';
const bundled = readBundledCatalog(await readFile(new URL('../cards.js', import.meta.url), 'utf8'));
export const sample = catalogRows(bundled).find(row => row.finishes.includes('normal') && row.finishes.includes('foil'));
export function session(userId = alice) {
  const email = userId === alice ? 'alice@example.test' : 'bob@example.test';
  const user = { id: userId, email, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const access_token = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:userId,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})}.test`;
  return { user, access_token, refresh_token: `test-${userId}`, token_type: 'bearer', expires_in: 3600 };
}
export function collectionRow(userId = alice, id = sample.id, normal = 0) {
  return { user_id: userId, variant_id: id, normal, foil: 0, image_override: null, revision: 0, updated_at: new Date().toISOString() };
}

/** A deterministic Auth/PostgREST wire fixture, not a substitute for PostgreSQL RLS tests. */
export function apiFixture(catalog = [{...sample, active:true}], initial = []) {
  const state = { catalog, rows: new Map(initial.map(row => [`${row.user_id}:${row.variant_id}`, structuredClone(row)])),
    calls: [], loseWrite: false, failRead: false, pause: null, pauseWrite: null };
  state.fetch = async (input, init = {}) => {
    const url = new URL(String(input)), method = init.method || 'GET', headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : null;
    const path = url.pathname, query = url.searchParams;
    state.calls.push({path, method, body, query});
    const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
    const jwt = headers.get('Authorization')?.split(' ')[1];
    const userId = jwt?.includes('.') ? JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).sub : alice;
    if (path === '/auth/v1/token') return json(session(body.email === 'bob@example.test' ? bob : alice));
    if (path === '/auth/v1/signup') return json({user:session(alice).user});
    if (path === '/auth/v1/logout') return new Response(null, {status:204});
    if (path === '/auth/v1/user') return json(session(userId).user);
    if (method === 'GET') {
      if (state.pause) await state.pause;
      if (state.failRead) return json({code:'42501',message:'Read denied'},403);
      let rows;
      if (path.endsWith('/catalog_variants')) rows = state.catalog;
      else if (path.endsWith('/collection_items')) rows = [...state.rows.values()].filter(row=>row.user_id === query.get('user_id')?.slice(3));
      else throw new Error(`Unexpected GET ${url}`);
      // Deliberately cap pages below the client's requested size.
      const offset = Number(query.get('offset') || 0);
      return json(rows.slice(offset, offset + Math.min(400, Number(query.get('limit') || 1000))));
    }
    if (path.endsWith('/rpc/adjust_collection_quantity')) {
      const key = `${userId}:${body.p_variant_id}`;
      const row = state.rows.get(key) || collectionRow(userId, body.p_variant_id);
      row[body.p_finish] += body.p_delta; row.revision++;
      state.rows.set(key, row);
      if (state.pauseWrite) await state.pauseWrite;
      if (state.loseWrite) { state.loseWrite = false; throw new TypeError('Response lost after commit'); }
      return json(row);
    }
    if (path.endsWith('/collection_items')) {
      let row;
      if (method === 'POST') {
        const key = `${body.user_id}:${body.variant_id}`;
        if (state.rows.has(key)) return json({code:'23505',message:'Duplicate'},409);
        row = {...collectionRow(body.user_id, body.variant_id), ...body};
        state.rows.set(key,row);
      } else if (method === 'PATCH') {
        const key = `${query.get('user_id')?.slice(3)}:${query.get('variant_id')?.slice(3)}`;
        row = state.rows.get(key);
        if (!row || row.revision !== Number(query.get('revision')?.slice(3))) return json([]);
        Object.assign(row, body); row.revision++;
      } else throw new Error(`Unexpected write ${method}`);
      return json(headers.get('Accept')?.includes('object') ? row : [row]);
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  return state;
}
