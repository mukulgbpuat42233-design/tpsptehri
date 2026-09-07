// Vercel serverless proxy for Tehri PSP Supabase Auth + database.
// Only the publishable key is used here; NEVER put a Supabase secret/service-role key in this file.
const SUPABASE_URL = process.env.TEHRI_SUPABASE_URL || 'https://kpknazwugehnohojixtl.supabase.co';
const SUPABASE_KEY = process.env.TEHRI_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_iFnVavidtYI2vODRItISkA_YqGxH1zR';

function json(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

async function supa(path, options = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    ...(options.headers || {})
  };
  const r = await fetch(SUPABASE_URL + path, { ...options, headers });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

function userIdFromJwt(token) {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const jsonText = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(jsonText).sub || null;
  } catch (_) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const action = body.action;

    // Auth actions are server-to-server, so browser CORS/preflight to Supabase is avoided.
    if (action === 'login') {
      const r = await supa('/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: body.email, password: body.password })
      });
      return json(res, r.status, r.data);
    }

    if (action === 'signup') {
      const r = await supa('/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: body.email, password: body.password })
      });
      return json(res, r.status, r.data);
    }

    if (action === 'refresh') {
      const r = await supa('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: body.refresh_token })
      });
      return json(res, r.status, r.data);
    }

    const token = body.access_token;
    if (!token) return json(res, 401, { error: 'Login required' });
    const userId = userIdFromJwt(token);
    if (!userId) return json(res, 401, { error: 'Invalid session token' });

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    };

    if (action === 'list') {
      const r = await supa('/rest/v1/psp_monthly_data?select=*', {
        method: 'GET',
        headers: authHeaders
      });
      return json(res, r.status, { rows: r.data });
    }

    if (action === 'get') {
      const recordKey = encodeURIComponent(String(body.record_key || ''));
      const r = await supa('/rest/v1/psp_monthly_data?select=*&record_key=eq.' + recordKey + '&limit=1', {
        method: 'GET',
        headers: authHeaders
      });
      const rows = Array.isArray(r.data) ? r.data : [];
      return json(res, r.status, { record: rows[0]?.record || null });
    }

    if (action === 'save') {
      const recordKey = String(body.record_key || '');
      const r = await supa('/rest/v1/psp_monthly_data?on_conflict=user_id,record_key', {
        method: 'POST',
        headers: {
          ...authHeaders,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ user_id: userId, record_key: recordKey, record: body.record })
      });
      return json(res, r.status, r.ok ? { ok: true } : r.data);
    }

    if (action === 'delete') {
      const recordKey = encodeURIComponent(String(body.record_key || ''));
      const r = await supa('/rest/v1/psp_monthly_data?record_key=eq.' + recordKey, {
        method: 'DELETE',
        headers: { ...authHeaders, Prefer: 'return=minimal' }
      });
      return json(res, r.status, r.ok ? { ok: true } : r.data);
    }

    if (action === 'deleteAll') {
      // RLS limits this DELETE to rows belonging to the authenticated user.
      const r = await supa('/rest/v1/psp_monthly_data?id=not.is.null', {
        method: 'DELETE',
        headers: { ...authHeaders, Prefer: 'return=minimal' }
      });
      return json(res, r.status, r.ok ? { ok: true } : r.data);
    }

    return json(res, 400, { error: 'Unknown action' });
  } catch (e) {
    console.error('Supabase proxy error:', e);
    return json(res, 502, { error: e?.message || 'Supabase proxy failed' });
  }
};
