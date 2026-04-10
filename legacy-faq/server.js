require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const FAQS_PATH = path.join(DATA_DIR, 'faqs.json');
const QUESTIONS_PATH = path.join(DATA_DIR, 'questions.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const VIEWS_DIR = path.join(__dirname, 'views');
const PDF_PATH = path.join(__dirname, '..', '..', '..', 'Downloads', '260406-Legacy- Sales FAQ.pdf');

// ─── Cookie helper (no extra dependencies) ───────────────────────────────────
function parseCookies(req) {
  const result = {};
  const header = req.headers.cookie;
  if (!header) return result;
  header.split(';').forEach(pair => {
    const [key, ...vals] = pair.split('=');
    const name = key?.trim();
    if (name) result[name] = decodeURIComponent(vals.join('=').trim());
  });
  return result;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `asbl_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 3600}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    'asbl_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
  );
}

// ─── Token Store (in-memory) ─────────────────────────────────────────────────
const activeTokens = new Map(); // token -> { username, role, exp }

// ─── User Management ─────────────────────────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) {
    const defaults = [
      { username: 'admin', password: 'legacy@2024', role: 'admin' },
      { username: 'sales', password: 'sales@2024', role: 'viewer' }
    ];
    fs.writeFileSync(USERS_PATH, JSON.stringify(defaults, null, 2));
    console.log('[Auth] Created default users.json — admin:legacy@2024 / sales:sales@2024');
    return defaults;
  }
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
// Serve static assets (CSS, JS) but NOT the HTML views
app.use(express.static(path.join(__dirname, 'public')));

function getToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

  const session = activeTokens.get(token);
  if (!session) return res.status(401).json({ success: false, error: 'Invalid or expired session' });

  if (Date.now() > session.exp) {
    activeTokens.delete(token);
    return res.status(401).json({ success: false, error: 'Session expired — please log in again' });
  }

  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────
async function parsePDFToFAQs() {
  if (fs.existsSync(FAQS_PATH)) {
    const content = fs.readFileSync(FAQS_PATH, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed.length > 0) {
      console.log(`[FAQ] Loaded ${parsed.length} FAQs from cache`);
      return parsed;
    }
  }

  if (!fs.existsSync(PDF_PATH)) {
    console.log('[FAQ] PDF not found, using pre-parsed data');
    return [];
  }

  try {
    const pdfParse = require('pdf-parse');
    const pdfBuffer = fs.readFileSync(PDF_PATH);
    const data = await pdfParse(pdfBuffer);
    const text = data.text;

    const faqs = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let id = 1;
    let currentQ = null;
    let currentA = [];
    let currentCategory = 'General';

    const categoryMap = {
      'PROJECT LEVEL': 'Project Level',
      'UNIT LEVEL': 'Unit Level',
      'CLUBHOUSE': 'Clubhouse',
      'URBAN CORRIDOR': 'Urban Corridor',
      'LANDSCAPE AMENITIES': 'Landscape Amenities',
      'SPECIFICATIONS': 'Specifications'
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upperLine = line.toUpperCase();

      for (const [key, val] of Object.entries(categoryMap)) {
        if (upperLine.includes(key)) {
          currentCategory = val;
          break;
        }
      }

      const qMatch = line.match(/^\d+\.\s+(.+\?)\s*$/);
      if (qMatch) {
        if (currentQ && currentA.length > 0) {
          faqs.push({ id: id++, category: currentCategory, question: currentQ, answer: currentA.join('\n') });
        }
        currentQ = qMatch[1];
        currentA = [];
      } else if (currentQ && line && !line.match(/^For Internal Use Only/) && !line.match(/^\d+$/) && line !== currentQ) {
        currentA.push(line);
      }
    }

    if (currentQ && currentA.length > 0) {
      faqs.push({ id: id++, category: currentCategory, question: currentQ, answer: currentA.join('\n') });
    }

    if (faqs.length > 0) {
      fs.writeFileSync(FAQS_PATH, JSON.stringify(faqs, null, 2));
      console.log(`[FAQ] Parsed and cached ${faqs.length} FAQs from PDF`);
    }

    return faqs;
  } catch (err) {
    console.error('[FAQ] PDF parse error:', err.message);
    return [];
  }
}

// ─── OpenRouter AI Fallback ───────────────────────────────────────────────────
const openRouterAnswer = async (userQuestion, faqContext) => {
  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === 'your_key_here') {
    return null;
  }

  const systemPrompt = `You are a Legacy real estate sales assistant for ASBL Legacy at RTC Cross Road, Hyderabad. Answer questions strictly based on this FAQ context: ${faqContext}. If the answer is not in the context, respond with UNANSWERED.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Legacy FAQ'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-27b-it:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuestion }
        ],
        reasoning: { enabled: true }
      })
    });

    const result = await response.json();
    if (!result.choices || !result.choices[0]) return null;
    const assistantMsg = result.choices[0].message;

    const verifyMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuestion },
      { role: 'assistant', content: assistantMsg.content, ...(assistantMsg.reasoning_details ? { reasoning_details: assistantMsg.reasoning_details } : {}) },
      { role: 'user', content: 'Are you confident this answer is in the FAQ? Reply CONFIRMED or UNANSWERED.' }
    ];

    const verify = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Legacy FAQ'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-27b-it:free',
        messages: verifyMessages
      })
    });

    const verifyResult = await verify.json();
    if (!verifyResult.choices || !verifyResult.choices[0]) return null;
    const verifyText = verifyResult.choices[0].message.content;

    return verifyText.includes('UNANSWERED') ? null : assistantMsg.content;
  } catch (err) {
    console.error('[AI] OpenRouter error:', err.message);
    return null;
  }
};

// ─── Page Routes (server-side gated) ─────────────────────────────────────────

// GET / → login page (always public)
app.get('/', (req, res) => {
  // If already has a valid session cookie, redirect to app
  const cookies = parseCookies(req);
  const cookieToken = cookies['asbl_session'];
  if (cookieToken) {
    const session = activeTokens.get(cookieToken);
    if (session && Date.now() < session.exp) {
      return res.redirect('/app');
    }
  }
  res.sendFile(path.join(VIEWS_DIR, 'login.html'));
});

// GET /app → main app (requires valid session cookie)
app.get('/app', (req, res) => {
  const cookies = parseCookies(req);
  const cookieToken = cookies['asbl_session'];

  if (!cookieToken) {
    return res.redirect('/');
  }

  const session = activeTokens.get(cookieToken);
  if (!session || Date.now() > session.exp) {
    activeTokens.delete(cookieToken);
    clearSessionCookie(res);
    return res.redirect('/');
  }

  res.sendFile(path.join(VIEWS_DIR, 'app.html'));
});

// Block direct access to views directory
app.get('/views/*', (req, res) => res.redirect('/'));

// ─── Auth Routes ──────────────────────────────────────────────────────────────

// POST /api/login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username.trim() && u.password === password);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, {
    username: user.username,
    role: user.role,
    exp: Date.now() + 8 * 3600000 // 8 hours
  });

  // Set httpOnly cookie for server-side page gating
  setSessionCookie(res, token);

  console.log(`[Auth] Login: ${user.username} (${user.role})`);
  res.json({ success: true, token, role: user.role, username: user.username });
});

// POST /api/logout
app.post('/api/logout', requireAuth, (req, res) => {
  activeTokens.delete(getToken(req));
  clearSessionCookie(res);
  res.json({ success: true });
});

// GET /api/me — verify session
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ success: true, username: req.user.username, role: req.user.role });
});

// ─── FAQ Routes ───────────────────────────────────────────────────────────────

// GET /api/faqs — all FAQs (auth required)
app.get('/api/faqs', requireAuth, (req, res) => {
  try {
    const faqs = JSON.parse(fs.readFileSync(FAQS_PATH, 'utf8'));
    res.json({ success: true, count: faqs.length, faqs });
  } catch {
    res.status(500).json({ success: false, error: 'Could not load FAQs' });
  }
});

// POST /api/faqs — add new FAQ (admin only)
app.post('/api/faqs', requireAuth, requireAdmin, (req, res) => {
  const { category, question, answer } = req.body;
  if (!category || !question || !answer) {
    return res.status(400).json({ success: false, error: 'category, question, and answer are required' });
  }
  try {
    const faqs = JSON.parse(fs.readFileSync(FAQS_PATH, 'utf8'));
    const maxId = faqs.reduce((m, f) => Math.max(m, f.id || 0), 0);
    const newFaq = {
      id: maxId + 1,
      category: category.trim(),
      question: question.trim(),
      answer: answer.trim()
    };
    faqs.push(newFaq);
    fs.writeFileSync(FAQS_PATH, JSON.stringify(faqs, null, 2));
    console.log(`[Admin] FAQ added: #${newFaq.id} — ${newFaq.question.slice(0, 50)}`);
    res.json({ success: true, faq: newFaq });
  } catch {
    res.status(500).json({ success: false, error: 'Could not save FAQ' });
  }
});

// PUT /api/faqs/:id — edit FAQ (admin only)
app.put('/api/faqs/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { category, question, answer } = req.body;
  try {
    const faqs = JSON.parse(fs.readFileSync(FAQS_PATH, 'utf8'));
    const idx = faqs.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'FAQ not found' });

    if (category !== undefined) faqs[idx].category = category.trim();
    if (question !== undefined) faqs[idx].question = question.trim();
    if (answer !== undefined) faqs[idx].answer = answer.trim();

    fs.writeFileSync(FAQS_PATH, JSON.stringify(faqs, null, 2));
    console.log(`[Admin] FAQ updated: #${id}`);
    res.json({ success: true, faq: faqs[idx] });
  } catch {
    res.status(500).json({ success: false, error: 'Could not update FAQ' });
  }
});

// DELETE /api/faqs/:id — delete FAQ (admin only)
app.delete('/api/faqs/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  try {
    let faqs = JSON.parse(fs.readFileSync(FAQS_PATH, 'utf8'));
    const idx = faqs.findIndex(f => f.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'FAQ not found' });

    faqs.splice(idx, 1);
    fs.writeFileSync(FAQS_PATH, JSON.stringify(faqs, null, 2));
    console.log(`[Admin] FAQ deleted: #${id}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Could not delete FAQ' });
  }
});

// ─── Search Route ─────────────────────────────────────────────────────────────

// POST /api/search — fuzzy search + AI fallback (auth required)
app.post('/api/search', requireAuth, async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ success: false, error: 'Query is required' });
  }

  // Always read latest FAQs from disk so AI uses updated content
  const faqs = JSON.parse(fs.readFileSync(FAQS_PATH, 'utf8'));
  const q = query.toLowerCase().trim();

  const scored = faqs.map(faq => {
    const questionText = faq.question.toLowerCase();
    const answerText = faq.answer.toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 2);

    let score = 0;
    if (questionText.includes(q)) score += 10;
    if (answerText.includes(q)) score += 5;
    for (const word of words) {
      if (questionText.includes(word)) score += 2;
      if (answerText.includes(word)) score += 1;
    }
    if (faq.category.toLowerCase().includes(q)) score += 3;

    return { ...faq, score };
  });

  const matches = scored
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ score, ...faq }) => faq);

  if (matches.length > 0) {
    return res.json({ success: true, source: 'faq', results: matches });
  }

  // AI fallback using latest FAQ data
  const faqContext = faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
  const aiAnswer = await openRouterAnswer(query, faqContext);

  if (aiAnswer) {
    return res.json({
      success: true,
      source: 'ai',
      results: [{ id: 0, category: 'AI Answer', question: query, answer: aiAnswer }]
    });
  }

  return res.json({ success: true, source: 'none', results: [] });
});

// ─── Questions Routes ─────────────────────────────────────────────────────────

// POST /api/questions — save unanswered question (auth required)
app.post('/api/questions', requireAuth, (req, res) => {
  const { name, question, priority } = req.body;
  if (!name || !question || !priority) {
    return res.status(400).json({ success: false, error: 'Name, question, and priority are required' });
  }

  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
  const newQuestion = {
    id: Date.now(),
    name: name.trim(),
    question: question.trim(),
    priority,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  questions.push(newQuestion);
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(questions, null, 2));

  res.json({ success: true, message: 'Question raised successfully', question: newQuestion });
});

// GET /api/questions — admin view of all raised questions (admin only)
app.get('/api/questions', requireAuth, requireAdmin, (req, res) => {
  try {
    const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
    res.json({ success: true, count: questions.length, questions });
  } catch {
    res.status(500).json({ success: false, error: 'Could not load questions' });
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  loadUsers(); // ensure users.json exists
  await parsePDFToFAQs();
  app.listen(PORT, () => {
    console.log(`\n🏢 ASBL Legacy FAQ Server running at http://localhost:${PORT}`);
    console.log(`   Default logins: admin:legacy@2024 / sales:sales@2024`);
    console.log(`   Users file: ${USERS_PATH}\n`);
  });
}

start();
