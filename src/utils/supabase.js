import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Auth ───────────────────────────────────────────────────────────────────
export async function signIn(username, password) {
  const email = username.includes('@') ? username : `${username}@asbl.internal`
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback)
}

// ── User Management (super_admin only — calls Edge Function) ───────────────
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`

// Edge Functions with verify_jwt:true require the legacy anon key (JWT format),
// not the modern publishable key (sb_publishable_...) in the apikey header.
const EDGE_APIKEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

async function edgeHeaders() {
  // refreshSession() returns a fresh token if the current one is expired
  const { data, error } = await supabase.auth.refreshSession()
  if (error || !data.session) {
    const { data: cached } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cached.session?.access_token}`,
      'apikey': EDGE_APIKEY,
    }
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.session.access_token}`,
    'apikey': EDGE_APIKEY,
  }
}

export async function listUsers() {
  const res = await fetch(`${EDGE_URL}?action=list`, { headers: await edgeHeaders() })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to list users')
  return json.users
}

export async function createUser({ email, password, role, username }) {
  const res = await fetch(`${EDGE_URL}?action=create`, {
    method: 'POST', headers: await edgeHeaders(),
    body: JSON.stringify({ email, password, role, username }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to create user')
  return json.user
}

export async function updateUserPassword(userId, password) {
  const res = await fetch(`${EDGE_URL}?action=update-password`, {
    method: 'POST', headers: await edgeHeaders(),
    body: JSON.stringify({ userId, password }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to update password')
  return json
}

export async function deleteUser(userId) {
  const res = await fetch(`${EDGE_URL}?action=delete`, {
    method: 'DELETE', headers: await edgeHeaders(),
    body: JSON.stringify({ userId }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to delete user')
  return json
}

// ── FAQs ───────────────────────────────────────────────────────────────────
import localFaqs from '../faqs.json'

export async function fetchFAQs() {
  const { data, error } = await supabase
    .from('faqs')
    .select('*')
    .order('id', { ascending: true })

  if (error) {
    console.warn('[Supabase] faqs table not ready, using local fallback:', error.message)
    return localFaqs
  }
  return data?.length ? data : localFaqs
}

// ── Questions ──────────────────────────────────────────────────────────────
export async function saveQuestion({ name, question, priority, ai_answer = null }) {
  const { data, error } = await supabase
    .from('questions')
    .insert([{ name, question, priority, status: 'pending', ai_answer }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Answer a raised question + optionally promote it to the FAQ knowledge base
export async function answerQuestion(id, { answer, addToFaq, faqQuestion, faqCategory }) {
  // 1. Update the question record
  const { data, error } = await supabase
    .from('questions')
    .update({ admin_answer: answer, status: 'answered' })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  // 2. Optionally add to FAQ knowledge base
  if (addToFaq && faqQuestion?.trim() && answer?.trim()) {
    await addFAQ({ question: faqQuestion.trim(), answer: answer.trim(), category: faqCategory })
  }

  return data
}

// ── FAQ CRUD (admin) ───────────────────────────────────────────────────────
export async function addFAQ({ question, answer, category }) {
  const { data, error } = await supabase
    .from('faqs')
    .insert([{ question, answer, category }])
    .select()
    .single()
  if (error) throw error
  return data
}

// updateFAQ — saves current version to faq_versions before overwriting
export async function updateFAQ(id, { question, answer, category }, currentFaq = null) {
  // Save version snapshot first
  if (currentFaq) {
    await supabase.from('faq_versions').insert([{
      faq_id: id,
      question: currentFaq.question,
      answer: currentFaq.answer,
      category: currentFaq.category,
    }])
    // ignore version save errors — don't block the update
  }

  const { data, error } = await supabase
    .from('faqs')
    .update({ question, answer, category })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteFAQ(id) {
  const { error } = await supabase
    .from('faqs')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── FAQ Version History (admin only) ──────────────────────────────────────
export async function getFaqVersions(faqId) {
  const { data, error } = await supabase
    .from('faq_versions')
    .select('*')
    .eq('faq_id', faqId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
