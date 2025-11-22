/* script.js — navigation fixed, full frontend CRUD (localStorage + server sync), delete, CSV export */

/* ---------- configuration ---------- */
const API_BASE = 'http://localhost:4000/api'; // change if your backend uses a different host/port
const PARENT_PDF_URL = '/mnt/data/PARENT DECLARATION.pdf'; // uploaded file path (server will map/serve it if configured)

/* ---------- data layer (users & transactions local) ---------- */
const api = {
  users: {
    getAll: () => JSON.parse(localStorage.getItem('ts_users') || '[]'),
    getById: (id) => api.users.getAll().find(u => u.id === id),
    getByUsername: (username) => api.users.getAll().find(u => u.username === username),
    create: (u) => {
      const list = api.users.getAll();
      u.id = 'user_' + Date.now();
      u.avatarColor = randomColor();
      list.push(u);
      localStorage.setItem('ts_users', JSON.stringify(list));
      return u;
    },
    update: (id, changes) => {
      const list = api.users.getAll();
      const i = list.findIndex(x => x.id === id);
      if (i === -1) return null;
      list[i] = {...list[i], ...changes};
      localStorage.setItem('ts_users', JSON.stringify(list));
      return list[i];
    }
  },

  /* temples object will be overwritten below with server-aware implementation */
  temples: {
    getAll: () => JSON.parse(localStorage.getItem('ts_temples') || '[]'),
    getById: (id) => api.temples.getAll().find(t => t.id === id),
    getByOwner: (uid) => api.temples.getAll().filter(t => t.ownerUserId === uid),
    create: (t) => { // placeholder until replaced below
      const list = api.temples.getAll();
      t.id = 'temple_' + Date.now();
      t.createdAt = new Date().toISOString();
      t.fund_received = t.fund_received || 0;
      list.push(t);
      localStorage.setItem('ts_temples', JSON.stringify(list));
      return t;
    },
    update: (id, changes) => {
      const list = api.temples.getAll();
      const i = list.findIndex(x => x.id === id);
      if (i === -1) return null;
      list[i] = {...list[i], ...changes};
      localStorage.setItem('ts_temples', JSON.stringify(list));
      return list[i];
    },
    delete: (id) => {
      const list = api.temples.getAll().filter(x => x.id !== id);
      localStorage.setItem('ts_temples', JSON.stringify(list));
    }
  },

  transactions: {
    getAll: () => JSON.parse(localStorage.getItem('ts_tx') || '[]'),
    getById: (id) => api.transactions.getAll().find(x => x.id === id),
    getByDonor: (donorId) => api.transactions.getAll().filter(x => x.donorId === donorId),
    getByTemple: (templeId) => api.transactions.getAll().filter(x => x.templeId === templeId),
    create: (tx) => {
      const list = api.transactions.getAll();
      tx.id = 'tx_' + Date.now();
      tx.timestamp = new Date().toISOString();
      list.push(tx);
      localStorage.setItem('ts_tx', JSON.stringify(list));
      return tx;
    },
    delete: (id) => {
      const list = api.transactions.getAll().filter(x => x.id !== id);
      localStorage.setItem('ts_tx', JSON.stringify(list));
    }
  }
};

/* ---------- helpers ---------- */
function randomColor(){ const p=['#2563eb','#06b6d4','#fb923c','#10b981','#ef4444','#7c3aed']; return p[Math.floor(Math.random()*p.length)]; }
function formatCurrency(n){ return '₹' + (Number(n)||0).toLocaleString('en-IN'); }
function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
function escapeHtml(s){ if(!s) return ''; return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }

/* ---------- server sync helpers for temples ---------- */
async function fetchTemplesFromServer(){
  try {
    const res = await fetch(`${API_BASE}/temples`);
    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    const list = await res.json();
    // replace local copy with server data
    localStorage.setItem('ts_temples', JSON.stringify(list));
    return list;
  } catch (err) {
    console.warn('fetchTemplesFromServer failed — falling back to localStorage', err);
    return JSON.parse(localStorage.getItem('ts_temples') || '[]');
  }
}

async function createTempleOnServer(temple){
  try {
    const res = await fetch(`${API_BASE}/temples`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(temple)
    });
    if (!res.ok) throw new Error('Create failed: ' + res.status);
    const created = await res.json();
    // merge into local storage (replace any temp id)
    const current = JSON.parse(localStorage.getItem('ts_temples') || '[]');
    const newList = current.filter(t => t.id !== temple.id).concat(created);
    localStorage.setItem('ts_temples', JSON.stringify(newList));
    return created;
  } catch (err) {
    console.warn('createTempleOnServer failed — temple saved locally only', err);
    return null;
  }
}

async function updateTempleOnServer(id, updates){
  try {
    const res = await fetch(`${API_BASE}/temples/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Update failed: ' + res.status);
    const updated = await res.json();
    // sync local
    const list = JSON.parse(localStorage.getItem('ts_temples') || '[]').map(t => t.id === id ? updated : t);
    localStorage.setItem('ts_temples', JSON.stringify(list));
    return updated;
  } catch (err) {
    console.warn('updateTempleOnServer failed — updated locally only', err);
    return null;
  }
}

async function deleteTempleOnServer(id){
  try {
    const res = await fetch(`${API_BASE}/temples/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed: ' + res.status);
    // remove from local
    const list = JSON.parse(localStorage.getItem('ts_temples') || '[]').filter(t => t.id !== id);
    localStorage.setItem('ts_temples', JSON.stringify(list));
    return true;
  } catch (err) {
    console.warn('deleteTempleOnServer failed — deleted locally only', err);
    return false;
  }
}

/* ---------- overwrite api.temples with server-aware implementation ---------- */
api.temples = {
  getAll: () => JSON.parse(localStorage.getItem('ts_temples') || '[]'),
  getById: (id) => api.temples.getAll().find(t => t.id === id),
  getByOwner: (uid) => api.temples.getAll().filter(t => t.ownerUserId === uid),

  create: (t) => {
    // optimistic local create
    const list = api.temples.getAll();
    if (!t.id) t.id = 'temple_' + Date.now();
    t.createdAt = t.createdAt || new Date().toISOString();
    t.fund_received = t.fund_received || 0;
    list.push(t);
    localStorage.setItem('ts_temples', JSON.stringify(list));

    // async push to server (fire & forget). If server returns, we sync local copy.
    (async () => {
      const created = await createTempleOnServer(t);
      if (created && created.id && created.id !== t.id) {
        // replace local temp id with server id
        const updated = api.temples.getAll().map(x => x.id === t.id ? created : x);
        localStorage.setItem('ts_temples', JSON.stringify(updated));
      }
    })();

    return t;
  },

  update: (id, changes) => {
    const list = api.temples.getAll();
    const i = list.findIndex(x => x.id === id);
    if (i === -1) return null;
    list[i] = {...list[i], ...changes};
    localStorage.setItem('ts_temples', JSON.stringify(list));
    // async server update
    (async () => {
      await updateTempleOnServer(id, list[i]);
    })();
    return list[i];
  },

  delete: (id) => {
    const list = api.temples.getAll().filter(x => x.id !== id);
    localStorage.setItem('ts_temples', JSON.stringify(list));
    // async server delete
    (async () => {
      await deleteTempleOnServer(id);
    })();
  }
};

/* ---------- auth (session) ---------- */
const auth = {
  current: null,
  init: () => {
    const s = sessionStorage.getItem('ts_current');
    if (s) auth.current = JSON.parse(s);
    renderAuth();
  },
  login: (username,password) => {
    const u = api.users.getByUsername(username);
    if (u && u.password === password){
      auth.current = u;
      sessionStorage.setItem('ts_current', JSON.stringify(u));
      renderAuth();
      return true;
    }
    return false;
  },
  logout: () => {
    auth.current = null;
    sessionStorage.removeItem('ts_current');
    renderAuth();
  },
  signup: (data) => {
    if (api.users.getByUsername(data.username)) return {success:false, message:'Username exists'};
    const u = api.users.create(data);
    if (data.role === 'temple_member') {
      api.temples.create({
        name: data.templeName || `${u.username} Temple`,
        description: data.templeDescription || '',
        location: data.templeLocation || '',
        ownerUserId: u.id,
        fund_needed: parseFloat(data.fundNeeded) || 0,
        fund_received: 0,
        images: []
      });
    }
    auth.current = u;
    sessionStorage.setItem('ts_current', JSON.stringify(u));
    renderAuth();
    return {success:true};
  },
  isAuth: () => !!auth.current,
  canEditTemple: (templeId) => {
    if (!auth.current) return false;
    const t = api.temples.getById(templeId);
    return t && t.ownerUserId === auth.current.id;
  },
  canDeleteTx: (tx) => {
    if (!auth.current) return false;
    if (auth.current.role === 'donor') return tx.donorId === auth.current.id;
    if (auth.current.role === 'temple_member') {
      const tm = api.temples.getById(tx.templeId);
      return tm && tm.ownerUserId === auth.current.id;
    }
    return false;
  }
};

/* ---------- UI & wiring ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  bindNav();
  bindActions();
  auth.init();
  // Initial server sync (will fallback to local if server unreachable)
  await fetchTemplesFromServer();
  ensureSampleData();
  renderAll();
});

/* Navigation wiring */
function bindNav(){
  document.querySelectorAll('.nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const page = a.dataset.page;
      showPage(page);
    });
  });
  const exploreBtn = document.getElementById('explore-temples-btn');
  if (exploreBtn) exploreBtn.addEventListener('click', ()=> showPage('temples'));
  const mobileToggle = document.getElementById('mobile-toggle');
  if (mobileToggle) mobileToggle.addEventListener('click', ()=> {
    const nav = document.getElementById('nav');
    if (nav) nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
  });
}

/* Actions wiring */
function bindActions(){
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', showLoginModal);
  const signupBtn = document.getElementById('signup-btn');
  if (signupBtn) signupBtn.addEventListener('click', showSignupModal);
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', ()=> { auth.logout(); showToast('Logged out'); renderAll(); });

  const searchEl = document.getElementById('search-temples');
  if (searchEl) searchEl.addEventListener('input', renderTemples);
  const filterLocation = document.getElementById('filter-location');
  if (filterLocation) filterLocation.addEventListener('change', renderTemples);
  const filterSort = document.getElementById('filter-sort');
  if (filterSort) filterSort.addEventListener('change', renderTemples);

  const addTempleBtn = document.getElementById('add-temple-btn');
  if (addTempleBtn) addTempleBtn.addEventListener('click', ()=> showTempleModal());
  const exportBtn = document.getElementById('export-csv-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportCSV);

  // Back buttons (if present)
  document.querySelectorAll('.back-btn').forEach(b => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const page = b.dataset.page || 'home';
      showPage(page);
    });
  });
}

/* Show page + accessibility states */
function showPage(page){
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.setAttribute('aria-hidden', 'true');
  });
  const elp = document.getElementById(page);
  if (elp) {
    elp.classList.add('active');
    elp.removeAttribute('aria-hidden');
  }
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  const nav = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (nav) nav.classList.add('active');

  if (page === 'home') renderHomeStats();
  if (page === 'temples') renderTemples();
  if (page === 'transactions') renderTransactions();
  if (page === 'dashboard') renderDashboard();
}

/* Render auth UI */
function renderAuth(){
  const authButtons = document.getElementById('auth-buttons');
  const userInfo = document.getElementById('user-info');
  if (auth.isAuth()){
    if (authButtons) authButtons.style.display = 'none';
    if (userInfo) userInfo.classList.remove('hidden');
    const usernameDisplay = document.getElementById('username-display'); if (usernameDisplay) usernameDisplay.textContent = auth.current.displayName || auth.current.username;
    const userRole = document.getElementById('user-role'); if (userRole) userRole.textContent = auth.current.role === 'temple_member' ? 'Temple Admin' : 'Donor';
    const avatar = document.getElementById('user-avatar'); if (avatar){ avatar.textContent = (auth.current.displayName || auth.current.username)[0].toUpperCase(); avatar.style.background = auth.current.avatarColor; }
    const addTempleBtn = document.getElementById('add-temple-btn'); if (addTempleBtn) addTempleBtn.classList.toggle('hidden', auth.current.role !== 'temple_member');
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (userInfo) userInfo.classList.add('hidden');
    const addTempleBtn = document.getElementById('add-temple-btn'); if (addTempleBtn) addTempleBtn.classList.add('hidden');
  }
}

/* Render home stats */
function renderHomeStats(){
  const statTemples = document.getElementById('stat-temples');
  if (statTemples) statTemples.textContent = api.temples.getAll().length;
  const totalDon = api.transactions.getAll().reduce((s,x)=>s+x.amount,0);
  const statDon = document.getElementById('stat-donations'); if (statDon) statDon.textContent = formatCurrency(totalDon);
  const statUsers = document.getElementById('stat-users'); if (statUsers) statUsers.textContent = api.users.getAll().length;
}

/* Temples rendering */
function renderTemples(){
  const container = document.getElementById('temples-list');
  if (!container) return;
  const q = (document.getElementById('search-temples')?.value || '').toLowerCase();
  const loc = (document.getElementById('filter-location')?.value || '').toLowerCase();
  const sort = document.getElementById('filter-sort')?.value;

  let temples = api.temples.getAll();
  if (q) temples = temples.filter(t => (t.name + ' ' + (t.description||'') + ' ' + (t.location||'')).toLowerCase().includes(q));
  if (loc) temples = temples.filter(t => (t.location||'').toLowerCase().includes(loc));
  if (sort === 'needed') temples.sort((a,b) => (b.fund_needed||0) - (a.fund_needed||0));
  if (sort === 'recent') temples.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sort === 'name') temples.sort((a,b) => a.name.localeCompare(b.name));

  container.innerHTML = '';
  if (!temples.length) { container.innerHTML = `<div class="table-card">No temples found.</div>`; return; }

  temples.forEach(t => {
    const card = document.createElement('div');
    card.className = 'card';
    const raised = t.fund_received || 0;
    const needed = t.fund_needed || 0;
    const pct = (raised + needed) > 0 ? Math.round((raised/(raised+needed))*100) : 100;
    card.innerHTML = `
      <div>
        <div class="temple-title">${escapeHtml(t.name)}</div>
        <div class="temple-desc">${escapeHtml(t.location || '')} • ${escapeHtml((t.description||'').slice(0,120))}${(t.description||'').length>120?'…':''}</div>
      </div>
      <div class="temple-meta">
        <div style="width:65%">
          <div class="progress" title="${formatCurrency(raised)} raised · ${formatCurrency(needed)} needed">
            <i style="width:${pct}%;"></i>
          </div>
          <div style="font-size:13px;color:var(--muted);margin-top:6px">
            <strong>${formatCurrency(raised)}</strong> raised • <span>${formatCurrency(needed)}</span> needed
          </div>
        </div>
        <div style="text-align:right">
          <div style="margin-bottom:8px">
            <button class="btn btn-outline view-btn" data-id="${t.id}" title="View temple"><i class="fas fa-eye"></i></button>
            <button class="btn btn-accent donate-btn" data-id="${t.id}" title="Donate"><i class="fas fa-donate"></i></button>
          </div>
          ${auth.canEditTemple(t.id) ? `<div><button class="btn btn-primary edit-btn" data-id="${t.id}"><i class="fas fa-edit"></i> Edit</button>
          <button class="btn btn-ghost danger-btn" data-id="${t.id}"><i class="fas fa-trash"></i></button></div>` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // events
  container.querySelectorAll('.donate-btn').forEach(b=> b.addEventListener('click', e=> openDonateModal(e.currentTarget.dataset.id)));
  container.querySelectorAll('.edit-btn').forEach(b=> b.addEventListener('click', e=> openTempleEdit(e.currentTarget.dataset.id)));
  container.querySelectorAll('.danger-btn').forEach(b=> b.addEventListener('click', e=> deleteTempleConfirm(e.currentTarget.dataset.id)));
  container.querySelectorAll('.view-btn').forEach(b=> b.addEventListener('click', e=> openTempleView(e.currentTarget.dataset.id)));
}

/* View temple (simple modal) */
function openTempleView(id){
  const t = api.temples.getById(id);
  if (!t) return showToast('Temple not found', true);
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3>${escapeHtml(t.name)}</h3><button class="btn btn-ghost close">×</button>
    </div>
    <div style="display:grid;gap:8px">
      <div><strong>Location:</strong> ${escapeHtml(t.location||'')}</div>
      <div><strong>Needed:</strong> ${formatCurrency(t.fund_needed||0)}</div>
      <div><strong>Received:</strong> ${formatCurrency(t.fund_received||0)}</div>
      <div style="margin-top:8px">${escapeHtml(t.description||'')}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button class="btn btn-ghost close">Close</button>
        <button class="btn btn-accent donate-btn" data-id="${t.id}">Donate</button>
      </div>
    </div>
  `;
  const card = showModal(html);
  card.querySelectorAll('.close').forEach(b=>b.addEventListener('click', closeModal));
  const donateBtn = card.querySelector('.donate-btn');
  if (donateBtn) donateBtn.addEventListener('click', ()=> { closeModal(); openDonateModal(t.id); });
}

/* Donate modal */
function openDonateModal(templeId){
  const t = api.temples.getById(templeId);
  if (!t) return showToast('Temple not found', true);
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Donate to ${escapeHtml(t.name)}</h3><button class="btn btn-ghost close">×</button></div>
    <form id="donate-form" style="display:grid;gap:10px">
      <input id="donate-amount" type="number" min="1" placeholder="Amount (₹)" class="input" required />
      <input id="donate-message" placeholder="Message (optional)" class="input" />
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost close">Cancel</button>
        <button type="submit" class="btn btn-accent">Donate</button>
      </div>
    </form>
  `;
  const card = showModal(html);
  card.querySelectorAll('.close').forEach(b=>b.addEventListener('click', closeModal));
  card.querySelector('#donate-form').addEventListener('submit', e=>{
    e.preventDefault();
    const amount = Number(card.querySelector('#donate-amount').value) || 0;
    const message = card.querySelector('#donate-message').value.trim();
    if (!auth.isAuth()){ closeModal(); showLoginModal(); return showToast('Please login to donate', true); }
    if (amount <= 0) return showToast('Enter a valid amount', true);
    api.transactions.create({ donorId: auth.current.id, templeId: t.id, amount, message, paymentMethod: 'online' });
    api.temples.update(t.id, { fund_received: (t.fund_received||0) + amount, fund_needed: Math.max(0, (t.fund_needed||0) - amount) });
    closeModal();
    showToast('Thank you for donating!');
    renderAll();
  });
}

/* Add temple modal */
function showTempleModal(){
  if (!auth.isAuth() || auth.current.role !== 'temple_member') return showToast('Only temple members can add a temple', true);
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Add Temple</h3><button class="btn btn-ghost close">×</button></div>
    <form id="temple-add-form" style="display:grid;gap:10px">
      <input id="temple-name" placeholder="Temple name" class="input" required />
      <input id="temple-location" placeholder="Location" class="input" />
      <textarea id="temple-desc" placeholder="Description" class="input"></textarea>
      <input id="temple-fund" type="number" placeholder="Fund needed (₹)" class="input" />
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost close">Cancel</button>
        <button type="submit" class="btn btn-primary">Create</button>
      </div>
    </form>
  `;
  const card = showModal(html);
  card.querySelectorAll('.close').forEach(b=>b.addEventListener('click', closeModal));
  card.querySelector('#temple-add-form').addEventListener('submit', async e=>{
    e.preventDefault();
    const name = card.querySelector('#temple-name').value.trim();
    const loc = card.querySelector('#temple-location').value.trim();
    const desc = card.querySelector('#temple-desc').value.trim();
    const fund = Number(card.querySelector('#temple-fund').value) || 0;
    const newTemple = { name, description: desc, location: loc, ownerUserId: auth.current.id, fund_needed: fund, fund_received: 0, images: [] };
    // Use optimistic local create and attempt server create in background
    api.temples.create(newTemple);
    closeModal();
    showToast('Temple created');
    renderAll();
  });
}

/* Edit temple */
function openTempleEdit(id){
  const t = api.temples.getById(id);
  if (!t) return showToast('Temple not found', true);
  if (!auth.canEditTemple(id)) return showToast('Not authorized', true);
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Edit ${escapeHtml(t.name)}</h3><button class="btn btn-ghost close">×</button></div>
    <form id="temple-edit-form" style="display:grid;gap:10px">
      <input id="temple-name" placeholder="Temple name" class="input" required value="${escapeHtml(t.name)}" />
      <input id="temple-location" placeholder="Location" class="input" value="${escapeHtml(t.location||'')}" />
      <textarea id="temple-desc" placeholder="Description" class="input">${escapeHtml(t.description||'')}</textarea>
      <input id="temple-fund" type="number" placeholder="Fund needed (₹)" class="input" value="${t.fund_needed||0}" />
      <div style="display:flex;gap:8px;justify-content:space-between">
        <div><button type="button" class="btn btn-ghost danger-delete">Delete temple</button></div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn btn-ghost close">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </div>
    </form>
  `;
  const card = showModal(html);
  card.querySelectorAll('.close').forEach(b=>b.addEventListener('click', closeModal));
  card.querySelector('.danger-delete').addEventListener('click', ()=> { closeModal(); deleteTempleConfirm(id); });
  card.querySelector('#temple-edit-form').addEventListener('submit', e=>{
    e.preventDefault();
    const name = card.querySelector('#temple-name').value.trim();
    const loc = card.querySelector('#temple-location').value.trim();
    const desc = card.querySelector('#temple-desc').value.trim();
    const fund = Number(card.querySelector('#temple-fund').value) || 0;
    api.temples.update(id, { name, location: loc, description: desc, fund_needed: fund });
    closeModal();
    showToast('Temple updated');
    renderAll();
  });
}

/* Delete temple */
function deleteTempleConfirm(id){
  if (!auth.canEditTemple(id)) return showToast('Not authorized', true);
  if (!confirm('Delete temple permanently? This cannot be undone.')) return;
  const txs = api.transactions.getByTemple(id);
  if (txs.length && !confirm(`Temple has ${txs.length} transaction(s). Deleting will orphan transactions. Proceed?`)) return;
  api.temples.delete(id);
  showToast('Temple deleted');
  renderAll();
}

/* Transactions render */
function renderTransactions(){
  const container = document.getElementById('transactions-content');
  if (!container) return;
  if (!auth.isAuth()) { container.innerHTML = `<div class="table-card">Please log in to view transactions.</div>`; return; }

  let list = api.transactions.getAll();
  if (auth.current.role === 'donor') list = api.transactions.getByDonor(auth.current.id);
  if (auth.current.role === 'temple_member') {
    const ids = api.temples.getByOwner(auth.current.id).map(t => t.id);
    list = list.filter(x => ids.includes(x.templeId));
  }
  if (!list.length) { container.innerHTML = `<div class="table-card">No transactions.</div>`; return; }

  let html = `<div class="table-card"><table><thead><tr><th>ID</th><th>Temple</th><th>Amount</th><th>Date</th><th>Method</th><th>Message</th><th>Actions</th></tr></thead><tbody>`;
  list.forEach(tx => {
    const temple = api.temples.getById(tx.templeId) || {name:'Unknown'};
    html += `<tr>
      <td>${tx.id}</td>
      <td>${escapeHtml(temple.name)}</td>
      <td>${formatCurrency(tx.amount)}</td>
      <td>${new Date(tx.timestamp).toLocaleString()}</td>
      <td>${escapeHtml(tx.paymentMethod)}</td>
      <td>${escapeHtml(tx.message || '')}</td>
      <td>${auth.canDeleteTx(tx) ? `<button class="btn btn-ghost delete-tx" data-id="${tx.id}"><i class="fas fa-trash"></i></button>` : '-'}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  container.innerHTML = html;

  container.querySelectorAll('.delete-tx').forEach(b => b.addEventListener('click', e => deleteTransactionConfirm(e.currentTarget.dataset.id)));
}

/* Delete transaction */
function deleteTransactionConfirm(id){
  const tx = api.transactions.getById(id);
  if (!tx) return showToast('Transaction not found', true);
  if (!auth.canDeleteTx(tx)) return showToast('Not authorized', true);
  if (!confirm('Delete transaction? This cannot be undone.')) return;
  api.transactions.delete(id);
  showToast('Transaction deleted');
  renderAll();
}

/* Export CSV */
function exportCSV(){
  if (!auth.isAuth()) return showToast('Please login to export', true);
  let list = api.transactions.getAll();
  if (auth.current.role === 'donor') list = api.transactions.getByDonor(auth.current.id);
  if (auth.current.role === 'temple_member') {
    const ids = api.temples.getByOwner(auth.current.id).map(t=>t.id);
    list = list.filter(x => ids.includes(x.templeId));
  }
  if (!list.length) return showToast('No transactions to export', true);
  const rows = [['id','temple','amount','donor','timestamp','message','paymentMethod']];
  list.forEach(tx => {
    const temple = api.temples.getById(tx.templeId) || { name:'Unknown' };
    const donor = api.users.getById(tx.donorId) || { username:'Unknown' };
    rows.push([tx.id, temple.name.replaceAll(',',''), tx.amount, donor.username.replaceAll(',',''), tx.timestamp, (tx.message||'').replaceAll(',',''), tx.paymentMethod]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `transactions_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  showToast('CSV exported');
}

/* Dashboard render */
function renderDashboard(){
  const container = document.getElementById('dashboard-content');
  if (!container) return;
  if (!auth.isAuth()){ container.innerHTML = `<div class="table-card">Please log in to view the dashboard.</div>`; return; }

  if (auth.current.role === 'donor'){
    const tx = api.transactions.getByDonor(auth.current.id);
    const total = tx.reduce((s,x)=>s+x.amount,0);
    container.innerHTML = `<div class="grid-tiles">
      <div class="tile"><div class="muted">Total Donated</div><h3>${formatCurrency(total)}</h3></div>
      <div class="tile"><div class="muted">Transactions</div><h3>${tx.length}</h3></div>
      <div class="tile"><div class="muted">Temples</div><h3>${api.temples.getAll().length}</h3></div>
    </div>`;
  } else {
    const temples = api.temples.getByOwner(auth.current.id);
    let content = `<div class="grid-tiles">`;
    temples.forEach(t => {
      const tx = api.transactions.getByTemple(t.id);
      const total = tx.reduce((s,x)=>s+x.amount,0);
      content += `<div class="tile"><div class="muted">${escapeHtml(t.name)}</div><h3>${formatCurrency(total)}</h3><div class="muted">${tx.length} donations</div></div>`;
    });
    content += `</div>`;
    container.innerHTML = content;
  }
}

/* Render everything */
function renderAll(){
  renderHomeStats();
  renderTemples();
  renderTransactions();
  renderDashboard();
  renderAuth();
}

/* ---------- modal helpers ---------- */
function showModal(innerHtml){
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const backdrop = el(`<div class="modal-backdrop" role="dialog" aria-modal="true"></div>`);
  const card = el(`<div class="modal-card">${innerHtml}</div>`);
  backdrop.appendChild(card);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  root.appendChild(backdrop);
  root.setAttribute('aria-hidden', 'false');
  return card;
}
function closeModal(){ const r = document.getElementById('modal-root'); if (r){ r.innerHTML = ''; r.setAttribute('aria-hidden','true'); } }

/* Login / Signup UI */
function showLoginModal(){
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Login</h3><button class="btn btn-ghost close">×</button></div>
    <form id="login-form" style="display:grid;gap:10px">
      <input id="login-username" placeholder="Username" class="input" required />
      <input id="login-password" type="password" placeholder="Password" class="input" required />
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost close">Cancel</button>
        <button type="submit" class="btn btn-primary">Login</button>
      </div>
    </form>
  `;
  const card = showModal(html);
  card.querySelectorAll('.close').forEach(b=>b.addEventListener('click', closeModal));
  card.querySelector('#login-form').addEventListener('submit', e=>{
    e.preventDefault();
    const u = card.querySelector('#login-username').value.trim();
    const p = card.querySelector('#login-password').value;
    if (auth.login(u,p)){ closeModal(); showToast('Login successful'); renderAll(); showPage('home'); }
    else showToast('Invalid credentials', true);
  });
}

function showSignupModal(){
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3>Sign Up</h3><button class="btn btn-ghost close">×</button></div>
    <form id="signup-form" style="display:grid;gap:10px">
      <select id="signup-role" class="input" required>
        <option value="">Select role</option>
        <option value="donor">Donor</option>
        <option value="temple_member">Temple Member</option>
      </select>
      <input id="signup-username" placeholder="Username" class="input" required />
      <input id="signup-password" type="password" placeholder="Password" class="input" required />
      <input id="signup-display" placeholder="Display name (optional)" class="input" />
      <div id="temple-fields" style="display:none">
        <input id="signup-temple-name" placeholder="Temple name" class="input" />
        <input id="signup-temple-location" placeholder="Temple location" class="input" />
        <textarea id="signup-temple-desc" placeholder="Temple description" class="input"></textarea>
        <input id="signup-fund-needed" type="number" placeholder="Initial funding need (₹)" class="input" />
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="btn btn-ghost close">Cancel</button>
        <button type="submit" class="btn btn-primary">Create account</button>
      </div>
    </form>
  `;
  const card = showModal(html);
  const roleEl = card.querySelector('#signup-role');
  const templeFields = card.querySelector('#temple-fields');
  roleEl.addEventListener('change', ()=> templeFields.style.display = roleEl.value === 'temple_member' ? 'block' : 'none');
  card.querySelectorAll('.close').forEach(b=>b.addEventListener('click', closeModal));
  card.querySelector('#signup-form').addEventListener('submit', e=>{
    e.preventDefault();
    const username = card.querySelector('#signup-username').value.trim();
    const password = card.querySelector('#signup-password').value;
    const role = roleEl.value;
    const displayName = card.querySelector('#signup-display').value.trim() || username;
    const data = { username, password, role, displayName };
    if (role === 'temple_member') {
      data.templeName = card.querySelector('#signup-temple-name').value.trim();
      data.templeLocation = card.querySelector('#signup-temple-location').value.trim();
      data.templeDescription = card.querySelector('#signup-temple-desc').value.trim();
      data.fundNeeded = card.querySelector('#signup-fund-needed').value;
    }
    const res = auth.signup(data);
    if (!res.success) showToast(res.message, true);
    else { closeModal(); showToast('Account created'); renderAll(); showPage('home'); }
  });
}

/* ---------- toast ---------- */
function showToast(msg, isError=false){
  const t = document.getElementById('toast');
  if (!t) { console.log(msg); return; }
  t.textContent = msg;
  t.style.background = isError ? '#ef4444' : '#16a34a';
  t.classList.remove('hidden');
  setTimeout(()=> t.classList.add('hidden'), 3000);
}

/* ---------- ensure sample data (only if empty) ---------- */
function ensureSampleData(){
  if (api.users.getAll().length === 0){
    const admin = api.users.create({ username:'ganesh_admin', password:'password', role:'temple_member', displayName:'Ganesh Admin' });
    api.temples.create({ name:'Ganesh Temple', description:'Historic city temple', location:'Mumbai', ownerUserId: admin.id, fund_needed: 50000, fund_received: 15000, images: [] });
    api.temples.create({ name:'Shiva Temple', description:'Ancient Shiva temple', location:'Varanasi', ownerUserId: 'user_1234', fund_needed: 75000, fund_received: 25000 });
    const donor = api.users.create({ username:'donor1', password:'password', role:'donor', displayName:'Kind Donor' });
    api.transactions.create({ donorId: donor.id, templeId: api.temples.getAll()[0].id, amount:15000, message:'Blessings', paymentMethod:'UPI' });
  }
}
