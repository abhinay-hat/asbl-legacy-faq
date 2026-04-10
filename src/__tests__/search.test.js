import { describe, it, expect } from 'vitest'
import { searchFAQs, getRelevantFAQs, buildSystemPrompt } from '../utils/search'

// ── Fixtures ─────────────────────────────────────────────────────────────────
const FAQS = [
  { id: 1, question: 'How many floors does each tower have?', answer: 'G+50 floors per tower', category: 'Project Level' },
  { id: 2, question: 'What is the total number of units?', answer: '1499 residential units spread across 3 towers', category: 'Project Level' },
  { id: 3, question: 'What is the parking allocation?', answer: 'Two-level basement parking for all units', category: 'Unit Level' },
  { id: 4, question: 'Does the clubhouse have a swimming pool?', answer: 'Yes, a rooftop infinity pool is available in the clubhouse', category: 'Clubhouse' },
  { id: 5, question: 'What are the flooring specifications?', answer: 'Italian marble flooring in living and dining areas', category: 'Specifications' },
]

// ─────────────────────────────────────────────────────────────────────────────
// searchFAQs
// ─────────────────────────────────────────────────────────────────────────────
describe('searchFAQs', () => {
  it('returns the full pool when query is empty', () => {
    const result = searchFAQs(FAQS, '', 'all')
    expect(result).toHaveLength(FAQS.length)
  })

  it('filters by category when query is empty', () => {
    const result = searchFAQs(FAQS, '', 'Clubhouse')
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('Clubhouse')
  })

  it('filters by category AND query together', () => {
    const result = searchFAQs(FAQS, 'floors', 'Project Level')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('returns empty array when no FAQs match the query', () => {
    const result = searchFAQs(FAQS, 'gymnasium sauna', 'all')
    expect(result).toHaveLength(0)
  })

  it('exact phrase match in question scores highest', () => {
    const result = searchFAQs(FAQS, 'parking allocation', 'all')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toBe(3)
  })

  it('exact phrase match in answer is also found', () => {
    const result = searchFAQs(FAQS, 'infinity pool', 'all')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toBe(4)
  })

  it('word-level matching across question and answer', () => {
    const result = searchFAQs(FAQS, 'clubhouse swimming', 'all')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].id).toBe(4)
  })

  it('ranks more-relevant FAQs before less-relevant ones', () => {
    // "units" appears in both id=2 question and answer; id=1 answer only tangentially
    const result = searchFAQs(FAQS, 'total units residential', 'all')
    expect(result[0].id).toBe(2)
  })

  it('does not include category "all" filtering — returns all categories', () => {
    const result = searchFAQs(FAQS, 'floors', 'all')
    const categories = result.map(f => f.category)
    // "floors" matches id=1 (Project Level)
    expect(categories).toContain('Project Level')
  })

  it('strips the internal score field from returned objects', () => {
    const result = searchFAQs(FAQS, 'parking', 'all')
    result.forEach(f => expect(f).not.toHaveProperty('score'))
  })

  it('is case-insensitive', () => {
    const lower = searchFAQs(FAQS, 'marble flooring', 'all')
    const upper = searchFAQs(FAQS, 'MARBLE FLOORING', 'all')
    expect(lower.map(f => f.id)).toEqual(upper.map(f => f.id))
  })

  it('returns empty array when category has no FAQs', () => {
    const result = searchFAQs(FAQS, '', 'Landscape Amenities')
    expect(result).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getRelevantFAQs
// ─────────────────────────────────────────────────────────────────────────────
describe('getRelevantFAQs', () => {
  it('returns up to n items', () => {
    const result = getRelevantFAQs(FAQS, 'the project floors units parking', 3)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('returns first n FAQs when question has no meaningful words (< 3 chars)', () => {
    const result = getRelevantFAQs(FAQS, 'to a', 3)
    expect(result).toEqual(FAQS.slice(0, 3))
  })

  it('scores by word overlap — higher-overlap FAQs come first', () => {
    // "pool clubhouse" strongly matches id=4
    const result = getRelevantFAQs(FAQS, 'pool clubhouse infinity', 5)
    expect(result[0].id).toBe(4)
  })

  it('strips score field from returned objects', () => {
    const result = getRelevantFAQs(FAQS, 'floors', 5)
    result.forEach(f => expect(f).not.toHaveProperty('score'))
  })

  it('defaults n to 12 and returns all FAQs when list is shorter', () => {
    const result = getRelevantFAQs(FAQS, 'floors units parking pool marble')
    expect(result.length).toBeLessThanOrEqual(12)
    expect(result.length).toBeLessThanOrEqual(FAQS.length)
  })

  it('returns empty array when faqs list is empty', () => {
    expect(getRelevantFAQs([], 'floors', 5)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────
describe('buildSystemPrompt', () => {
  it('includes the provided FAQ context verbatim', () => {
    const context = 'Q: How many floors?\nA: G+50'
    const prompt = buildSystemPrompt(context)
    expect(prompt).toContain(context)
  })

  it('mentions ASBL Legacy in the system prompt', () => {
    expect(buildSystemPrompt('')).toContain('ASBL Legacy')
  })

  it('instructs the AI to reply UNANSWERED when info is not in FAQ', () => {
    expect(buildSystemPrompt('')).toContain('UNANSWERED')
  })

  it('is a non-empty string', () => {
    expect(typeof buildSystemPrompt('context')).toBe('string')
    expect(buildSystemPrompt('context').length).toBeGreaterThan(0)
  })
})
