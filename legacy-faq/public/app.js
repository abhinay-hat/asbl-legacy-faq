// ── State ──────────────────────────────────────────────────────────────────
let allFAQs = [];
let activeCategory = 'all';
let searchTimer = null;

const CATEGORY_ICONS = {
  'Project Level': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
  'Unit Level':    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="m8 21 4-4 4 4"/><path d="M12 17v4"/></svg>`,
  'Clubhouse':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  'Urban Corridor':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  'Landscape Amenities':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22V12"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><path d="M12 12C12 7 7 3 7 3s5 1 5 9"/><path d="M12 12c0-5 5-9 5-9s-5 4-5 9"/></svg>`,
  'Specifications':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
};

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadFAQs();
  buildCategoryGrid();
  setupSearch();
});

// ── Load FAQs ──────────────────────────────────────────────────────────────
async function loadFAQs() {
  try {
    const res = await fetch('/api/faqs');
    const data = await res.json();
    allFAQs = data.faqs || [];
    document.getElementById('total-count').textContent = allFAQs.length;
  } catch (err) {
    showToast('Could not load FAQs — check if server is running');
    console.error(err);
  }
}

// ── Category Grid ──────────────────────────────────────────────────────────
function buildCategoryGrid() {
  const grid = document.getElementById('category-grid');
  const counts = {};
  for (const faq of allFAQs) {
    counts[faq.category] = (counts[faq.category] || 0) + 1;
  }

  const categories = Object.entries(counts);
  grid.innerHTML = categories.map(([cat, count]) => `
    <div class="cat-card" onclick="filterCategory('${cat}', null)" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')filterCategory('${cat}',null)">
      <div class="cat-icon">${CATEGORY_ICONS[cat] || CATEGORY_ICONS['Specifications']}</div>
      <div class="cat-name">${cat}</div>
      <div class="cat-count">${count} question${count !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
}

// ── Search Setup ───────────────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    const val = input.value.trim();
    clearBtn.classList.toggle('visible', val.length > 0);
    clearTimeout(searchTimer);
    if (!val) {
      showDefaultView();
      return;
    }
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

// ── Perform Search ─────────────────────────────────────────────────────────
async function performSearch(query) {
  showView('ai-thinking');

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();

    if (!data.success) {
      showView('no-results');
      prefillRaiseForm(query);
      return;
    }

    // Filter by active category
    let results = data.results || [];
    if (activeCategory !== 'all') {
      results = results.filter(r => r.category === activeCategory || r.id === 0);
    }

    if (results.length === 0) {
      showView('no-results');
      prefillRaiseForm(query);
      return;
    }

    renderResults(results, data.source);
  } catch (err) {
    console.error(err);
    showView('no-results');
    prefillRaiseForm(query);
  }
}

// ── Render Results ─────────────────────────────────────────────────────────
function renderResults(results, source) {
  showView('search-results');

  const label = document.getElementById('results-count-label');
  const badge = document.getElementById('results-source-badge');
  const list = document.getElementById('results-list');

  label.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found`;
  badge.textContent = source === 'ai' ? 'AI Answer' : 'FAQ Match';
  badge.className = `source-badge ${source === 'ai' ? 'ai' : 'faq'}`;

  list.innerHTML = results.map((faq, i) => `
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

// ── Filter by Category ─────────────────────────────────────────────────────
function filterCategory(cat, btn) {
  activeCategory = cat;

  // Update pill buttons
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else {
    // find the matching pill
    document.querySelectorAll('.pill').forEach(p => {
      if (p.textContent.trim() === cat || (cat === 'all' && p.textContent.trim() === 'All')) {
        p.classList.add('active');
      }
    });
  }

  const query = document.getElementById('search-input').value.trim();
  if (query) {
    performSearch(query);
    return;
  }

  // No query — show filtered FAQ list
  if (cat === 'all') {
    showDefaultView();
    return;
  }

  const filtered = allFAQs.filter(f => f.category === cat);
  renderResults(filtered, 'faq');
  document.getElementById('results-count-label').textContent =
    `${filtered.length} FAQs in ${cat}`;
  document.getElementById('results-source-badge').className = 'source-badge faq';
  document.getElementById('results-source-badge').textContent = 'Category';
}

// ── View Manager ───────────────────────────────────────────────────────────
function showView(name) {
  ['default-view', 'search-results', 'ai-thinking', 'no-results'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== name);
  });
}

function showDefaultView() {
  showView('default-view');
}

// ── Raise Form ─────────────────────────────────────────────────────────────
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
    const res = await fetch('/api/questions', {
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
  } catch {
    showToast('Network error — please try again');
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

// ── Tab Switcher ───────────────────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.toggle('active', t.id === `tab-${tab}`);
    t.classList.toggle('hidden', t.id !== `tab-${tab}`);
  });
  document.getElementById('btn-search').classList.toggle('active', tab === 'search');
  document.getElementById('btn-admin').classList.toggle('active', tab === 'admin');
  if (tab === 'admin') loadAdminQuestions();
}

// ── Admin View ─────────────────────────────────────────────────────────────
async function loadAdminQuestions() {
  const list = document.getElementById('admin-list');
  list.innerHTML = '<div class="admin-empty">Loading...</div>';

  try {
    const res = await fetch('/api/questions');
    const data = await res.json();
    const questions = data.questions || [];

    if (questions.length === 0) {
      list.innerHTML = '<div class="admin-empty">No questions raised yet.</div>';
      return;
    }

    // Sort newest first
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
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${formatDate(q.createdAt)}
            </span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <span class="priority-badge ${q.priority}">${q.priority}</span>
          <span class="status-badge">${q.status}</span>
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="admin-empty">Failed to load questions.</div>';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 300); }, 3000);
}
