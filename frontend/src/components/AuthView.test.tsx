import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider } from '../auth/AuthContext'
import { AuthView } from './AuthView'

describe('AuthView validation', () => {
  it('validates the login form before sending a request', async () => {
    render(<AuthProvider><AuthView mode="login" onSwitch={() => undefined} onSuccess={() => undefined} /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please complete all required fields.')
  })

  it('rejects mismatched registration passwords', async () => {
    const user = userEvent.setup()
    render(<AuthProvider><AuthView mode="register" onSwitch={() => undefined} onSuccess={() => undefined} /></AuthProvider>)
    await user.type(screen.getByLabelText('Name'), 'User')
    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    const passwordInputs = screen.getAllByLabelText(/password/i)
    await user.type(passwordInputs[0], 'password1')
    await user.type(passwordInputs[1], 'password2')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
  })
})
