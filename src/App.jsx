import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchFAQs, saveQuestion, fetchQuestions } from './utils/supabase'
import './App.css'

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = ['Project Level', 'Unit Level', 'Clubhouse', 'Urban Corridor', 'Landscape Amenities', 'Specifications']
// ── AI Providers ───────────────────────────────────────────────────────────
const OR_KEY   = import.meta.env.VITE_OPENROUTER_API_KEY
const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY

function getRelevantFAQs(faqs, userQuestion, n = 12) {
  const words = userQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return faqs.slice(0, n)
  return faqs
    .map(f => {
      const text = (f.question + ' ' + f.answer).toLowerCase()
      const score = words.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0)
      return { ...f, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ score, ...f }) => f)
}

function buildSystemPrompt(context) {
  return `You are a helpful sales assistant for ASBL Legacy, a premium residential project at RTC Cross Road, Hyderabad by ASBL. Answer questions using the FAQ below. Be concise and format your response clearly. If the question cannot be answered from the FAQ, reply with exactly: UNANSWERED

FAQ:
${context}`
}

async function askOpenRouter(userQuestion, allFaqs) {
  if (!OR_KEY) return null
  const context = getRelevantFAQs(allFaqs, userQuestion).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'ASBL Legacy FAQ',
      },
      body: JSON.stringify({
        model: 'google/gemma-4-26b-a4b-it',
        messages: [
          { role: 'system', content: buildSystemPrompt(context) },
          { role: 'user', content: userQuestion },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const answer = data?.choices?.[0]?.message?.content?.trim()
    if (!answer || answer.trim().toUpperCase() === 'UNANSWERED') return null
    console.log('[OpenRouter] answered first')
    return answer
  } catch { return null }
}

async function askGroq(userQuestion, allFaqs) {
  if (!GROQ_KEY) return null
  const context = getRelevantFAQs(allFaqs, userQuestion).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: buildSystemPrompt(context) },
          { role: 'user', content: userQuestion },
        ],
        temperature: 1,
        max_completion_tokens: 8192,
        top_p: 1,
        stream: false,
        reasoning_effort: 'medium',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const answer = data?.choices?.[0]?.message?.content?.trim()
    if (!answer || answer.trim().toUpperCase() === 'UNANSWERED') return null
    console.log('[Groq] answered first')
    return answer
  } catch { return null }
}

// Race both — return first non-null answer
async function askAI(userQuestion, allFaqs) {
  return new Promise((resolve) => {
    let settled = false
    let remaining = 2

    function handle(answer) {
      remaining--
      if (answer && !settled) {
        settled = true
        resolve(answer)
      } else if (remaining === 0 && !settled) {
        resolve(null)
      }
    }

    askOpenRouter(userQuestion, allFaqs).then(handle).catch(() => handle(null))
    askGroq(userQuestion, allFaqs).then(handle).catch(() => handle(null))
  })
}

// ── Logo SVG ───────────────────────────────────────────────────────────────
function LogoSVG({ height = 52 }) {
  return (
    <svg
      viewBox="0 0 220 72"
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ASBL Legacy RTC Cross Road"
      style={{ display: 'block' }}
    >
      <defs>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Josefin+Sans:wght@600&display=swap');
        `}</style>
      </defs>
      {/* ASBL */}
      <text
        x="110" y="13"
        fontFamily="'Josefin Sans', sans-serif"
        fontSize="10"
        fontWeight="700"
        letterSpacing="3"
        textAnchor="middle"
        fill="#0F0F0F"
      >ASBL</text>
      {/* LEGACY */}
      <text
        x="110" y="52"
        fontFamily="'Playfair Display', Georgia, serif"
        fontSize="38"
        fontWeight="400"
        letterSpacing="1"
        textAnchor="middle"
        fill="#0F0F0F"
      >LEGACY</text>
      {/* RTC CROSS ROAD */}
      <text
        x="110" y="68"
        fontFamily="'Josefin Sans', sans-serif"
        fontSize="8"
        fontWeight="600"
        letterSpacing="4"
        textAnchor="middle"
        fill="#0F0F0F"
      >RTC CROSS ROAD</text>
    </svg>
  )
}

// ── Category Icons ─────────────────────────────────────────────────────────
const CAT_ICONS = {
  'Project Level': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  ),
  'Unit Level': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
    </svg>
  ),
  'Clubhouse': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/>
      <line x1="10" y1="1" x2="10" y2="4"/>
      <line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  ),
  'Urban Corridor': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  'Landscape Amenities': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 22V12"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
      <path d="M12 12C12 7 7 3 7 3s5 1 5 9"/>
      <path d="M12 12c0-5 5-9 5-9s-5 4-5 9"/>
    </svg>
  ),
  'Specifications': (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
}

// ── Search Logic ───────────────────────────────────────────────────────────
function searchFAQs(faqs, query, category) {
  let pool = category === 'all' ? faqs : faqs.filter(f => f.category === category)
  if (!query.trim()) return pool
  const q = query.toLowerCase().trim()
  const words = q.split(/\s+/).filter(w => w.length > 2)
  // Minimum score: exact phrase match OR all words must appear in the question
  const minScore = q.length > 3 ? Math.max(4, words.length * 2) : 10

  return pool
    .map(faq => {
      const qText = faq.question.toLowerCase()
      const aText = faq.answer.toLowerCase()
      let score = 0
      if (qText.includes(q)) score += 10   // exact phrase in question
      if (aText.includes(q)) score += 5    // exact phrase in answer
      for (const w of words) {
        if (qText.includes(w)) score += 2  // word in question
        if (aText.includes(w)) score += 1  // word in answer
      }
      return { ...faq, score }
    })
    .filter(f => f.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...f }) => f)
}

// ── Markdown renderer ─────────────────────────────────────────────────────
function Markdown({ text }) {
  const lines = text.split('\n')
  const elements = []
  let listItems = []

  function flushList() {
    if (listItems.length) {
      elements.push(<ul key={elements.length} className="md-list">{listItems}</ul>)
      listItems = []
    }
  }

  function parseLine(line) {
    // bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p
    )
  }

  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) { flushList(); return }

    if (line.startsWith('* ') || line.startsWith('- ')) {
      listItems.push(<li key={i}>{parseLine(line.slice(2))}</li>)
    } else {
      flushList()
      elements.push(<p key={i} className="md-p">{parseLine(line)}</p>)
    }
  })
  flushList()

  return <div className="md-body">{elements}</div>
}

// ── ResultCard ─────────────────────────────────────────────────────────────
function ResultCard({ faq }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="result-card">
      <div className="result-header" onClick={() => setOpen(o => !o)}
           role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}>
        <div className="result-q-icon">Q</div>
        <div className="result-question">{faq.question}</div>
        <span className="result-category-tag">{faq.category}</span>
        <svg className={`result-chevron ${open ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </div>
      {open && <div className="result-answer">{faq.answer}</div>}
    </div>
  )
}

// ── RaiseForm ──────────────────────────────────────────────────────────────
function RaiseForm({ prefill, aiAnswer, onSuccess }) {
  const [name, setName] = useState('')
  const [question, setQuestion] = useState(prefill || '')
  const [priority, setPriority] = useState('Medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setQuestion(prefill || '') }, [prefill])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim() || !question.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await saveQuestion({
        name: name.trim(),
        question: question.trim(),
        priority,
        ai_answer: aiAnswer || null,
      })
      onSuccess()
    } catch (err) {
      setError('Failed to submit. Please try again.')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="raise-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="raise-name">Your Name</label>
        <input id="raise-name" type="text" placeholder="Enter your name" required
               value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="raise-q">Your Question</label>
        <textarea id="raise-q" rows={3} placeholder="Describe what you'd like to know..." required
                  value={question} onChange={e => setQuestion(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Priority</label>
        <div className="priority-group">
          {['Low', 'Medium', 'High'].map(p => (
            <label key={p} className="priority-option">
              <input type="radio" name="priority" value={p}
                     checked={priority === p} onChange={() => setPriority(p)} />
              <span>{p}</span>
            </label>
          ))}
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn-submit" disabled={submitting}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
        </svg>
        {submitting ? 'Submitting...' : 'Raise to Backend Team'}
      </button>
    </form>
  )
}

// ── AIAnswer ───────────────────────────────────────────────────────────────
function AIAnswer({ answer, query, onReset }) {
  const [showRaise, setShowRaise] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  return (
    <div className="ai-answer-wrap">
      {!submitted ? (
        <>
          <div className="ai-answer-header">
            <div className="ai-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
              AI Answer
            </div>
            <span className="ai-disclaimer">Based on project FAQ only</span>
          </div>
          <div className="ai-answer-text"><Markdown text={answer} /></div>
          <div className="ai-actions">
            <button className="btn-outline" onClick={onReset}>Ask Another</button>
            {!showRaise && (
              <button className="btn-raise-anyway" onClick={() => setShowRaise(true)}>
                Still need help? Raise to team
              </button>
            )}
          </div>
          {showRaise && (
            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                The AI answer will be saved alongside your question so the team has full context.
              </p>
              <RaiseForm prefill={query} aiAnswer={answer} onSuccess={() => setSubmitted(true)} />
            </div>
          )}
        </>
      ) : (
        <div className="raise-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
          <h4>Question Raised!</h4>
          <p>Saved to Supabase with AI context. The team will respond shortly.</p>
          <button className="btn-outline" onClick={onReset}>Ask Another Question</button>
        </div>
      )}
    </div>
  )
}

// ── NoResults ──────────────────────────────────────────────────────────────
function NoResults({ query, onReset }) {
  const [submitted, setSubmitted] = useState(false)
  return (
    <div className="no-results-wrap">
      <div className="no-results-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          <path d="M11 8v3M11 14h.01"/>
        </svg>
      </div>
      {!submitted ? (
        <>
          <h3>Not found in FAQ</h3>
          <p>Raise this question to the Backend Team and we'll get back to you.</p>
          <RaiseForm prefill={query} aiAnswer={null} onSuccess={() => setSubmitted(true)} />
        </>
      ) : (
        <div className="raise-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
          <h4>Question Raised!</h4>
          <p>Saved to Supabase. The team will respond shortly.</p>
          <button className="btn-outline" onClick={onReset}>Ask Another Question</button>
        </div>
      )}
    </div>
  )
}

// ── AdminView ──────────────────────────────────────────────────────────────
function AdminView() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedAI, setExpandedAI] = useState({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await fetchQuestions()
      setQuestions(data)
    } catch (err) {
      setError('Could not load questions from Supabase.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function formatDate(iso) {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <section className="admin-section">
      <div className="admin-header">
        <h2 className="admin-title">Raised Questions</h2>
        <button className="btn-outline" onClick={load} style={{ marginTop: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23,4 23,11 16,11"/><polyline points="1,20 1,13 8,13"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 11M1 13l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
        <p className="admin-sub">Unanswered questions submitted by the sales team — stored in Supabase</p>
      </div>

      {loading && <div className="admin-empty">Loading from Supabase...</div>}
      {error && <div className="admin-empty" style={{ color: '#9F1239' }}>{error}</div>}

      {!loading && !error && questions.length === 0 && (
        <div className="admin-empty">No questions raised yet.</div>
      )}

      {!loading && !error && questions.map(q => (
        <div key={q.id} className="admin-card">
          <div style={{ flex: 1 }}>
            <div className="admin-q">{q.question}</div>
            <div className="admin-meta">
              <span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                {q.name}
              </span>
              <span>{formatDate(q.created_at)}</span>
            </div>

            {/* AI Answer stored with this question */}
            {q.ai_answer && (
              <div className="admin-ai-section">
                <button
                  className="admin-ai-toggle"
                  onClick={() => setExpandedAI(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                  {expandedAI[q.id] ? 'Hide' : 'View'} AI Response
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       style={{ width: 12, height: 12, transform: expandedAI[q.id] ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
                    <polyline points="6,9 12,15 18,9"/>
                  </svg>
                </button>
                {expandedAI[q.id] && (
                  <div className="admin-ai-answer">{q.ai_answer}</div>
                )}
              </div>
            )}
          </div>

          <div className="admin-badges">
            <span className={`priority-badge ${q.priority}`}>{q.priority}</span>
            <span className="status-badge">{q.status}</span>
            {q.ai_answer && <span className="ai-stored-badge">AI logged</span>}
          </div>
        </div>
      ))}
    </section>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ msg }) {
  return <div className={`toast ${msg ? 'show' : ''}`}>{msg}</div>
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [faqs, setFaqs] = useState([])
  const [faqsLoading, setFaqsLoading] = useState(true)
  const [faqsError, setFaqsError] = useState('')
  const [tab, setTab] = useState('search')
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [results, setResults] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnswer, setAiAnswer] = useState(null)
  const [toast, setToast] = useState('')
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  // Load FAQs from Supabase on mount
  useEffect(() => {
    fetchFAQs()
      .then(data => { setFaqs(data); setFaqsLoading(false) })
      .catch(err => { console.error(err); setFaqsError('Failed to load FAQs from Supabase.'); setFaqsLoading(false) })
  }, [])

  const catCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = faqs.filter(f => f.category === cat).length
    return acc
  }, {})

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const runSearch = useCallback(async (q, cat, faqList) => {
    setAiAnswer(null)
    if (!q.trim() && cat === 'all') { setResults(null); return }

    const found = searchFAQs(faqList, q, cat)
    // Show FAQ matches immediately (may be empty)
    setResults({ items: found, source: cat !== 'all' && !q.trim() ? 'cat' : 'faq' })

    // Always call AI for typed queries — show on top
    if (q.trim()) {
      setAiLoading(true)
      const answer = await askAI(q, faqList)
      setAiLoading(false)
      if (answer) setAiAnswer(answer)
    }
  }, [])

  function handleInput(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(val, activeCategory, faqs), 300)
  }

  function handleClear() {
    setQuery('')
    setResults(null)
    setAiAnswer(null)
    setAiLoading(false)
    setActiveCategory('all')
    inputRef.current?.focus()
  }

  function handleCategoryClick(cat) {
    setActiveCategory(cat)
    runSearch(query, cat, faqs)
  }

  function handleCatCardClick(cat) {
    setActiveCategory(cat)
    setResults({ items: faqs.filter(f => f.category === cat), source: 'cat' })
    window.scrollTo({ top: 200, behavior: 'smooth' })
  }

  const hasResults = results !== null
  const noMatch = hasResults && results.items.length === 0 && query.trim()

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="logo-wrap">
            <LogoSVG />
          </div>
          <nav className="header-nav">
            <button className={`nav-btn ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>Search FAQ</button>
            <button className={`nav-btn ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>Admin View</button>
          </nav>
        </div>
      </header>

      {tab === 'search' && (
        <main>
          <section className="hero">
            <p className="hero-eyebrow">Sales Intelligence Portal</p>
            <h1 className="hero-title">Find Any Answer<br /><span className="hero-accent">Instantly</span></h1>
            <p className="hero-sub">Search the complete project FAQ for ASBL Legacy at RTC Cross Road</p>
          </section>

          <section className="search-section">
            <div className="search-container">
              <div className="search-wrap">
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input ref={inputRef} className="search-input" type="text" autoComplete="off"
                  placeholder="Type your question — e.g. 'How many floors?' or 'parking logic'"
                  value={query} onChange={handleInput} />
                <button className={`search-clear ${query ? 'visible' : ''}`} onClick={handleClear} aria-label="Clear">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div className="category-pills">
                {['all', ...CATEGORIES].map(cat => (
                  <button key={cat} className={`pill ${activeCategory === cat ? 'active' : ''}`}
                          onClick={() => handleCategoryClick(cat)}>
                    {cat === 'all' ? 'All' : cat}
                  </button>
                ))}
              </div>
            </div>

            {faqsLoading && (
              <div className="ai-loading-wrap">
                <div className="ai-spinner" />
                <p>Loading FAQs from Supabase...</p>
              </div>
            )}

            {faqsError && (
              <div className="no-results-wrap" style={{ textAlign: 'center' }}>
                <p style={{ color: '#9F1239' }}>{faqsError}</p>
              </div>
            )}

            {!hasResults && !faqsLoading && !faqsError && (
              <>
                <div className="stats-bar">
                  <div className="stat-item"><span className="stat-num">{faqs.length}</span><span className="stat-label">Total FAQs</span></div>
                  <div className="stat-item"><span className="stat-num">6</span><span className="stat-label">Categories</span></div>
                  <div className="stat-item"><span className="stat-num">G+50</span><span className="stat-label">Floors / Tower</span></div>
                  <div className="stat-item"><span className="stat-num">1499</span><span className="stat-label">Total Units</span></div>
                </div>
                <p className="section-title">Browse by Category</p>
                <div className="category-grid">
                  {CATEGORIES.map(cat => (
                    <div key={cat} className="cat-card" onClick={() => handleCatCardClick(cat)}
                         role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && handleCatCardClick(cat)}>
                      <div className="cat-icon">{CAT_ICONS[cat]}</div>
                      <div className="cat-name">{cat}</div>
                      <div className="cat-count">{catCounts[cat]} question{catCounts[cat] !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* AI loader — top */}
            {aiLoading && (
              <div className="ai-loading-wrap">
                <div className="ai-spinner" />
                <p>Getting AI answer...</p>
              </div>
            )}

            {/* AI answer — top */}
            {!aiLoading && aiAnswer && (
              <AIAnswer answer={aiAnswer} query={query}
                onReset={() => { handleClear(); showToast('Question raised to Supabase!') }} />
            )}

            {/* FAQ matches — below AI */}
            {!faqsLoading && hasResults && results.items.length > 0 && (
              <>
                <div className="results-header" style={{ marginTop: aiAnswer ? 24 : 0 }}>
                  <span>{results.items.length} related FAQ{results.items.length !== 1 ? 's' : ''}</span>
                  <span className={`source-badge ${results.source}`}>
                    {results.source === 'cat' ? activeCategory : 'FAQ Match'}
                  </span>
                  <button className="btn-outline" onClick={handleClear} style={{ marginTop: 0, padding: '4px 12px', fontSize: 11 }}>← Back</button>
                </div>
                {results.items.map(faq => <ResultCard key={faq.id} faq={faq} />)}
              </>
            )}

            {/* Raise form — only when AI + FAQ both return nothing */}
            {noMatch && !aiLoading && !aiAnswer && (
              <NoResults query={query}
                onReset={() => { handleClear(); showToast('Question raised to Supabase!') }} />
            )}
          </section>
        </main>
      )}

      {tab === 'admin' && <AdminView />}

      <Toast msg={toast} />
    </>
  )
}
