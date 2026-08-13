import { defineStore } from 'pinia'
import { generateDesign, type GeneratedDesign } from '../services/designApi'
import { useAuthStore } from './auth'

export const useDesignStore = defineStore('design', {
  state: () => ({
    isGenerating: false,
    error: '' as string,
    lastResult: null as GeneratedDesign | null,
  }),
  actions: {
    async generate(prompt: string, canvasWidth: number, canvasHeight: number) {
      const text = prompt.trim()
      if (!text) {
        this.error = '请先描述想要的设计'
        return
      }
      this.error = ''
      this.isGenerating = true
      try {
        const authStore = useAuthStore()
        this.lastResult = await generateDesign(authStore.isAuthenticated, text, canvasWidth, canvasHeight)
      } catch (e) {
        this.error = e instanceof Error ? e.message : '生成失败，请重试'
      } finally {
        this.isGenerating = false
      }
    },
    clear() {
      this.lastResult = null
      this.error = ''
    },
  },
})
