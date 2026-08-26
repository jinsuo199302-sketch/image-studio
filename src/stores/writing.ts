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
    // imageUrl 是 base64 data URL，体积大——存 50 条历史很容易把 localStorage 配额挤爆，
    // 所以落盘前去掉，图片只在当前页面这次会话里能看到，刷新后历史消息保留文字部分
    const persistable = sessions.slice(-MAX_SESSIONS).map(({ imageUrl: _imageUrl, ...rest }) => rest)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
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
    async generate(message: string, count = 3, imageUrl?: string) {
      const text = message.trim()
      if (!text) {
        this.error = '请先输入想写的内容'
        return
      }
      this.error = ''
      this.isGenerating = true
      try {
        const authStore = useAuthStore()
        const results = await generateCopy(authStore.isAuthenticated, text, count, imageUrl)
        this.sessions.push({
          id: `writing-${Date.now()}`,
          message: text,
          createdAt: Date.now(),
          results,
          imageUrl,
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
