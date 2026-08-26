import { defineStore } from 'pinia'
import type { WritingSession } from '../types'
import { generateCopy } from '../services/writingApi'
import { useAuthStore } from './auth'

const STORAGE_KEY = 'image-studio.writingSessions'
const MAX_SESSIONS = 50

function loadSessions(): WritingSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt storage
  }
  return []
}

function saveSessions(sessions: WritingSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-MAX_SESSIONS)))
  } catch {
    // 存储配额超限时放弃持久化，不影响当前会话使用
  }
}

export const useWritingStore = defineStore('writing', {
  state: () => ({
    sessions: loadSessions() as WritingSession[],
    isGenerating: false,
    error: '' as string,
  }),
  actions: {
    async generate(message: string, count = 3) {
      const text = message.trim()
      if (!text) {
        this.error = '请先输入想写的内容'
        return
      }
      this.error = ''
      this.isGenerating = true
      try {
        const authStore = useAuthStore()
        const results = await generateCopy(authStore.isAuthenticated, text, count)
        this.sessions.push({
          id: `writing-${Date.now()}`,
          message: text,
          createdAt: Date.now(),
          results,
        })
        this.sessions = this.sessions.slice(-MAX_SESSIONS)
        saveSessions(this.sessions)
      } catch (e) {
        this.error = e instanceof Error ? e.message : '生成失败，请重试'
      } finally {
        this.isGenerating = false
      }
    },
    clearSessions() {
      this.sessions = []
      saveSessions(this.sessions)
    },
  },
})
