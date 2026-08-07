import { defineStore } from 'pinia'
import type { Template } from '../data/templates'
import * as templateApi from '../services/templateApi'
import type { CreateTemplatePayload } from '../services/templateApi'

export const useTemplateStore = defineStore('templates', {
  state: () => ({
    items: [] as Template[],
    loading: false,
    error: '',
    loaded: false,
  }),
  actions: {
    async fetchAll() {
      this.loading = true
      this.error = ''
      try {
        this.items = await templateApi.listTemplates()
        this.loaded = true
      } catch {
        this.error = '模板加载失败，请检查后端服务（image-studio/backend）是否已启动'
      } finally {
        this.loading = false
      }
    },
    async ensureLoaded() {
      if (this.loaded || this.loading) return
      await this.fetchAll()
    },
    async fetchOne(id: string): Promise<Template | null> {
      const cached = this.items.find((t) => t.id === id)
      if (cached) return cached
      try {
        return await templateApi.getTemplate(id)
      } catch {
        return null
      }
    },
    async createTemplate(payload: CreateTemplatePayload): Promise<Template> {
      const created = await templateApi.createTemplate(payload)
      this.items.unshift(created)
      return created
    },
    async removeTemplate(id: string) {
      await templateApi.deleteTemplate(id)
      this.items = this.items.filter((t) => t.id !== id)
    },
  },
})
