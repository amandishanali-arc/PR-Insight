const TOKEN_KEY = 'pr-insight.access-token'

// MVP tradeoff: localStorage survives refreshes but is accessible to page scripts.
// Keep dependencies trusted and move to an HttpOnly cookie for production deployment.
export const authStorage = {
  getToken: () => window.localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
}
