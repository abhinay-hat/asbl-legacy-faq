#!/usr/bin/env node
/**
 * ASBL Legacy FAQ Portal — Supabase Migration
 * Usage: DB_PASS=<your-db-password> node migrate.js
 */
const { Client } = require('pg')
const readline = require('readline')

const PROJECT_REF = 'fnwlqyytjjyxaauartkn'
const DB_HOST = `aws-0-ap-south-1.pooler.supabase.com`
const DB_USER = `postgres.${PROJECT_REF}`
const DB_NAME = 'postgres'
const DB_PORT = 6543

async function getPassword() {
  if (process.env.DB_PASS) return process.env.DB_PASS
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question('Enter your Supabase database password: ', ans => {
      rl.close()
      resolve(ans.trim())
    })
  })
}

async function run() {
  const password = await getPassword()

  const client = new Client({
    host: DB_HOST, port: DB_PORT, database: DB_NAME,
    user: DB_USER, password, ssl: { rejectUnauthorized: false },
  })

  console.log('Connecting to Supabase...')
  await client.connect()
  console.log('Connected.\n')

  const SQL = `
-- 1. Create tables
CREATE TABLE IF NOT EXISTS public.faqs (
  id         BIGSERIAL PRIMARY KEY,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  category   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.questions (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  question   TEXT NOT NULL,
  priority   TEXT NOT NULL DEFAULT 'Medium',
  status     TEXT NOT NULL DEFAULT 'pending',
  ai_answer  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.faqs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- 3. Policies
DROP POLICY IF EXISTS "anon_read_faqs"        ON public.faqs;
DROP POLICY IF EXISTS "anon_insert_faqs"      ON public.faqs;
DROP POLICY IF EXISTS "anon_update_faqs"      ON public.faqs;
DROP POLICY IF EXISTS "anon_delete_faqs"      ON public.faqs;
DROP POLICY IF EXISTS "anon_read_questions"   ON public.questions;
DROP POLICY IF EXISTS "anon_insert_questions" ON public.questions;

CREATE POLICY "anon_read_faqs"        ON public.faqs FOR SELECT USING (true);
CREATE POLICY "anon_insert_faqs"      ON public.faqs FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update_faqs"      ON public.faqs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_faqs"      ON public.faqs FOR DELETE USING (true);
CREATE POLICY "anon_read_questions"   ON public.questions FOR SELECT USING (true);
CREATE POLICY "anon_insert_questions" ON public.questions FOR INSERT WITH CHECK (true);
`

  console.log('Creating tables and policies...')
  await client.query(SQL)
  console.log('Tables and policies created.\n')

  // Check if FAQs already seeded
  const { rows } = await client.query('SELECT COUNT(*) as n FROM public.faqs')
  const count = parseInt(rows[0].n, 10)

  if (count > 0) {
    console.log(`FAQs already seeded (${count} rows). Skipping seed.`)
  } else {
    console.log('Seeding 49 FAQs...')
    const faqs = require('./src/faqs.json')
    for (const faq of faqs) {
      await client.query(
        'INSERT INTO public.faqs (question, answer, category) VALUES ($1, $2, $3)',
        [faq.question, faq.answer, faq.category]
      )
    }
    console.log(`Seeded ${faqs.length} FAQs.`)
  }

  const res = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM public.faqs) AS faq_count,
      (SELECT COUNT(*) FROM public.questions) AS question_count
  `)
  console.log('\n=== Done ===')
  console.log(`FAQs:      ${res.rows[0].faq_count}`)
  console.log(`Questions: ${res.rows[0].question_count}`)

  await client.end()
}

run().catch(err => {
  console.error('\nError:', err.message)
  process.exit(1)
})
