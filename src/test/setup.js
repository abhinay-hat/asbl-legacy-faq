import '@testing-library/jest-dom'
import { vi, beforeEach, afterEach } from 'vitest'

// Suppress noisy console output during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  // Reset hash between tests
  window.location.hash = ''
})
