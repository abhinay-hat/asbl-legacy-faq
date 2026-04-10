// ── State ─────────────────────────────────────────────────────────────────────
let authToken = null;
let currentUser = null;
let allFAQs = [];
let activeCategory = 'all';
let searchTimer = null;
let allAdminFAQs = [];
let editingFaqId = null;

const CATEGORIES = [
  'Project Level', 'Unit Level', 'Clubhouse',
  'Urban Corridor', 'Landscape Amenities', 'Specifications'
];

const CATEGORY_ICONS = {
  'Project Level':        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
  'Unit Level':           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="m8 21 4-4 4 4"/><path d="M12 17v4"/></svg>`,
  'Clubhouse':            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  'Urban Corridor':       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'Landscape Amenities':  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22V12"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="M12 12C12 7 7 3 7 3s5 1 5 9"/><path d="M12 12c0-5 5-9 5-9s-5 4-5 9"/></svg>`,
  'Specifications':       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
};

// ── Boot: verify token, redirect to login if invalid ──────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('asbl_token');
  if (!token) {
    window.location.replace('/');
    return;
  }

  try {
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('invalid');
    const data = await res.json();
    authToken = token;
    currentUser = { username: data.username, role: data.role };
    initApp();
  } catch {
    localStorage.removeItem('asbl_token');
    window.location.replace('/');
  }
});

function initApp() {
  // Set header
  const info = document.getElementById('user-info');
  const avatar = document.getElementById('user-avatar');
  if (info) info.textContent = currentUser.username;
  if (avatar) avatar.textContent = currentUser.username.charAt(0).toUpperCase();

  // Admin button only for admins
  if (currentUser.role === 'admin') {
    document.getElementById('btn-admin').style.display = '';
  }

  loadFAQs().then(() => {
    buildCategoryGrid();
    setupSearch();
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
  fetch('/api/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` }
  }).catch(() => {});
  authToken = null;
  currentUser = null;
  localStorage.removeItem('asbl_token');
  window.location.replace('/');
}

// ── Auth Fetch ────────────────────────────────────────────────────────────────
async function authFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), 'Authorization': `Bearer ${authToken}` }
  });
  if (res.status === 401) {
    localStorage.removeItem('asbl_token');
    window.location.replace('/');
    throw new Error('session_expired');
  }
  return res;
}

// ── Load FAQs ─────────────────────────────────────────────────────────────────
async function loadFAQs() {
  try {
    const res = await authFetch('/api/faqs');
    const data = await res.json();
    allFAQs = data.faqs || [];
    document.getElementById('total-count').textContent = allFAQs.length;
  } catch (err) {
    if (err.message !== 'session_expired') showToast('Could not load FAQs');
  }
}

// ── Category Grid ─────────────────────────────────────────────────────────────
function buildCategoryGrid() {
  const grid = document.getElementById('category-grid');
  const counts = {};
  for (const faq of allFAQs) {
    counts[faq.category] = (counts[faq.category] || 0) + 1;
  }
  grid.innerHTML = Object.entries(counts).map(([cat, count]) => `
    <div class="cat-card" onclick="filterCategory('${escAttr(cat)}', null)" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')filterCategory('${escAttr(cat)}',null)">
      <div class="cat-icon">${CATEGORY_ICONS[cat] || CATEGORY_ICONS['Specifications']}</div>
      <div class="cat-name">${escHtml(cat)}</div>
      <div class="cat-count">${count} question${count !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
}

// ── Search ────────────────────────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    const val = input.value.trim();
    clearBtn.classList.toggle('visible', val.length > 0);
    clearTimeout(searchTimer);
    if (!val) { showDefaultView(); return; }
    searchTimer = setTimeout(() => performSearch(val), 280);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      const val = input.value.trim();
      if (val) performSearch(val);
    }
  });
}

async function performSearch(query) {
  showView('ai-thinking');
  try {
    const res = await authFetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();

    let results = data.results || [];
    if (activeCategory !== 'all') {
      results = results.filter(r => r.category === activeCategory || r.id === 0);
    }

    if (!data.success || results.length === 0) {
      showView('no-results');
      prefillRaiseForm(query);
    } else {
      renderResults(results, data.source);
    }
  } catch (err) {
    if (err.message !== 'session_expired') {
      showView('no-results');
      prefillRaiseForm(query);
    }
  }
}

function renderResults(results, source) {
  showView('search-results');
  document.getElementById('results-count-label').textContent =
    `${results.length} result${results.length !== 1 ? 's' : ''} found`;
  const badge = document.getElementById('results-source-badge');
  badge.textContent = source === 'ai' ? 'AI Answer' : 'FAQ Match';
  badge.className = `source-badge ${source === 'ai' ? 'ai' : 'faq'}`;

  document.getElementById('results-list').innerHTML = results.map((faq, i) => `
    <div class="result-card" id="rc-${i}">
      <div class="result-header" onclick="toggleAnswer(${i})" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter')toggleAnswer(${i})">
        <div class="result-q-icon">Q</div>
        <div class="result-question">${escHtml(faq.question)}</div>
        <span class="result-category-tag">${escHtml(faq.category)}</span>
      </div>
      <div class="result-answer" id="ra-${i}">${escHtml(faq.answer)}</div>
    </div>
  `).join('');
}

function toggleAnswer(i) {
  const ans = document.getElementById(`ra-${i}`);
  ans.style.display = ans.style.display === 'none' ? '' : 'none';
}

function filterCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    document.querySelectorAll('.pill').forEach(p => {
      if (p.textContent.trim() === cat || (cat === 'all' && p.textContent.trim() === 'All')) {
        p.classList.add('active');
      }
    });
  }
  const query = document.getElementById('search-input').value.trim();
  if (query) { performSearch(query); return; }
  if (cat === 'all') { showDefaultView(); return; }
  const filtered = allFAQs.filter(f => f.category === cat);
  renderResults(filtered, 'faq');
  document.getElementById('results-count-label').textContent = `${filtered.length} FAQs in ${cat}`;
  document.getElementById('results-source-badge').className = 'source-badge faq';
  document.getElementById('results-source-badge').textContent = 'Category';
}

function showView(name) {
  ['default-view', 'search-results', 'ai-thinking', 'no-results'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== name);
  });
}

function showDefaultView() { showView('default-view'); }

// ── Raise Form ────────────────────────────────────────────────────────────────
function prefillRaiseForm(query) {
  const ta = document.getElementById('raise-question');
  if (ta && !ta.value) ta.value = query;
  document.getElementById('raise-success').classList.add('hidden');
  document.getElementById('raise-form').classList.remove('hidden');
}

async function submitQuestion(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const name = document.getElementById('raise-name').value.trim();
  const question = document.getElementById('raise-question').value.trim();
  const priority = document.querySelector('input[name="priority"]:checked')?.value || 'Medium';
  if (!name || !question) return;

  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const res = await authFetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, question, priority })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('raise-form').classList.add('hidden');
      document.getElementById('raise-success').classList.remove('hidden');
      showToast('Question raised successfully!');
    } else {
      showToast('Error: ' + (data.error || 'Could not submit'));
    }
  } catch (err) {
    if (err.message !== 'session_expired') showToast('Network error — please try again');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg> Raise to Backend Team`;
  }
}

function resetAfterSubmit() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.remove('visible');
  document.getElementById('raise-name').value = '';
  document.getElementById('raise-question').value = '';
  document.querySelector('input[name="priority"][value="Medium"]').checked = true;
  document.getElementById('raise-success').classList.add('hidden');
  document.getElementById('raise-form').classList.remove('hidden');
  activeCategory = 'all';
  document.querySelectorAll('.pill').forEach((p, i) => p.classList.toggle('active', i === 0));
  showDefaultView();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').classList.remove('visible');
  showDefaultView();
  document.getElementById('search-input').focus();
}

// ── Tab Switcher ──────────────────────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.toggle('active', t.id === `tab-${tab}`);
    t.classList.toggle('hidden', t.id !== `tab-${tab}`);
  });
  document.getElementById('btn-search').classList.toggle('active', tab === 'search');
  const adminBtn = document.getElementById('btn-admin');
  if (adminBtn) adminBtn.classList.toggle('active', tab === 'admin');
  if (tab === 'admin') showAdminTab('faqs');
}

// ── Admin Sub-Tab ─────────────────────────────────────────────────────────────
function showAdminTab(tab) {
  document.getElementById('admin-faqs-panel').style.display = tab === 'faqs' ? '' : 'none';
  document.getElementById('admin-questions-panel').style.display = tab === 'questions' ? '' : 'none';
  document.getElementById('at-faqs').classList.toggle('active', tab === 'faqs');
  document.getElementById('at-questions').classList.toggle('active', tab === 'questions');
  if (tab === 'faqs') loadAdminFAQs();
  if (tab === 'questions') loadAdminQuestions();
}

// ── Admin: FAQ Manager ────────────────────────────────────────────────────────
async function loadAdminFAQs() {
  const list = document.getElementById('admin-faq-list');
  list.innerHTML = '<div class="admin-empty">Loading FAQs...</div>';
  document.getElementById('faq-list-meta').textContent = '';
  try {
    const res = await authFetch('/api/faqs');
    const data = await res.json();
    allAdminFAQs = data.faqs || [];
    renderAdminFAQs(document.getElementById('admin-faq-search').value || '');
  } catch (err) {
    if (err.message !== 'session_expired') {
      list.innerHTML = '<div class="admin-empty">Failed to load FAQs.</div>';
    }
  }
}

function renderAdminFAQs(filter = '') {
  const list = document.getElementById('admin-faq-list');
  const meta = document.getElementById('faq-list-meta');
  let faqs = allAdminFAQs;

  if (filter.trim()) {
    const q = filter.toLowerCase();
    faqs = faqs.filter(f =>
      f.question.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q)
    );
  }

  meta.textContent = filter
    ? `${faqs.length} of ${allAdminFAQs.length} FAQs`
    : `${allAdminFAQs.length} FAQs total`;

  if (faqs.length === 0) {
    list.innerHTML = `<div class="admin-empty">${filter ? 'No FAQs match your filter.' : 'No FAQs yet.'}</div>`;
    return;
  }

  list.innerHTML = faqs.map(faq => `
    <div class="admin-faq-card" id="faq-card-${faq.id}">
      <div class="faq-read-view" id="faq-read-${faq.id}">
        <div class="faq-read-header">
          <span class="result-category-tag">${escHtml(faq.category)}</span>
          <div class="faq-actions">
            <button class="btn-icon" onclick="startEditFaq(${faq.id})" title="Edit" aria-label="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon btn-icon-delete" onclick="deleteFaq(${faq.id})" title="Delete" aria-label="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3,6 5,6 21,6"/>
                <path d="M19,6l-1,14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5,6"/>
                <path d="M10,11v6M14,11v6"/>
                <path d="M9,6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="faq-read-question">${escHtml(faq.question)}</div>
        <div class="faq-read-answer">${escHtml(faq.answer)}</div>
      </div>
      <div class="faq-edit-view" id="faq-edit-${faq.id}" style="display:none">
        <div class="form-group">
          <label>Category</label>
          <select id="edit-cat-${faq.id}">
            ${CATEGORIES.map(c => `<option value="${escAttr(c)}"${c === faq.category ? ' selected' : ''}>${escHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Question</label>
          <textarea id="edit-q-${faq.id}" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label>Answer</label>
          <textarea id="edit-a-${faq.id}" rows="5"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn-submit" onclick="saveFaqEdit(${faq.id})" style="width:auto;padding:10px 22px;font-size:12px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>
            Save Changes
          </button>
          <button class="btn-outline" onclick="cancelEditFaq(${faq.id})" style="font-size:12px">Cancel</button>
        </div>
      </div>
    </div>
  `).join('');

  // Populate textarea values safely
  faqs.forEach(faq => {
    const qEl = document.getElementById(`edit-q-${faq.id}`);
    const aEl = document.getElementById(`edit-a-${faq.id}`);
    if (qEl) qEl.value = faq.question;
    if (aEl) aEl.value = faq.answer;
  });
}

function toggleAddFaqForm(show) {
  const panel = document.getElementById('add-faq-panel');
  const btn = document.getElementById('btn-add-faq');
  panel.style.display = show ? '' : 'none';
  if (btn) btn.style.display = show ? 'none' : '';
  if (show) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => document.getElementById('new-faq-category').focus(), 150);
  } else {
    document.getElementById('add-faq-form').reset();
  }
}

async function addNewFaq(e) {
  e.preventDefault();
  const category = document.getElementById('new-faq-category').value;
  const question = document.getElementById('new-faq-question').value.trim();
  const answer = document.getElementById('new-faq-answer').value.trim();
  if (!category || !question || !answer) return;

  const btn = document.getElementById('add-faq-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const res = await authFetch('/api/faqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, question, answer })
    });
    const data = await res.json();
    if (data.success) {
      allAdminFAQs.push(data.faq);
      allFAQs.push(data.faq);
      document.getElementById('total-count').textContent = allFAQs.length;
      buildCategoryGrid();
      toggleAddFaqForm(false);
      renderAdminFAQs(document.getElementById('admin-faq-search').value || '');
      showToast('FAQ added successfully');
    } else {
      showToast('Error: ' + data.error);
    }
  } catch (err) {
    if (err.message !== 'session_expired') showToast('Failed to add FAQ');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Save FAQ`;
  }
}

function startEditFaq(id) {
  if (editingFaqId !== null && editingFaqId !== id) cancelEditFaq(editingFaqId);
  editingFaqId = id;
  document.getElementById(`faq-read-${id}`).style.display = 'none';
  document.getElementById(`faq-edit-${id}`).style.display = '';
  document.getElementById(`edit-q-${id}`).focus();
}

function cancelEditFaq(id) {
  document.getElementById(`faq-read-${id}`).style.display = '';
  document.getElementById(`faq-edit-${id}`).style.display = 'none';
  if (editingFaqId === id) editingFaqId = null;
}

async function saveFaqEdit(id) {
  const category = document.getElementById(`edit-cat-${id}`).value;
  const question = document.getElementById(`edit-q-${id}`).value.trim();
  const answer = document.getElementById(`edit-a-${id}`).value.trim();
  if (!question || !answer) { showToast('Question and answer cannot be empty'); return; }

  const saveBtn = document.querySelector(`#faq-edit-${id} .btn-submit`);
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

  try {
    const res = await authFetch(`/api/faqs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, question, answer })
    });
    const data = await res.json();
    if (data.success) {
      const ai = allAdminFAQs.findIndex(f => f.id === id);
      if (ai !== -1) allAdminFAQs[ai] = data.faq;
      const fi = allFAQs.findIndex(f => f.id === id);
      if (fi !== -1) allFAQs[fi] = data.faq;
      cancelEditFaq(id);
      renderAdminFAQs(document.getElementById('admin-faq-search').value || '');
      showToast('FAQ updated');
    } else {
      showToast('Error: ' + data.error);
    }
  } catch (err) {
    if (err.message !== 'session_expired') showToast('Failed to save');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Save Changes`;
    }
  }
}

async function deleteFaq(id) {
  const faq = allAdminFAQs.find(f => f.id === id);
  const preview = faq ? faq.question.slice(0, 70) : 'this FAQ';
  if (!confirm(`Delete this FAQ?\n\n"${preview}"\n\nThis cannot be undone.`)) return;

  try {
    const res = await authFetch(`/api/faqs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      allAdminFAQs = allAdminFAQs.filter(f => f.id !== id);
      allFAQs = allFAQs.filter(f => f.id !== id);
      document.getElementById('total-count').textContent = allFAQs.length;
      buildCategoryGrid();
      renderAdminFAQs(document.getElementById('admin-faq-search').value || '');
      showToast('FAQ deleted');
    } else {
      showToast('Error: ' + data.error);
    }
  } catch (err) {
    if (err.message !== 'session_expired') showToast('Failed to delete');
  }
}

// ── Admin: Raised Questions ───────────────────────────────────────────────────
async function loadAdminQuestions() {
  const list = document.getElementById('admin-list');
  list.innerHTML = '<div class="admin-empty">Loading...</div>';
  try {
    const res = await authFetch('/api/questions');
    const data = await res.json();
    const questions = data.questions || [];

    const badge = document.getElementById('questions-badge');
    if (questions.length > 0) {
      badge.textContent = questions.length;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }

    if (questions.length === 0) {
      list.innerHTML = '<div class="admin-empty">No questions raised yet.</div>';
      return;
    }

    questions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = questions.map(q => `
      <div class="admin-card">
        <div>
          <div class="admin-q">${escHtml(q.question)}</div>
          <div class="admin-meta">
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              ${escHtml(q.name)}
            </span>
            <span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${formatDate(q.createdAt)}
            </span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <span class="priority-badge ${escAttr(q.priority)}">${escHtml(q.priority)}</span>
          <span class="status-badge">${escHtml(q.status)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    if (err.message !== 'session_expired') {
      list.innerHTML = '<div class="admin-empty">Failed to load questions.</div>';
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = '';
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.style.display = 'none'; }, 300);
  }, 3000);
}
