(function () {
  const SUPABASE_URL = 'https://ccxfxhvvombajvbwlcfx.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_-EA58nzN0ENFZ29smGF2lA_hOqyAjxj';

  const IS_LOGIN = location.pathname.endsWith('/login.html');
  const COLS = { tasks: 'tasks', sessions: 'plannerSessions', grades: 'grades' }; // db column -> localStorage key
  const KEYS = Object.values(COLS);

  if (!IS_LOGIN) document.documentElement.style.visibility = 'hidden';
  const show = () => { document.documentElement.style.visibility = ''; };
  const onReady = fn =>
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb;

  let user = null, synced = false, timer = null;
  const dirty = new Set();

  // Any page save to these keys is also queued for the cloud
  const rawSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === localStorage && KEYS.includes(k)) {
      dirty.add(k);
      clearTimeout(timer);
      timer = setTimeout(push, 600);
    }
  };

  // Compare JSON ignoring key order (Postgres reorders keys)
  const canon = v => JSON.stringify(v, (k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x);

  async function push() {
    if (!user || !synced || !dirty.size) return;
    const keys = [...dirty];
    dirty.clear();
    const row = { user_id: user.id, updated_at: new Date().toISOString() };
    for (const [col, key] of Object.entries(COLS)) {
      if (keys.includes(key)) row[col] = JSON.parse(localStorage.getItem(key));
    }
    const { error } = await sb.from('user_data').upsert(row);
    if (error) {
      console.error('StudyAI save failed:', error.message);
      keys.forEach(k => dirty.add(k));
    }
  }

  // Cloud wins on page load; returns true if the page is reloading
  async function refresh() {
    const { data, error } = await sb.from('user_data')
      .select('tasks,sessions,grades').eq('user_id', user.id).maybeSingle();
    if (error) { console.error('StudyAI load failed:', error.message); return false; }

    let changed = false;
    for (const [col, key] of Object.entries(COLS)) {
      const cloud = data ? data[col] : null;
      if (cloud === null || cloud === undefined) continue; // nothing in cloud: local seeds get pushed
      const local = localStorage.getItem(key);
      if (local === null || canon(JSON.parse(local)) !== canon(cloud)) {
        rawSet.call(localStorage, key, JSON.stringify(cloud));
        changed = true;
      }
      dirty.delete(key);
    }

    synced = true;
    if (changed) {
      const last = +sessionStorage.getItem('studyai_reload') || 0;
      if (Date.now() - last > 5000) {
        sessionStorage.setItem('studyai_reload', Date.now());
        location.reload();
        return true;
      }
    }
    if (dirty.size) timer = setTimeout(push, 600);
    return false;
  }

  function personalise() {
    const name = (user.user_metadata && user.user_metadata.name) || user.email.split('@')[0];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const tag = n.parentElement && n.parentElement.tagName;
      if (tag !== 'SCRIPT' && tag !== 'STYLE' && n.nodeValue.includes('Cain')) {
        n.nodeValue = n.nodeValue.replace(/Cain/g, name);
      }
    });
    const av = document.querySelector('.avatar');
    if (av) av.textContent = name[0].toUpperCase();
  }

  function addLogout() {
    const side = document.querySelector('.sidebar');
    if (!side) return;
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'nav-item';
    a.style.marginTop = 'auto';
    a.innerHTML = '<span class="nav-icon">🚪</span> Log out';
    a.onclick = e => { e.preventDefault(); logout(); };
    side.appendChild(a);
  }

  function clearLocal() { KEYS.forEach(k => localStorage.removeItem(k)); }

  async function logout() {
    dirty.clear();
    clearTimeout(timer);
    await sb.auth.signOut();
    clearLocal();
    location.href = '/login.html';
  }

  window.DB = {
    clearLocal,
    logout,
    token: async () => {
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.access_token : null;
    },
  };

  (async function init() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (IS_LOGIN) { if (session) location.replace('/dashboard.html'); return; }
      if (!session) { location.replace('/login.html'); return; }
      user = session.user;
      if (await refresh()) return;
      onReady(() => { personalise(); addLogout(); });
    } catch (e) {
      console.error(e);
    }
    show();
  })();
})();