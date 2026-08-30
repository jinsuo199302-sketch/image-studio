import { defineStore } from 'pinia'
import type { AuthUser } from '../services/authApi'
import * as authApi from '../services/authApi'

const TOKEN_KEY = 'image-studio.authToken'

function loadToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: loadToken(),
    user: null as AuthUser | null,
    error: '' as string,
    loading: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
  },
  actions: {
    setSession(token: string, user: AuthUser) {
      this.token = token
      this.user = user
      localStorage.setItem(TOKEN_KEY, token)
    },
    async register(email: string, password: string) {
      this.error = ''
      this.loading = true
      try {
        const result = await authApi.register(email, password)
        this.setSession(result.token, result.user)
        return true
      } catch (e) {
        this.error = e instanceof Error ? e.message : '注册失败，请重试'
        return false
      } finally {
        this.loading = false
      }
    },
    async login(email: string, password: string) {
      this.error = ''
      this.loading = true
      try {
        const result = await authApi.login(email, password)
        this.setSession(result.token, result.user)
        return true
      } catch (e) {
        this.error = e instanceof Error ? e.message : '登录失败，请重试'
        return false
      } finally {
        this.loading = false
      }
    },
    async restoreSession() {
      if (this.initialized) return
      this.initialized = true
      if (!this.token) return
      try {
        this.user = await authApi.fetchMe(this.token)
      } catch {
        this.logout()
      }
    },
    async refreshMe() {
      if (!this.token) return
      try {
        this.user = await authApi.fetchMe(this.token)
      } catch {
        /* 保持现状 */
      }
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
