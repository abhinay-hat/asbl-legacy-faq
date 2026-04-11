/**
 * Integration / component tests for App.jsx.
 *
 * All Supabase calls AND global fetch (OpenRouter / Groq) are mocked so tests
 * are fully deterministic.
 *
 * Coverage areas:
 *   1. Auth flow  — loading, login page, session restore, sign-out
 *   2. Login form — validation, error display, success
 *   3. Navigation — viewer / admin / super_admin tabs, hash routing
 *   4. Search tab — empty state, category browse, clear
 *   5. FAQ Manager (admin) — list, search, filter, add, edit, delete, history
 *   6. Raised Questions (admin) — list, filter, answer, add-to-FAQ
 *   7. User Manager (super_admin) — list, add, delete, reset password
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock('../assets/logo.png', () => ({ default: 'logo.png' }))

const mockSignIn             = vi.fn()
const mockSignOut            = vi.fn()
const mockGetSession         = vi.fn()
const mockOnAuthStateChange  = vi.fn()
const mockFetchFAQs          = vi.fn()
const mockSaveQuestion       = vi.fn()
const mockFetchQuestions     = vi.fn()
const mockAddFAQ             = vi.fn()
const mockUpdateFAQ          = vi.fn()
const mockDeleteFAQ          = vi.fn()
const mockAnswerQuestion     = vi.fn()
const mockGetFaqVersions     = vi.fn()
const mockListUsers          = vi.fn()
const mockCreateUser         = vi.fn()
const mockUpdateUserPassword = vi.fn()
const mockDeleteUser         = vi.fn()

vi.mock('../utils/supabase', () => ({
  signIn:             (...a) => mockSignIn(...a),
  signOut:            (...a) => mockSignOut(...a),
  getSession:         (...a) => mockGetSession(...a),
  onAuthStateChange:  (...a) => mockOnAuthStateChange(...a),
  fetchFAQs:          (...a) => mockFetchFAQs(...a),
  saveQuestion:       (...a) => mockSaveQuestion(...a),
  fetchQuestions:     (...a) => mockFetchQuestions(...a),
  addFAQ:             (...a) => mockAddFAQ(...a),
  updateFAQ:          (...a) => mockUpdateFAQ(...a),
  deleteFAQ:          (...a) => mockDeleteFAQ(...a),
  answerQuestion:     (...a) => mockAnswerQuestion(...a),
  getFaqVersions:     (...a) => mockGetFaqVersions(...a),
  listUsers:          (...a) => mockListUsers(...a),
  createUser:         (...a) => mockCreateUser(...a),
  updateUserPassword: (...a) => mockUpdateUserPassword(...a),
  deleteUser:         (...a) => mockDeleteUser(...a),
}))

// Import App AFTER mocks are set up
import App from '../App'

// ── Fixtures ──────────────────────────────────────────────────────────────────
const SAMPLE_FAQS = [
  { id: 1, question: 'How many floors does each tower have?', answer: 'G+50 floors per tower', category: 'Project Level' },
  { id: 2, question: 'What is the parking allocation?',       answer: 'Two-level basement parking', category: 'Unit Level' },
  { id: 3, question: 'Does the clubhouse have a pool?',       answer: 'Yes, a rooftop infinity pool', category: 'Clubhouse' },
]

const SAMPLE_QUESTIONS = [
  { id: 1, name: 'Alice', question: 'What is possession date?', status: 'pending',  priority: 'high',   created_at: '2026-01-01T10:00:00Z', admin_answer: null, ai_answer: null },
  { id: 2, name: 'Bob',   question: 'Is OC received?',          status: 'answered', priority: 'medium', created_at: '2026-01-02T10:00:00Z', admin_answer: 'OC expected Q4 2026', ai_answer: null },
]

const SAMPLE_USERS = [
  { id: 'u1', email: 'abhinay.p@asbl.in', role: 'super_admin', initial_password: 'Abhi@1015' },
  { id: 'u2', email: 'joshi.s@asbl.in',   role: 'admin',       initial_password: 'Joshi@4521' },
  { id: 'u3', email: 'viewer@asbl.in',    role: 'viewer',      initial_password: 'View@123' },
]

// ── Session helpers ───────────────────────────────────────────────────────────
function noSession() {
  mockGetSession.mockResolvedValue(null)
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  mockFetchFAQs.mockResolvedValue(SAMPLE_FAQS)
}

function viewerSession() {
  const session = { user: { email: 'viewer@asbl.in', user_metadata: { username: 'viewer', role: 'viewer' } } }
  mockGetSession.mockResolvedValue(session)
  mockOnAuthStateChange.mockImplementation((cb) => {
    cb('SIGNED_IN', session)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mockFetchFAQs.mockResolvedValue(SAMPLE_FAQS)
}

function adminSession() {
  const session = { user: { email: 'joshi.s@asbl.in', user_metadata: { username: 'joshi.s', role: 'admin' } } }
  mockGetSession.mockResolvedValue(session)
  mockOnAuthStateChange.mockImplementation((cb) => {
    cb('SIGNED_IN', session)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mockFetchFAQs.mockResolvedValue(SAMPLE_FAQS)
}

function superAdminSession() {
  const session = { user: { email: 'abhinay.p@asbl.in', user_metadata: { username: 'abhinay.p', role: 'super_admin' } } }
  mockGetSession.mockResolvedValue(session)
  mockOnAuthStateChange.mockImplementation((cb) => {
    cb('SIGNED_IN', session)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  mockFetchFAQs.mockResolvedValue(SAMPLE_FAQS)
}

// ── Global test setup ─────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = ''
  window.confirm = vi.fn(() => true)
  // Prevent real HTTP calls to OpenRouter / Groq / Cerebras — AI should return null in tests
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
})

// afterEach cleanup handled by setup.js

// ── Admin-panel helpers ───────────────────────────────────────────────────────
async function openFaqManager() {
  adminSession()
  render(<App />)
  // Wait for the app to render with admin nav button
  const adminNavBtn = await screen.findByRole('button', { name: 'Admin' })
  fireEvent.click(adminNavBtn)
  // Wait for the FAQ Manager heading (h2), not the tab button
  await screen.findByRole('heading', { name: 'FAQ Manager' })
}

async function openRaisedQuestions() {
  adminSession()
  mockFetchQuestions.mockResolvedValue(SAMPLE_QUESTIONS)
  render(<App />)
  const adminNavBtn = await screen.findByRole('button', { name: 'Admin' })
  fireEvent.click(adminNavBtn)
  await screen.findByRole('heading', { name: 'FAQ Manager' })
  fireEvent.click(screen.getByRole('button', { name: /raised questions/i }))
  await screen.findByText('What is possession date?')
}

async function openUserManager() {
  superAdminSession()
  mockListUsers.mockResolvedValue(SAMPLE_USERS)
  render(<App />)
  const adminNavBtn = await screen.findByRole('button', { name: 'Admin' })
  fireEvent.click(adminNavBtn)
  await screen.findByRole('heading', { name: 'FAQ Manager' })
  fireEvent.click(screen.getByRole('button', { name: /^users$/i }))
  await screen.findByText('User Management')
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Auth flow
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth flow', () => {
  it('renders nothing while auth state is loading', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})) // never resolves
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    mockFetchFAQs.mockResolvedValue([])
    const { container } = render(<App />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the login page when there is no session', async () => {
    noSession()
    render(<App />)
    await screen.findByText('Sign In')
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('shows the FAQ portal after a valid session is loaded', async () => {
    viewerSession()
    render(<App />)
    await screen.findByText('ASBL Legacy')
    expect(screen.getByPlaceholderText(/type your question/i)).toBeInTheDocument()
  })

  it('shows super admin badge for super_admin users', async () => {
    superAdminSession()
    render(<App />)
    await screen.findByText('Super Admin')
  })

  it('shows admin badge for admin users', async () => {
    adminSession()
    render(<App />)
    // The badge is a span.header-role-badge — use selector to disambiguate from the nav button
    await screen.findByText('Admin', { selector: 'span.header-role-badge' })
  })

  it('clicking Sign out calls signOut', async () => {
    viewerSession()
    mockSignOut.mockResolvedValue(undefined)
    render(<App />)
    await screen.findByTitle(/sign out/i)
    fireEvent.click(screen.getByTitle(/sign out/i))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Login form
// ─────────────────────────────────────────────────────────────────────────────
describe('Login form', () => {
  beforeEach(() => noSession())

  it('renders username and password fields', async () => {
    render(<App />)
    await screen.findByLabelText('Username')
    // Use exact label text to avoid matching aria-label="Toggle password"
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('submit button is enabled when fields have values', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Username')
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'Pass@123')
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
  })

  it('calls signIn with entered credentials', async () => {
    const user = userEvent.setup()
    mockSignIn.mockResolvedValue(undefined)
    render(<App />)
    await screen.findByLabelText('Username')
    await user.type(screen.getByLabelText('Username'), 'admin@asbl.in')
    await user.type(screen.getByLabelText('Password'), 'Pass@123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(mockSignIn).toHaveBeenCalledWith('admin@asbl.in', 'Pass@123')
  })

  it('shows error message on failed login', async () => {
    const user = userEvent.setup()
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'))
    render(<App />)
    await screen.findByLabelText('Username')
    await user.type(screen.getByLabelText('Username'), 'bad@asbl.in')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await screen.findByText(/invalid username or password/i)
  })

  it('password is masked by default and toggle reveals it', async () => {
    const user = userEvent.setup()
    render(<App />)
    const pwInput = await screen.findByLabelText('Password')
    expect(pwInput).toHaveAttribute('type', 'password')
    await user.click(screen.getByLabelText('Toggle password'))
    expect(pwInput).toHaveAttribute('type', 'text')
    await user.click(screen.getByLabelText('Toggle password'))
    expect(pwInput).toHaveAttribute('type', 'password')
  })

  it('sign in button is disabled while submitting', async () => {
    // Never resolves — keeps button in loading state
    mockSignIn.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByLabelText('Username')
    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Password'), 'Pass@123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Navigation & access control
// ─────────────────────────────────────────────────────────────────────────────
describe('Navigation and access control', () => {
  it('viewer sees only "Search FAQ" tab — no Admin tab', async () => {
    viewerSession()
    render(<App />)
    await screen.findByText('ASBL Legacy')
    expect(screen.getByRole('button', { name: /search faq/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull()
  })

  it('admin sees both Search FAQ and Admin tabs', async () => {
    adminSession()
    render(<App />)
    await screen.findByText('ASBL Legacy')
    expect(screen.getByRole('button', { name: /search faq/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
  })

  it('super_admin sees both tabs', async () => {
    superAdminSession()
    render(<App />)
    await screen.findByText('ASBL Legacy')
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
  })

  it('clicking Admin tab shows the FAQ Manager heading', async () => {
    adminSession()
    render(<App />)
    const adminBtn = await screen.findByRole('button', { name: 'Admin' })
    fireEvent.click(adminBtn)
    await screen.findByRole('heading', { name: 'FAQ Manager' })
  })

  it('admin panel shows FAQ Manager and Raised Questions sub-tabs', async () => {
    adminSession()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    await screen.findByRole('heading', { name: 'FAQ Manager' })
    expect(screen.getByRole('button', { name: /raised questions/i })).toBeInTheDocument()
  })

  it('super_admin admin panel has a Users sub-tab', async () => {
    superAdminSession()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    await screen.findByRole('heading', { name: 'FAQ Manager' })
    expect(screen.getByRole('button', { name: /^users$/i })).toBeInTheDocument()
  })

  it('regular admin does NOT see Users sub-tab', async () => {
    adminSession()
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Admin' }))
    await screen.findByRole('heading', { name: 'FAQ Manager' })
    expect(screen.queryByRole('button', { name: /^users$/i })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Search tab
// ─────────────────────────────────────────────────────────────────────────────
describe('Search tab', () => {
  beforeEach(() => viewerSession())

  it('shows "Browse by Category" in the empty state', async () => {
    render(<App />)
    await screen.findByText('Browse by Category')
    // Category name appears in both filter pills and cat-cards — check cat-name specifically
    expect(screen.getByText('Project Level', { selector: '.cat-name' })).toBeInTheDocument()
    expect(screen.getByText('Clubhouse', { selector: '.cat-name' })).toBeInTheDocument()
  })

  it('shows total FAQ count in the stats bar', async () => {
    render(<App />)
    await screen.findByText(`${SAMPLE_FAQS.length}`)
  })

  it('clicking a category card shows matching FAQs', async () => {
    render(<App />)
    await screen.findByText('Browse by Category')
    // Click the Clubhouse cat-card name (not the filter pill which has the same text)
    fireEvent.click(screen.getByText('Clubhouse', { selector: '.cat-name' }))
    await screen.findByText('Does the clubhouse have a pool?')
  })

  it('search input is present', async () => {
    render(<App />)
    expect(await screen.findByPlaceholderText(/type your question/i)).toBeInTheDocument()
  })

  it('category filter pills are rendered', async () => {
    render(<App />)
    await screen.findByText('All')
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
  })

  it('clear button appears when query has text and resets on click', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = await screen.findByPlaceholderText(/type your question/i)
    await user.type(input, 'floors')
    await waitFor(() => expect(screen.getByLabelText(/clear/i)).toBeVisible())
    await user.click(screen.getByLabelText(/clear/i))
    await screen.findByText('Browse by Category')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Raise form / no results
// ─────────────────────────────────────────────────────────────────────────────
describe('RaiseForm / NoResults', () => {
  beforeEach(() => {
    viewerSession()
    mockSaveQuestion.mockResolvedValue({ id: 99 })
  })

  it('shows the raise form when search returns no FAQ matches', async () => {
    render(<App />)
    const input = await screen.findByPlaceholderText(/type your question/i)
    // fireEvent.change triggers handleInput → debounce → runSearch
    fireEvent.change(input, { target: { value: 'gymnasium sauna steam bath' } })
    await new Promise(r => setTimeout(r, 400)) // wait past 300ms debounce
    // AI returns null (fetch is stubbed to fail) → NoResults shows
    await screen.findByText(/not found in faq/i, {}, { timeout: 2000 })
    expect(screen.getByRole('button', { name: /raise to backend team/i })).toBeInTheDocument()
  })

  it('submitting the raise form saves the question and shows success', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = await screen.findByPlaceholderText(/type your question/i)
    fireEvent.change(input, { target: { value: 'gymnasium sauna steam bath' } })
    await new Promise(r => setTimeout(r, 400))
    await screen.findByText(/not found in faq/i, {}, { timeout: 2000 })

    await user.type(screen.getByLabelText(/your name/i), 'Test User')
    await user.click(screen.getByRole('button', { name: /raise to backend team/i }))

    expect(mockSaveQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test User', question: 'gymnasium sauna steam bath' })
    )
    await screen.findByText(/question raised/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. FAQ Manager (admin)
// ─────────────────────────────────────────────────────────────────────────────
describe('FAQ Manager', () => {
  it('displays all FAQs from the list', async () => {
    await openFaqManager()
    expect(screen.getByText('How many floors does each tower have?')).toBeInTheDocument()
    expect(screen.getByText('What is the parking allocation?')).toBeInTheDocument()
    expect(screen.getByText('Does the clubhouse have a pool?')).toBeInTheDocument()
  })

  it('shows FAQ count in the header', async () => {
    await openFaqManager()
    expect(screen.getByText(new RegExp(`${SAMPLE_FAQS.length} FAQs`, 'i'))).toBeInTheDocument()
  })

  it('clicking Edit shows the edit form with current values', async () => {
    await openFaqManager()
    const editBtns = screen.getAllByRole('button', { name: /^edit$/i })
    fireEvent.click(editBtns[0])
    expect(screen.getByDisplayValue('How many floors does each tower have?')).toBeInTheDocument()
  })

  it('Cancel in edit mode dismisses the form', async () => {
    await openFaqManager()
    const editBtns = screen.getAllByRole('button', { name: /^edit$/i })
    fireEvent.click(editBtns[0])
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByDisplayValue('How many floors does each tower have?')).toBeNull()
  })

  it('Save Changes calls updateFAQ and reflects updated text', async () => {
    const user = userEvent.setup()
    const updated = { id: 1, question: 'Updated question?', answer: 'Updated answer.', category: 'Project Level' }
    mockUpdateFAQ.mockResolvedValue(updated)

    await openFaqManager()
    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0])

    const qInput = screen.getByDisplayValue('How many floors does each tower have?')
    await user.clear(qInput)
    await user.type(qInput, 'Updated question?')

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mockUpdateFAQ).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ question: 'Updated question?' }),
      expect.objectContaining({ id: 1 })
    ))
    await screen.findByText('Updated question?')
  })

  it('Delete calls deleteFAQ and removes the FAQ from list', async () => {
    mockDeleteFAQ.mockResolvedValue(undefined)
    await openFaqManager()
    const deleteBtns = screen.getAllByRole('button', { name: /^delete$/i })
    fireEvent.click(deleteBtns[0])
    await waitFor(() => expect(mockDeleteFAQ).toHaveBeenCalledWith(1))
    await waitFor(() => expect(screen.queryByText('How many floors does each tower have?')).toBeNull())
  })

  it('Delete is aborted when user cancels the confirm dialog', async () => {
    window.confirm = vi.fn(() => false)
    await openFaqManager()
    expect(screen.getByText('How many floors does each tower have?')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^delete$/i })[0])
    expect(mockDeleteFAQ).not.toHaveBeenCalled()
    expect(screen.getByText('How many floors does each tower have?')).toBeInTheDocument()
  })

  it('Add FAQ panel opens when Add FAQ button is clicked', async () => {
    await openFaqManager()
    fireEvent.click(screen.getByRole('button', { name: /add faq/i }))
    expect(screen.getByPlaceholderText(/enter the question/i)).toBeInTheDocument()
  })

  it('Save FAQ button is disabled when fields are empty', async () => {
    await openFaqManager()
    fireEvent.click(screen.getByRole('button', { name: /add faq/i }))
    expect(screen.getByRole('button', { name: /^save faq$/i })).toBeDisabled()
  })

  it('Save FAQ calls addFAQ and adds the FAQ to the list', async () => {
    const user = userEvent.setup()
    const newFaq = { id: 100, question: 'New Q?', answer: 'New A.', category: 'Clubhouse' }
    mockAddFAQ.mockResolvedValue(newFaq)

    await openFaqManager()
    fireEvent.click(screen.getByRole('button', { name: /add faq/i }))
    await user.type(screen.getByPlaceholderText(/enter the question/i), 'New Q?')
    await user.type(screen.getByPlaceholderText(/enter the answer/i), 'New A.')
    fireEvent.click(screen.getByRole('button', { name: /^save faq$/i }))

    await waitFor(() => expect(mockAddFAQ).toHaveBeenCalledWith(
      expect.objectContaining({ question: 'New Q?', answer: 'New A.' })
    ))
    await screen.findByText('New Q?')
  })

  it('search box filters FAQs by keyword', async () => {
    await openFaqManager()
    expect(screen.getByText('How many floors does each tower have?')).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(/search.*faqs/i)
    fireEvent.change(searchInput, { target: { value: 'parking' } })
    await screen.findByText('What is the parking allocation?')
    expect(screen.queryByText('How many floors does each tower have?')).toBeNull()
  })

  it('clearing the search box shows all FAQs again', async () => {
    await openFaqManager()
    const searchInput = screen.getByPlaceholderText(/search.*faqs/i)
    fireEvent.change(searchInput, { target: { value: 'parking' } })
    await screen.findByText('What is the parking allocation?')

    fireEvent.click(screen.getByLabelText('Clear'))
    await screen.findByText('How many floors does each tower have?')
  })

  it('category filter pill restricts the displayed FAQs', async () => {
    await openFaqManager()
    expect(screen.getByText('What is the parking allocation?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /unit level/i }))
    await screen.findByText('What is the parking allocation?')
    expect(screen.queryByText('How many floors does each tower have?')).toBeNull()
  })

  it('History button opens the version history panel', async () => {
    mockGetFaqVersions.mockResolvedValue([])
    await openFaqManager()
    fireEvent.click(screen.getAllByRole('button', { name: /^history$/i })[0])
    await screen.findByText(/version history/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Raised Questions (admin)
// ─────────────────────────────────────────────────────────────────────────────
describe('Raised Questions', () => {
  it('lists all raised questions', async () => {
    await openRaisedQuestions()
    expect(screen.getByText('What is possession date?')).toBeInTheDocument()
    expect(screen.getByText('Is OC received?')).toBeInTheDocument()
  })

  it('shows pending badge count in the heading', async () => {
    await openRaisedQuestions()
    expect(screen.getByText(/1 pending/i)).toBeInTheDocument()
  })

  it('"Pending" filter shows only pending questions', async () => {
    await openRaisedQuestions()
    fireEvent.click(screen.getByRole('button', { name: /^pending/i }))
    await screen.findByText('What is possession date?')
    expect(screen.queryByText('Is OC received?')).toBeNull()
  })

  it('"Answered" filter shows only answered questions', async () => {
    await openRaisedQuestions()
    fireEvent.click(screen.getByRole('button', { name: /^answered/i }))
    await screen.findByText('Is OC received?')
    expect(screen.queryByText('What is possession date?')).toBeNull()
  })

  it('clicking "Add Answer" opens the inline answer form', async () => {
    await openRaisedQuestions()
    fireEvent.click(screen.getAllByRole('button', { name: /add answer/i })[0])
    expect(screen.getByPlaceholderText(/type the answer/i)).toBeInTheDocument()
  })

  it('submitting an answer calls answerQuestion', async () => {
    const user = userEvent.setup()
    mockAnswerQuestion.mockResolvedValue({ id: 1, admin_answer: 'Q4 2027', status: 'answered' })
    mockAddFAQ.mockResolvedValue({ id: 50 })

    await openRaisedQuestions()
    fireEvent.click(screen.getAllByRole('button', { name: /add answer/i })[0])
    await user.type(screen.getByPlaceholderText(/type the answer/i), 'Q4 2027')
    fireEvent.click(screen.getByRole('button', { name: /save.*answer|save.*faq/i }))

    await waitFor(() => expect(mockAnswerQuestion).toHaveBeenCalledWith(
      1, expect.objectContaining({ answer: 'Q4 2027' })
    ))
  })

  it('Cancel button hides the answer form', async () => {
    await openRaisedQuestions()
    fireEvent.click(screen.getAllByRole('button', { name: /add answer/i })[0])
    expect(screen.getByPlaceholderText(/type the answer/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByPlaceholderText(/type the answer/i)).toBeNull()
  })

  it('Refresh button reloads the question list', async () => {
    await openRaisedQuestions()
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(mockFetchQuestions).toHaveBeenCalledTimes(2))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. User Manager (super_admin only)
// ─────────────────────────────────────────────────────────────────────────────
describe('User Manager', () => {
  it('lists all users sorted by role', async () => {
    await openUserManager()
    expect(screen.getByText('joshi.s@asbl.in')).toBeInTheDocument()
    expect(screen.getByText('viewer@asbl.in')).toBeInTheDocument()
  })

  it('shows role badges for all users', async () => {
    await openUserManager()
    // "Super Admin" and "Admin" also appear in the header — scope to the user list
    const userList = screen.getByText('joshi.s@asbl.in').closest('.user-list')
    expect(within(userList).getByText('Super Admin')).toBeInTheDocument()
    expect(within(userList).getByText('Admin')).toBeInTheDocument()
    expect(within(userList).getByText('Viewer')).toBeInTheDocument()
  })

  it('super_admin card has no Delete button', async () => {
    await openUserManager()
    const superAdminCard = screen.getByText('abhinay.p@asbl.in').closest('.user-card')
    expect(within(superAdminCard).queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('non-super_admin cards have a Delete button', async () => {
    await openUserManager()
    const adminCard = screen.getByText('joshi.s@asbl.in').closest('.user-card')
    expect(within(adminCard).getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('Delete calls deleteUser and removes user from list', async () => {
    mockDeleteUser.mockResolvedValue(undefined)
    await openUserManager()
    const adminCard = screen.getByText('joshi.s@asbl.in').closest('.user-card')
    fireEvent.click(within(adminCard).getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith('u2'))
    await waitFor(() => expect(screen.queryByText('joshi.s@asbl.in')).toBeNull())
  })

  it('Delete is skipped when user cancels the confirm dialog', async () => {
    window.confirm = vi.fn(() => false)
    await openUserManager()
    const adminCard = screen.getByText('joshi.s@asbl.in').closest('.user-card')
    fireEvent.click(within(adminCard).getByRole('button', { name: /delete/i }))
    expect(mockDeleteUser).not.toHaveBeenCalled()
    expect(screen.getByText('joshi.s@asbl.in')).toBeInTheDocument()
  })

  it('Add User panel opens when button is clicked', async () => {
    await openUserManager()
    fireEvent.click(screen.getByRole('button', { name: /add user/i }))
    expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument()
  })

  it('Create user calls createUser and adds to list', async () => {
    const user = userEvent.setup()
    const newUser = { id: 'u99', email: 'new@asbl.in', role: 'viewer', initial_password: 'Test@123' }
    mockCreateUser.mockResolvedValue(newUser)

    await openUserManager()
    fireEvent.click(screen.getByRole('button', { name: /add user/i }))
    await user.type(screen.getByPlaceholderText(/email address/i), 'new@asbl.in')
    await user.type(screen.getByPlaceholderText(/^password$/i), 'Test@123')
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@asbl.in', password: 'Test@123' })
    ))
    await screen.findByText('new@asbl.in')
  })

  it('password is masked by default; Show/Hide toggles it', async () => {
    await openUserManager()
    const adminCard = screen.getByText('joshi.s@asbl.in').closest('.user-card')
    expect(within(adminCard).getByText('••••••••')).toBeInTheDocument()
    fireEvent.click(within(adminCard).getByRole('button', { name: /^show$/i }))
    expect(within(adminCard).getByText('Joshi@4521')).toBeInTheDocument()
    fireEvent.click(within(adminCard).getByRole('button', { name: /^hide$/i }))
    expect(within(adminCard).getByText('••••••••')).toBeInTheDocument()
  })

  it('Reset password button is disabled when input is empty', async () => {
    await openUserManager()
    const adminCard = screen.getByText('joshi.s@asbl.in').closest('.user-card')
    expect(within(adminCard).getByRole('button', { name: /reset password/i })).toBeDisabled()
  })

  it('Reset password calls updateUserPassword', async () => {
    const user = userEvent.setup()
    mockUpdateUserPassword.mockResolvedValue({})

    await openUserManager()
    const adminCard = screen.getByText('joshi.s@asbl.in').closest('.user-card')
    await user.type(within(adminCard).getByPlaceholderText(/new password/i), 'NewPass@999')
    fireEvent.click(within(adminCard).getByRole('button', { name: /reset password/i }))
    await waitFor(() => expect(mockUpdateUserPassword).toHaveBeenCalledWith('u2', 'NewPass@999'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. FAQ version history
// ─────────────────────────────────────────────────────────────────────────────
describe('FAQ Version History', () => {
  it('shows "No previous versions" message when history is empty', async () => {
    mockGetFaqVersions.mockResolvedValue([])
    await openFaqManager()
    fireEvent.click(screen.getAllByRole('button', { name: /^history$/i })[0])
    await screen.findByText(/no previous versions/i)
  })

  it('renders saved version with question and answer text', async () => {
    mockGetFaqVersions.mockResolvedValue([
      { id: 10, faq_id: 1, question: 'Old question?', answer: 'Old answer.', category: 'Project Level', created_at: '2026-01-01T10:00:00Z' },
    ])
    await openFaqManager()
    fireEvent.click(screen.getAllByRole('button', { name: /^history$/i })[0])
    await screen.findByText('Old question?')
    expect(screen.getByText('Old answer.')).toBeInTheDocument()
  })

  it('Close button hides the version history panel', async () => {
    mockGetFaqVersions.mockResolvedValue([])
    await openFaqManager()
    fireEvent.click(screen.getAllByRole('button', { name: /^history$/i })[0])
    await screen.findByText(/version history/i)
    // The close button is inside the panel
    const panel = screen.getByText(/no previous versions/i).closest('.version-panel')
    fireEvent.click(within(panel).getByRole('button'))
    await waitFor(() => expect(screen.queryByText(/no previous versions/i)).toBeNull())
  })
})
