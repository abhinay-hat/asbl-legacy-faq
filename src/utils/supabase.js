import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

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
