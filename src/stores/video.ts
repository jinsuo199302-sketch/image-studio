import { defineStore } from 'pinia'
import type { VideoSession } from '../types'
import { generateVideo, type VideoParams } from '../services/videoApi'
import { useAuthStore } from './auth'

const STORAGE_KEY = 'image-studio.videoHistory'
const MAX_SESSIONS = 30

function loadSessions(): VideoSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt storage
  }
  return []
}

function saveSessions(sessions: VideoSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
  } catch {
    // 存储配额超限时放弃持久化，不影响当前会话使用
  }
}

export const useVideoStore = defineStore('video', {
  state: () => ({
    history: loadSessions() as VideoSession[],
    isGenerating: false,
    error: '' as string,
  }),
  actions: {
    async generate(params: VideoParams) {
      if (!params.prompt.trim()) {
        this.error = '请先输入视频描述'
        return null
      }
      this.error = ''
      this.isGenerating = true
      try {
        const authStore = useAuthStore()
        const url = await generateVideo(authStore.isAuthenticated, params)
        this.history.unshift({
          id: `video-${Date.now()}`,
          prompt: params.prompt,
          duration: params.duration,
          ratio: params.ratio,
          createdAt: Date.now(),
          url,
        })
        this.history = this.history.slice(0, MAX_SESSIONS)
        saveSessions(this.history)
        return url
      } catch (e) {
        this.error = e instanceof Error ? e.message : '生成失败，请重试'
        return null
      } finally {
        this.isGenerating = false
      }
    },
  },
})
