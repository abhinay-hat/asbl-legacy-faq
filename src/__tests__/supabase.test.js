/**
 * Unit tests for src/utils/supabase.js
 *
 * Strategy: mock @supabase/supabase-js at the module level so that every
 * call to `supabase.auth.*` and `supabase.from(...)*` is a vi.fn() we control.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock factory (hoisted so vi.mock can reference them) ─────────────
const {
  mockSignInWithPassword,
  mockSignOut,
  mockGetSession,
  mockOnAuthStateChange,
  mockFrom,
} = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockSignOut:            vi.fn(),
  mockGetSession:         vi.fn(),
  mockOnAuthStateChange:  vi.fn(),
  mockFrom:               vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut:            mockSignOut,
      getSession:         mockGetSession,
      onAuthStateChange:  mockOnAuthStateChange,
    },
    from: mockFrom,
  }),
}))

// Mock the local JSON fallback imported inside supabase.js (../faqs.json from src/utils/)
vi.mock('../faqs.json', () => ({ default: [{ id: 0, question: 'local', answer: 'fallback', category: 'Project Level' }] }))

// Import AFTER mocks are set up
import {
  signIn,
  signOut as supabaseSignOut,
  getSession,
  onAuthStateChange,
  fetchFAQs,
  saveQuestion,
  fetchQuestions,
  addFAQ,
  updateFAQ,
  deleteFAQ,
  answerQuestion,
  getFaqVersions,
} from '../utils/supabase'

// ─────────────────────────────────────────────────────────────────────────────
describe('signIn', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes a full email directly to supabase', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
    await signIn('user@asbl.in', 'Pass@123')
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'user@asbl.in', password: 'Pass@123' })
  })

  it('appends @asbl.internal for bare usernames', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { session: {} }, error: null })
    await signIn('admin', 'Pass@123')
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'admin@asbl.internal', password: 'Pass@123' })
  })

  it('throws when supabase returns an error', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: null, error: new Error('Invalid credentials') })
    await expect(signIn('bad@asbl.in', 'wrong')).rejects.toThrow('Invalid credentials')
  })

  it('returns data on success', async () => {
    const fakeData = { session: { access_token: 'tok' } }
    mockSignInWithPassword.mockResolvedValue({ data: fakeData, error: null })
    const result = await signIn('user@asbl.in', 'Pass@123')
    expect(result).toEqual(fakeData)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('signOut', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls supabase auth.signOut', async () => {
    mockSignOut.mockResolvedValue({ error: null })
    await supabaseSignOut()
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('throws when supabase returns an error', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('Network error') })
    await expect(supabaseSignOut()).rejects.toThrow('Network error')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getSession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the session object', async () => {
    const fakeSession = { user: { email: 'x@asbl.in' } }
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } })
    const result = await getSession()
    expect(result).toEqual(fakeSession)
  })

  it('returns null when no session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    expect(await getSession()).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('onAuthStateChange', () => {
  it('forwards the callback to supabase and returns subscription', () => {
    const sub = { data: { subscription: { unsubscribe: vi.fn() } } }
    mockOnAuthStateChange.mockReturnValue(sub)
    const cb = vi.fn()
    const result = onAuthStateChange(cb)
    expect(mockOnAuthStateChange).toHaveBeenCalledWith(cb)
    expect(result).toBe(sub)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fetchFAQs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns data from supabase when available', async () => {
    const fakeRows = [{ id: 1, question: 'Q', answer: 'A', category: 'Project Level' }]
    const builder = {
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: fakeRows, error: null }),
    }
    mockFrom.mockReturnValue(builder)
    const result = await fetchFAQs()
    expect(result).toEqual(fakeRows)
  })

  it('falls back to local FAQs on supabase error', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: null, error: new Error('no table') }),
    }
    mockFrom.mockReturnValue(builder)
    const result = await fetchFAQs()
    // Should be the mocked local fallback
    expect(result).toEqual([{ id: 0, question: 'local', answer: 'fallback', category: 'Project Level' }])
  })

  it('falls back to local FAQs when supabase returns empty array', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mockFrom.mockReturnValue(builder)
    const result = await fetchFAQs()
    expect(result).toEqual([{ id: 0, question: 'local', answer: 'fallback', category: 'Project Level' }])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('saveQuestion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a question with the correct fields', async () => {
    const inserted = { id: 10, name: 'Alice', question: 'Park?', priority: 'High', status: 'pending', ai_answer: null }
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
    }
    mockFrom.mockReturnValue(builder)
    const result = await saveQuestion({ name: 'Alice', question: 'Park?', priority: 'High' })
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Alice', question: 'Park?', priority: 'High', status: 'pending', ai_answer: null }),
    ])
    expect(result).toEqual(inserted)
  })

  it('throws on supabase error', async () => {
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error('insert failed') }),
    }
    mockFrom.mockReturnValue(builder)
    await expect(saveQuestion({ name: 'x', question: 'y', priority: 'Low' })).rejects.toThrow('insert failed')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('fetchQuestions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('orders by created_at descending', async () => {
    const rows = [{ id: 2 }, { id: 1 }]
    const builder = {
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: rows, error: null }),
    }
    mockFrom.mockReturnValue(builder)
    await fetchQuestions()
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('returns empty array when data is null', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockFrom.mockReturnValue(builder)
    expect(await fetchQuestions()).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('addFAQ', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts and returns the new FAQ', async () => {
    const faq = { id: 99, question: 'Q?', answer: 'A.', category: 'Unit Level' }
    const builder = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: faq, error: null }),
    }
    mockFrom.mockReturnValue(builder)
    const result = await addFAQ({ question: 'Q?', answer: 'A.', category: 'Unit Level' })
    expect(result).toEqual(faq)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('updateFAQ', () => {
  beforeEach(() => vi.clearAllMocks())

  it('snapshots old version before updating', async () => {
    const calls = []
    mockFrom.mockImplementation((table) => {
      calls.push(table)
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
      }
    })
    const oldFaq = { id: 1, question: 'Old Q', answer: 'Old A', category: 'Unit Level' }
    await updateFAQ(1, { question: 'New Q', answer: 'New A', category: 'Unit Level' }, oldFaq)
    expect(calls).toContain('faq_versions')
    expect(calls).toContain('faqs')
  })

  it('skips version snapshot when no currentFaq provided', async () => {
    const calls = []
    mockFrom.mockImplementation((table) => {
      calls.push(table)
      return {
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 1 }, error: null }),
      }
    })
    await updateFAQ(1, { question: 'New Q', answer: 'New A', category: 'Unit Level' })
    expect(calls).not.toContain('faq_versions')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('deleteFAQ', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls delete with the correct id', async () => {
    const builder = {
      delete: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    }
    mockFrom.mockReturnValue(builder)
    await deleteFAQ(5)
    expect(builder.eq).toHaveBeenCalledWith('id', 5)
  })

  it('throws on supabase error', async () => {
    const builder = {
      delete: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: new Error('rls') }),
    }
    mockFrom.mockReturnValue(builder)
    await expect(deleteFAQ(5)).rejects.toThrow('rls')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('answerQuestion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the question record with admin_answer and status=answered', async () => {
    const updated = { id: 3, admin_answer: 'Yes', status: 'answered' }
    const builder = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updated, error: null }),
      insert: vi.fn().mockReturnThis(),
    }
    mockFrom.mockReturnValue(builder)
    const result = await answerQuestion(3, { answer: 'Yes', addToFaq: false })
    expect(builder.update).toHaveBeenCalledWith({ admin_answer: 'Yes', status: 'answered' })
    expect(result).toEqual(updated)
  })

  it('also adds to FAQ when addToFaq is true', async () => {
    const calls = []
    mockFrom.mockImplementation((table) => {
      calls.push(table)
      return {
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 3 }, error: null }),
        insert: vi.fn().mockReturnThis(),
      }
    })
    await answerQuestion(3, {
      answer: 'Yes',
      addToFaq: true,
      faqQuestion: 'Does it have parking?',
      faqCategory: 'Unit Level',
    })
    expect(calls).toContain('faqs')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getFaqVersions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches versions for the given faqId ordered by created_at desc', async () => {
    const versions = [{ id: 2, faq_id: 10 }, { id: 1, faq_id: 10 }]
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: versions, error: null }),
    }
    mockFrom.mockReturnValue(builder)
    const result = await getFaqVersions(10)
    expect(builder.eq).toHaveBeenCalledWith('faq_id', 10)
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result).toEqual(versions)
  })

  it('returns empty array when data is null', async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockFrom.mockReturnValue(builder)
    expect(await getFaqVersions(10)).toEqual([])
  })
})
