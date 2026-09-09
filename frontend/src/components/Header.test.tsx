import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Header } from './Header'

describe('Header', () => {
  it('opens the user menu and logs out from the dropdown', async () => {
    const logout = vi.fn()
    render(<Header activeView="analyze" onNavigate={() => undefined} user={{ id: 'user-1', name: 'Amandi Shanali', email: 'amandi@example.com' }} onLogout={logout} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Amandi Shanali/i }))
    expect(screen.getByRole('menu')).toHaveTextContent('amandi@example.com')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Logout' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('preserves Review History and About navigation', async () => {
    const navigate = vi.fn()
    render(<Header activeView="analyze" onNavigate={navigate} user={{ id: 'user-1', name: 'User', email: 'user@example.com' }} onLogout={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: /Review History/i }))
    await userEvent.click(screen.getByRole('button', { name: /About/i }))
    expect(navigate).toHaveBeenNthCalledWith(1, 'history')
    expect(navigate).toHaveBeenNthCalledWith(2, 'about')
  })
})
