(function () {
  const cfg = window.FFI_CONFIG || {}; const SK = 'ffi_sb_session';
  const lang = () => localStorage.getItem('suite_lang') === 'ar' ? 'ar' : 'en';
  const H = tok => ({ apikey: cfg.SUPABASE_ANON, Authorization: 'Bearer ' + (tok || cfg.SUPABASE_ANON), 'Content-Type': 'application/json' });
  let sess = null; try { sess = JSON.parse(localStorage.getItem(SK) || 'null'); } catch (e) { }
  let sync = 'off';
  async function setSession(s) { sess = s; localStorage.setItem(SK, JSON.stringify(s)); }
  async function fetchUser() {
    const r = await fetch(cfg.SUPABASE_URL + '/auth/v1/user', { headers: H(sess.access_token) });
    if (r.status === 401 && sess.refresh_token) { const rr = await fetch(cfg.SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: H(), body: JSON.stringify({ refresh_token: sess.refresh_token }) }); if (!rr.ok) throw 0; const j = await rr.json(); await setSession({ access_token: j.access_token, refresh_token: j.refresh_token }); return fetchUser(); }
    if (!r.ok) throw 0; return r.json();
  }
  async function init() {
    if (location.hash.includes('access_token=')) {
      const p = new URLSearchParams(location.hash.slice(1)); await setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') });
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (!sess) return;
    try { const u = await fetchUser(); window.FFI_USER = { email: (u.email || '').toLowerCase(), name: (u.user_metadata && u.user_metadata.full_name) || u.email, id: u.id }; await pull(); }
    catch (e) { localStorage.removeItem(SK); sess = null; }
    window.FFI_RENDER && window.FFI_RENDER();
  }
  const KEYS = ['saved', 'scenarios', 'quotes', 'batches', 'inv', 'market', 'ing', 'qty', 'currency', 'plantP', 'tol'];
  async function pull() {
    try {
      const r = await fetch(cfg.SUPABASE_URL + '/rest/v1/feed_state?user_id=eq.' + window.FFI_USER.id + '&select=data', { headers: H(sess.access_token) });
      if (!r.ok) { sync = 'err'; return; }
      const rows = await r.json(); sync = 'ok';
      if (rows[0] && rows[0].data) { const S = window.FFI_STATE(); KEYS.forEach(k => { if (rows[0].data[k] !== undefined) S[k] = rows[0].data[k]; }); S.opt = null; window.FFI_PERSIST && window.FFI_PERSIST(true); }
    } catch (e) { sync = 'err'; }
  }
  let tm = null;
  window.FFI_PUSH = function () {
    if (!window.FFI_USER || !sess || sync === 'err') return; clearTimeout(tm);
    tm = setTimeout(async () => {
      const S = window.FFI_STATE(), data = {}; KEYS.forEach(k => data[k] = S[k]);
      try { const r = await fetch(cfg.SUPABASE_URL + '/rest/v1/feed_state?on_conflict=user_id', { method: 'POST', headers: Object.assign(H(sess.access_token), { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ user_id: window.FFI_USER.id, data, updated_at: new Date().toISOString() }) }); sync = r.ok ? 'ok' : 'err'; } catch (e) { sync = 'err'; }
    }, 1200);
  };
  window.FFI_AUTH = {
    mount(el) {
      if (!el) return; const ar = lang() === 'ar';
      if (window.FFI_USER) {
        const st = sync === 'ok' ? (ar ? 'محفوظ سحابياً' : 'Cloud saved') : sync === 'err' ? (ar ? 'الحفظ المحلي فقط' : 'Local save only') : '';
        el.innerHTML = '<small class="muted">' + st + '</small> <button class="btn ghost" id="so">' + (ar ? 'تسجيل الخروج' : 'Sign out') + '</button>';
        el.querySelector('#so').onclick = () => { localStorage.removeItem(SK); sess = null; window.FFI_USER = null; location.reload(); };
      } else {
        el.innerHTML = '<button class="btn" id="si">' + (ar ? 'تسجيل الدخول بجوجل' : 'Sign in with Google') + '</button>';
        el.querySelector('#si').onclick = () => { location.href = cfg.SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(cfg.REDIRECT); };
      }
    }
  };
  init();
})();
