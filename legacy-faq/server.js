require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const FAQS_PATH = path.join(DATA_DIR, 'faqs.json');
const QUESTIONS_PATH = path.join(DATA_DIR, 'questions.json');
const PDF_PATH = path.join(__dirname, '..', '..', '..', 'Downloads', '260406-Legacy- Sales FAQ.pdf');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── PDF Parser ─────────────────────────────────────────────────────────────
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

// ─── OpenRouter AI Fallback ──────────────────────────────────────────────────
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

    // Second pass — verify answer confidence
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

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/faqs — all Q&A pairs
app.get('/api/faqs', (req, res) => {
  try {
    const faqs = JSON.parse(fs.readFileSync(FAQS_PATH, 'utf8'));
    res.json({ success: true, count: faqs.length, faqs });
  } catch {
    res.status(500).json({ success: false, error: 'Could not load FAQs' });
  }
});

// POST /api/search — fuzzy search + AI fallback
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ success: false, error: 'Query is required' });
  }

  const faqs = JSON.parse(fs.readFileSync(FAQS_PATH, 'utf8'));
  const q = query.toLowerCase().trim();

  // Keyword match — score each FAQ
  const scored = faqs.map(faq => {
    const questionText = faq.question.toLowerCase();
    const answerText = faq.answer.toLowerCase();
    const words = q.split(/\s+/).filter(w => w.length > 2);

    let score = 0;
    // Exact phrase match in question
    if (questionText.includes(q)) score += 10;
    // Exact phrase match in answer
    if (answerText.includes(q)) score += 5;
    // Word-level matches
    for (const word of words) {
      if (questionText.includes(word)) score += 2;
      if (answerText.includes(word)) score += 1;
    }
    // Category match
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

  // AI fallback
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

// POST /api/questions — save unanswered question
app.post('/api/questions', (req, res) => {
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

// GET /api/questions — admin view of all raised questions
app.get('/api/questions', (req, res) => {
  try {
    const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
    res.json({ success: true, count: questions.length, questions });
  } catch {
    res.status(500).json({ success: false, error: 'Could not load questions' });
  }
});

// ─── Startup ─────────────────────────────────────────────────────────────────
async function start() {
  await parsePDFToFAQs();
  app.listen(PORT, () => {
    console.log(`\n🏢 ASBL Legacy FAQ Server running at http://localhost:${PORT}`);
    console.log(`   FAQs: http://localhost:${PORT}/api/faqs`);
    console.log(`   Questions: http://localhost:${PORT}/api/questions\n`);
  });
}

start();
