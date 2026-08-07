import { defineStore } from 'pinia'
import type { GenerationParams, GeneratedImage, HistorySession } from '../types'
import { generateImages } from '../services/imageApi'
import { useApiConfigStore } from './apiConfig'

export const STYLE_PRESETS = [
  { key: 'photo', label: '真实摄影' },
  { key: 'illustration', label: '插画' },
  { key: 'anime', label: '二次元' },
  { key: '3d', label: '3D 渲染' },
  { key: 'watercolor', label: '水彩' },
  { key: 'cyberpunk', label: '赛博朋克' },
]

export const useGenerationStore = defineStore('generation', {
  state: () => ({
    params: {
      prompt: '',
      negativePrompt: '',
      style: 'photo',
      aspectRatio: '1:1',
      batchSize: 4,
      referenceImage: null,
    } as GenerationParams,
    currentResults: [] as GeneratedImage[],
    history: [] as HistorySession[],
    isGenerating: false,
    error: '' as string,
  }),
  actions: {
    async generate() {
      if (!this.params.prompt.trim()) {
        this.error = '请先输入画面描述'
        return
      }
      this.error = ''
      this.isGenerating = true
      this.currentResults = []
      try {
        const apiConfigStore = useApiConfigStore()
        const images = await generateImages(
          apiConfigStore.isConfigured ? apiConfigStore.config : null,
          this.params,
        )
        this.currentResults = images
        this.history.unshift({
          id: `session-${Date.now()}`,
          prompt: this.params.prompt,
          createdAt: Date.now(),
          images,
        })
      } catch (e) {
        this.error = e instanceof Error ? e.message : '生成失败，请重试'
      } finally {
        this.isGenerating = false
      }
    },
    toggleStar(imageId: string) {
      for (const session of this.history) {
        const img = session.images.find((i) => i.id === imageId)
        if (img) img.starred = !img.starred
      }
      const cur = this.currentResults.find((i) => i.id === imageId)
      if (cur) cur.starred = !cur.starred
    },
    useAsReference(url: string) {
      this.params.referenceImage = url
    },
    clearResults() {
      this.currentResults = []
    },
  },
})
