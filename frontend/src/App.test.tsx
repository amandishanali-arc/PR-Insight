import { render, waitFor } from '@testing-library/react'
import { AuthProvider } from './auth/AuthContext'
import App from './App'

it('redirects an unauthenticated protected route to login', async () => {
  localStorage.clear()
  window.location.hash = '#history'
  render(<AuthProvider><App /></AuthProvider>)
  await waitFor(() => expect(window.location.hash).toBe('#login'))
})
