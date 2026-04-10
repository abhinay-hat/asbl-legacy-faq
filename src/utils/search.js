/**
 * Pure search / AI-context utility functions extracted from App.jsx.
 * Keeping them in their own module makes them easy to unit-test.
 */

/**
 * Pick up to `n` most-relevant FAQs for a user question.
 * Falls back to the first `n` FAQs when no meaningful words are found.
 */
export function getRelevantFAQs(faqs, userQuestion, n = 12) {
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
    .map(({ score: _score, ...f }) => f)
}

/**
 * Build the system prompt sent to the AI providers.
 */
export function buildSystemPrompt(context) {
  return `You are a helpful sales assistant for ASBL Legacy, a premium residential project at RTC Cross Road, Hyderabad by ASBL. Answer questions using the FAQ below. Be concise and format your response clearly. If the question cannot be answered from the FAQ, reply with exactly: UNANSWERED

FAQ:
${context}`
}

/**
 * Filter and rank FAQs against a free-text query and optional category.
 * Returns only items that score above a minimum threshold so noise is avoided.
 */
export function searchFAQs(faqs, query, category) {
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
    .map(({ score: _score, ...f }) => f)
}
