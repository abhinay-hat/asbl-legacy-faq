import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchFAQs, saveQuestion, fetchQuestions, addFAQ, updateFAQ, deleteFAQ, answerQuestion, getFaqVersions, signIn, signOut, getSession, onAuthStateChange, listUsers, createUser, updateUserPassword, deleteUser } from './utils/supabase'
import { searchFAQs, getRelevantFAQs, buildSystemPrompt } from './utils/search'
import logoImg from './assets/logo.png'
import './App.css'

// ── LoginPage ──────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPw, setShowPw]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      await onLogin(username.trim(), password)
    } catch {
      setError('Invalid username or password')
      setPassword('')
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <LogoSVG height={72} />
        </div>
        <div className="login-divider" />
        <h1 className="login-title">Sales Intelligence Portal</h1>
        <p className="login-sub">Sign in to access the project FAQ</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="lg-user">Username</label>
            <input
              id="lg-user" type="text"
              placeholder="Enter your username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="lg-pass">Password</label>
            <div className="pw-wrap">
              <input
                id="lg-pass"
                type={showPw ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} aria-label="Toggle password">
                {showPw ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-submit login-btn" disabled={loading}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10,17 15,12 10,7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer">Access restricted to authorised personnel only.</p>
      </div>
    </div>
  )
}

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES = ['Project Level', 'Unit Level', 'Clubhouse', 'Urban Corridor', 'Landscape Amenities', 'Specifications']
// ── AI Providers ───────────────────────────────────────────────────────────
const OR_KEY       = import.meta.env.VITE_OPENROUTER_API_KEY
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY
const CEREBRAS_KEY = import.meta.env.VITE_CEREBRAS_API_KEY

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
        temperature: 0.3,
        max_completion_tokens: 400,
        top_p: 1,
        stream: false,
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

async function askCerebras(userQuestion, allFaqs) {
  if (!CEREBRAS_KEY) return null
  const context = getRelevantFAQs(allFaqs, userQuestion).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
  try {
    const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CEREBRAS_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.1-8b',
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
    console.log('[Cerebras] answered first')
    return answer
  } catch { return null }
}

// Race all three — return first non-null answer
async function askAI(userQuestion, allFaqs) {
  return new Promise((resolve) => {
    let settled = false
    let remaining = 3

    function handle(answer) {
      remaining--
      if (answer && !settled) {
        settled = true
        resolve(answer)
      } else if (remaining === 0 && !settled) {
        resolve(null)
      }
    }

    askCerebras(userQuestion, allFaqs).then(handle).catch(() => handle(null))
    askGroq(userQuestion, allFaqs).then(handle).catch(() => handle(null))
    askOpenRouter(userQuestion, allFaqs).then(handle).catch(() => handle(null))
  })
}

// ── Logo ───────────────────────────────────────────────────────────────────
function LogoSVG({ height = 48 }) {
  return (
    <img
      src={logoImg}
      alt="ASBL Legacy RTC Cross Road"
      style={{ height, width: 'auto', display: 'block' }}
    />
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

// ── Search Logic ── (imported from ./utils/search) ─────────────────────────

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

// ── FaqVersionHistory ─────────────────────────────────────────────────────
function FaqVersionHistory({ faqId, onClose }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFaqVersions(faqId)
      .then(v => { setVersions(v); setLoading(false) })
      .catch(() => setLoading(false))
  }, [faqId])

  function formatDate(iso) {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="version-panel">
      <div className="version-panel-header">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
          </svg>
          Version History <span className="version-count">{versions.length} saved</span>
        </span>
        <button className="version-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      {loading && <div className="version-empty">Loading...</div>}
      {!loading && versions.length === 0 && <div className="version-empty">No previous versions. Edits will be saved here automatically.</div>}
      {versions.map((v, i) => (
        <div key={v.id} className="version-item">
          <div className="version-meta">
            <span className="version-num">v{versions.length - i}</span>
            <span className="version-date">{formatDate(v.created_at)}</span>
            <span className="version-cat-tag">{v.category}</span>
          </div>
          <div className="version-q">{v.question}</div>
          <div className="version-a">{v.answer}</div>
        </div>
      ))}
    </div>
  )
}

// ── FaqManager (admin) ─────────────────────────────────────────────────────
function FaqManager({ faqs, onFaqsChange }) {
  const CATS = ['Project Level', 'Unit Level', 'Clubhouse', 'Urban Corridor', 'Landscape Amenities', 'Specifications']
  const [editId, setEditId] = useState(null)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editOriginal, setEditOriginal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [newCat, setNewCat] = useState(CATS[0])
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [historyId, setHistoryId] = useState(null)

  function startEdit(faq) {
    setEditId(faq.id)
    setEditQ(faq.question)
    setEditA(faq.answer)
    setEditCat(faq.category)
    setEditOriginal(faq)
    setSaveErr('')
    setHistoryId(null)
  }

  function cancelEdit() { setEditId(null); setSaveErr(''); setEditOriginal(null) }

  async function saveEdit() {
    if (!editQ.trim() || !editA.trim()) return
    setSaving(true); setSaveErr('')
    try {
      // Pass original so updateFAQ can snapshot the old version
      const updated = await updateFAQ(editId, { question: editQ.trim(), answer: editA.trim(), category: editCat }, editOriginal)
      onFaqsChange(faqs.map(f => f.id === editId ? updated : f))
      setEditId(null); setEditOriginal(null)
    } catch (e) {
      setSaveErr('Save failed: ' + (e.message || 'Unknown error'))
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this FAQ permanently? This cannot be undone.')) return
    try {
      await deleteFAQ(id)
      onFaqsChange(faqs.filter(f => f.id !== id))
    } catch (e) {
      alert('Delete failed: ' + (e.message || 'Unknown error'))
    }
  }

  async function handleAdd() {
    if (!newQ.trim() || !newA.trim()) return
    setAdding(true); setAddErr('')
    try {
      const created = await addFAQ({ question: newQ.trim(), answer: newA.trim(), category: newCat })
      onFaqsChange([...faqs, created])
      setNewQ(''); setNewA(''); setNewCat(CATS[0]); setShowAdd(false)
    } catch (e) {
      setAddErr('Add failed: ' + (e.message || 'Unknown error'))
    } finally { setAdding(false) }
  }

  const displayed = faqs.filter(f => {
    const catMatch = filterCat === 'all' || f.category === filterCat
    if (!catMatch) return false
    if (!searchQ.trim()) return true
    const q = searchQ.toLowerCase()
    return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
  })

  return (
    <section className="admin-section">
      <div className="admin-header">
        <h2 className="admin-title">FAQ Manager</h2>
        <button className="btn-primary" onClick={() => setShowAdd(v => !v)} style={{ marginTop: 0 }}>
          {showAdd
            ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg> Cancel</>
            : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg> Add FAQ</>
          }
        </button>
        <p className="admin-sub">{faqs.length} FAQs · edits auto-versioned · AI always uses the latest</p>
      </div>

      {showAdd && (
        <div className="faq-add-panel">
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Add New FAQ</h3>
          <div className="form-group">
            <label>Category</label>
            <select value={newCat} onChange={e => setNewCat(e.target.value)} className="faq-select">
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Question</label>
            <input type="text" value={newQ} onChange={e => setNewQ(e.target.value)} placeholder="Enter the question..." className="faq-input" />
          </div>
          <div className="form-group">
            <label>Answer</label>
            <textarea rows={4} value={newA} onChange={e => setNewA(e.target.value)} placeholder="Enter the answer..." className="faq-textarea" />
          </div>
          {addErr && <p className="form-error">{addErr}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleAdd} disabled={adding || !newQ.trim() || !newA.trim()}>
              {adding ? 'Saving...' : 'Save FAQ'}
            </button>
            <button className="btn-outline" onClick={() => { setShowAdd(false); setAddErr('') }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="faq-search-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          className="faq-search-input"
          placeholder={`Search ${faqs.length} FAQs by question or answer...`}
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
        {searchQ && (
          <button className="faq-search-clear" onClick={() => setSearchQ('')} aria-label="Clear">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      <div className="faq-filter-bar">
        {['all', ...CATS].map(c => (
          <button key={c} className={`pill ${filterCat === c ? 'active' : ''}`} onClick={() => setFilterCat(c)}>
            {c === 'all' ? `All (${faqs.length})` : c}
          </button>
        ))}
      </div>
      {displayed.length < faqs.length && (
        <p className="faq-search-count">{displayed.length} result{displayed.length !== 1 ? 's' : ''}{searchQ ? ` for "${searchQ}"` : ''}</p>
      )}

      {displayed.length === 0 && <div className="admin-empty">No FAQs in this category.</div>}

      {displayed.map(faq => (
        <div key={faq.id} className="faq-mgmt-card">
          {editId === faq.id ? (
            <div className="faq-edit-form">
              <div className="form-group">
                <label>Category</label>
                <select value={editCat} onChange={e => setEditCat(e.target.value)} className="faq-select">
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Question</label>
                <input type="text" value={editQ} onChange={e => setEditQ(e.target.value)} className="faq-input" />
              </div>
              <div className="form-group">
                <label>Answer</label>
                <textarea rows={4} value={editA} onChange={e => setEditA(e.target.value)} className="faq-textarea" />
              </div>
              {saveErr && <p className="form-error">{saveErr}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={saveEdit} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn-outline" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="faq-mgmt-meta">
                <span className="faq-cat-tag">{faq.category}</span>
              </div>
              <div className="faq-mgmt-q">{faq.question}</div>
              <div className="faq-mgmt-a">{faq.answer}</div>
              <div className="faq-mgmt-actions">
                <button className="btn-edit" onClick={() => startEdit(faq)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
                <button className="btn-edit" onClick={() => setHistoryId(historyId === faq.id ? null : faq.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                  </svg>
                  History
                </button>
                <button className="btn-delete" onClick={() => handleDelete(faq.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  Delete
                </button>
              </div>
              {historyId === faq.id && (
                <FaqVersionHistory faqId={faq.id} onClose={() => setHistoryId(null)} />
              )}
            </>
          )}
        </div>
      ))}
    </section>
  )
}

// ── RaisedQuestionsView ────────────────────────────────────────────────────
function RaisedQuestionsView({ onFaqAdded }) {
  const CATS = ['Project Level', 'Unit Level', 'Clubhouse', 'Urban Corridor', 'Landscape Amenities', 'Specifications']
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedAI, setExpandedAI] = useState({})
  const [answerFor, setAnswerFor] = useState(null)  // question id being answered
  const [answerText, setAnswerText] = useState('')
  const [addToFaq, setAddToFaq] = useState(true)
  const [faqCat, setFaqCat] = useState(CATS[0])
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'answered'

  async function load() {
    setLoading(true); setError('')
    try {
      const data = await fetchQuestions()
      setQuestions(data)
    } catch (err) {
      setError('Could not load questions from Supabase.')
      console.error(err)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function startAnswer(q) {
    setAnswerFor(q.id)
    setAnswerText(q.admin_answer || '')
    setAddToFaq(true)
    setFaqCat(CATS[0])
    setSubmitErr('')
  }

  function cancelAnswer() { setAnswerFor(null); setAnswerText(''); setSubmitErr('') }

  async function submitAnswer(q) {
    if (!answerText.trim()) return
    setSubmitting(true); setSubmitErr('')
    try {
      const updated = await answerQuestion(q.id, {
        answer: answerText.trim(),
        addToFaq,
        faqQuestion: q.question,
        faqCategory: faqCat,
      })
      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, ...updated } : item))
      if (addToFaq && onFaqAdded) onFaqAdded()
      setAnswerFor(null); setAnswerText('')
    } catch (e) {
      setSubmitErr('Failed: ' + (e.message || 'Unknown error'))
    } finally { setSubmitting(false) }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const displayed = questions.filter(q =>
    filter === 'all' ? true : filter === 'pending' ? q.status !== 'answered' : q.status === 'answered'
  )
  const pendingCount = questions.filter(q => q.status !== 'answered').length

  return (
    <section className="admin-section">
      <div className="admin-header">
        <h2 className="admin-title">
          Raised Questions
          {pendingCount > 0 && <span className="pending-badge">{pendingCount} pending</span>}
        </h2>
        <button className="btn-outline" onClick={load} style={{ marginTop: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23,4 23,11 16,11"/><polyline points="1,20 1,13 8,13"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 11M1 13l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Refresh
        </button>
        <p className="admin-sub">Answer questions to respond to the sales team · tick "Add to FAQ" to train the AI</p>
      </div>

      <div className="faq-filter-bar">
        {[['all', `All (${questions.length})`], ['pending', `Pending (${pendingCount})`], ['answered', `Answered (${questions.length - pendingCount})`]].map(([val, label]) => (
          <button key={val} className={`pill ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>

      {loading && <div className="admin-empty">Loading from Supabase...</div>}
      {error && <div className="admin-empty" style={{ color: '#9F1239' }}>{error}</div>}
      {!loading && !error && displayed.length === 0 && (
        <div className="admin-empty">{filter === 'pending' ? 'No pending questions.' : filter === 'answered' ? 'No answered questions yet.' : 'No questions raised yet.'}</div>
      )}

      {!loading && !error && displayed.map(q => (
        <div key={q.id} className={`admin-card ${q.status === 'answered' ? 'answered' : ''}`}>
          <div style={{ flex: 1 }}>
            <div className="admin-q">{q.question}</div>
            <div className="admin-meta">
              <span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {q.name}
              </span>
              <span>{formatDate(q.created_at)}</span>
            </div>

            {/* Existing admin answer */}
            {q.admin_answer && answerFor !== q.id && (
              <div className="admin-answer-preview">
                <span className="answer-label">Answer:</span> {q.admin_answer}
              </div>
            )}

            {/* AI answer toggle */}
            {q.ai_answer && (
              <div className="admin-ai-section">
                <button className="admin-ai-toggle"
                  onClick={() => setExpandedAI(prev => ({ ...prev, [q.id]: !prev[q.id] }))}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                  </svg>
                  {expandedAI[q.id] ? 'Hide' : 'View'} AI Response
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       style={{ width: 12, height: 12, transform: expandedAI[q.id] ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
                    <polyline points="6,9 12,15 18,9"/>
                  </svg>
                </button>
                {expandedAI[q.id] && <div className="admin-ai-answer">{q.ai_answer}</div>}
              </div>
            )}

            {/* Inline answer form */}
            {answerFor === q.id ? (
              <div className="answer-form">
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label>Your Answer</label>
                  <textarea
                    rows={4} className="faq-textarea"
                    placeholder="Type the answer to this question..."
                    value={answerText}
                    onChange={e => setAnswerText(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="answer-faq-row">
                  <label className="answer-faq-check">
                    <input type="checkbox" checked={addToFaq} onChange={e => setAddToFaq(e.target.checked)} />
                    <span>Add to FAQ knowledge base</span>
                    <span className="answer-faq-hint">(AI will use this immediately)</span>
                  </label>
                  {addToFaq && (
                    <select value={faqCat} onChange={e => setFaqCat(e.target.value)} className="faq-select" style={{ marginLeft: 'auto' }}>
                      {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                {submitErr && <p className="form-error">{submitErr}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn-primary" onClick={() => submitAnswer(q)} disabled={submitting || !answerText.trim()}>
                    {submitting ? 'Saving...' : addToFaq ? 'Save & Add to FAQ' : 'Save Answer'}
                  </button>
                  <button className="btn-outline" onClick={cancelAnswer}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <button className="btn-answer" onClick={() => startAnswer(q)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  {q.admin_answer ? 'Edit Answer' : 'Add Answer'}
                </button>
              </div>
            )}
          </div>

          <div className="admin-badges">
            <span className={`priority-badge ${q.priority}`}>{q.priority}</span>
            <span className={`status-badge ${q.status}`}>{q.status}</span>
            {q.ai_answer && <span className="ai-stored-badge">AI logged</span>}
            {q.admin_answer && <span className="answered-badge">Answered</span>}
          </div>
        </div>
      ))}
    </section>
  )
}

// ── User Manager (super_admin only) ───────────────────────────────────────
const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', viewer: 'Viewer' }

function UserManager() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [saving, setSaving] = useState(false)
  const [visiblePw, setVisiblePw] = useState({})
  const [editPw, setEditPw] = useState({}) // userId → new password input
  const [resetSaving, setResetSaving] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try { setUsers(await listUsers()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newEmail.trim() || !newPass.trim()) return
    setSaving(true); setError('')
    try {
      const u = await createUser({ email: newEmail.trim(), password: newPass.trim(), role: newRole, username: newEmail.trim().split('@')[0] })
      setUsers(prev => [...prev, u])
      setNewEmail(''); setNewPass(''); setNewRole('viewer'); setShowAdd(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(u) {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return
    try {
      await deleteUser(u.id)
      setUsers(prev => prev.filter(x => x.id !== u.id))
    } catch (e) { setError(e.message) }
  }

  async function handleResetPw(u) {
    const pw = editPw[u.id]?.trim()
    if (!pw) return
    setResetSaving(prev => ({ ...prev, [u.id]: true }))
    try {
      await updateUserPassword(u.id, pw)
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, initial_password: pw } : x))
      setEditPw(prev => ({ ...prev, [u.id]: '' }))
    } catch (e) { setError(e.message) }
    finally { setResetSaving(prev => ({ ...prev, [u.id]: false })) }
  }

  const roleOrder = { super_admin: 0, admin: 1, viewer: 2 }
  const sorted = [...users].sort((a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3))

  return (
    <div className="user-manager">
      <div className="user-manager-header">
        <h2 className="user-manager-title">User Management</h2>
        <button className="btn-primary" onClick={() => setShowAdd(v => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Add User
        </button>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

      {showAdd && (
        <form className="user-add-panel" onSubmit={handleAdd}>
          <div className="user-add-row">
            <input className="faq-input" type="email" placeholder="Email address" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
            <input className="faq-input" type="text" placeholder="Password" value={newPass} onChange={e => setNewPass(e.target.value)} required />
            <select className="faq-select" value={newRole} onChange={e => setNewRole(e.target.value)}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
            <button type="button" className="btn-edit" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="ai-loading-wrap"><div className="ai-spinner" /><p>Loading users…</p></div>
      ) : (
        <div className="user-list">
          {sorted.map(u => (
            <div key={u.id} className="user-card">
              <div className="user-card-top">
                <div className="user-card-info">
                  <span className={`user-role-badge role-${u.role}`}>{ROLE_LABELS[u.role] || u.role}</span>
                  <span className="user-email">{u.email}</span>
                </div>
                {u.role !== 'super_admin' && (
                  <button className="btn-delete" onClick={() => handleDelete(u)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    Delete
                  </button>
                )}
              </div>
              <div className="user-card-pw">
                <span className="user-pw-label">Password:</span>
                <span className="user-pw-value">
                  {visiblePw[u.id] ? (u.initial_password || '—') : '••••••••'}
                </span>
                <button className="pw-toggle-sm" onClick={() => setVisiblePw(prev => ({ ...prev, [u.id]: !prev[u.id] }))}>
                  {visiblePw[u.id] ? 'Hide' : 'Show'}
                </button>
              </div>
              {u.role !== 'super_admin' && (
                <div className="user-reset-row">
                  <input className="faq-input user-reset-input" type="text" placeholder="New password…"
                    value={editPw[u.id] || ''} onChange={e => setEditPw(prev => ({ ...prev, [u.id]: e.target.value }))} />
                  <button className="btn-edit" disabled={!editPw[u.id]?.trim() || resetSaving[u.id]}
                    onClick={() => handleResetPw(u)}>
                    {resetSaving[u.id] ? 'Saving…' : 'Reset Password'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────────
function Toast({ msg }) {
  return <div className={`toast ${msg ? 'show' : ''}`}>{msg}</div>
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [faqs, setFaqs] = useState([])
  const [faqsLoading, setFaqsLoading] = useState(true)
  const [faqsError, setFaqsError] = useState('')
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return h === 'admin' || h === 'admin/faqs' || h === 'admin/questions' || h === 'admin/users' ? 'admin' : 'search'
  })
  const [adminTab, setAdminTab] = useState(() => {
    const h = window.location.hash.replace('#', '')
    if (h === 'admin/questions') return 'questions'
    if (h === 'admin/users') return 'users'
    return 'faqs'
  })
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [results, setResults] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnswer, setAiAnswer] = useState(null)
  const [toast, setToast] = useState('')
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  // Auth: load session on mount + listen for changes
  useEffect(() => {
    getSession().then(session => {
      if (session) {
        const meta = session.user.user_metadata
        setUser({ username: meta.username || session.user.email, role: meta.role || 'viewer' })
      }
      setAuthChecked(true)
    })
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      if (session) {
        const meta = session.user.user_metadata
        setUser({ username: meta.username || session.user.email, role: meta.role || 'viewer' })
      } else {
        setUser(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Sync tab state → URL hash (so refresh restores the view)
  useEffect(() => {
    const hash = tab === 'admin' ? `admin/${adminTab}` : 'search'
    window.history.replaceState(null, '', `#${hash}`)
  }, [tab, adminTab])

  // If a viewer lands on the admin tab (stale hash from a previous admin session), guard it
  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin')
  const activeTab = (!isAdmin && tab === 'admin') ? 'search' : tab

  async function login(username, password) {
    await signIn(username, password)
    // user state updated automatically via onAuthStateChange
  }

  async function logout() {
    await signOut()
  }

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

  // Auth gates — placed after all hooks
  if (!authChecked) return null
  if (!user) return <LoginPage onLogin={login} />

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
            <button className={`nav-btn ${activeTab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>Search FAQ</button>
            {isAdmin && (
              <button className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>Admin</button>
            )}
          </nav>
          <div className="header-user">
            <span className="header-username">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {user.username}
              {user.role === 'super_admin' && <span className="header-role-badge" style={{background:'#1e3a5f'}}>Super Admin</span>}
              {user.role === 'admin' && <span className="header-role-badge">Admin</span>}
            </span>
            <button className="btn-signout" onClick={logout} title="Sign out">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'search' && (
        <main>
          <section className="hero">
            <p className="hero-eyebrow">Sales Intelligence Portal</p>
            <h1 className="hero-title">ASBL Legacy<br /><span className="hero-accent">Instantly</span></h1>
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

      {activeTab === 'admin' && isAdmin && (
        <div className="admin-page">
          <div className="admin-tabs">
            <button className={`admin-tab-btn ${adminTab === 'faqs' ? 'active' : ''}`} onClick={() => setAdminTab('faqs')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              FAQ Manager
            </button>
            <button className={`admin-tab-btn ${adminTab === 'questions' ? 'active' : ''}`} onClick={() => setAdminTab('questions')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Raised Questions
            </button>
            {user.role === 'super_admin' && (
              <button className={`admin-tab-btn ${adminTab === 'users' ? 'active' : ''}`} onClick={() => setAdminTab('users')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Users
              </button>
            )}
          </div>
          {adminTab === 'faqs' && <FaqManager faqs={faqs} onFaqsChange={setFaqs} />}
          {adminTab === 'questions' && (
            <RaisedQuestionsView onFaqAdded={() => {
              fetchFAQs().then(data => setFaqs(data)).catch(() => {})
            }} />
          )}
          {adminTab === 'users' && user.role === 'super_admin' && <UserManager />}
        </div>
      )}

      <Toast msg={toast} />
    </>
  )
}
