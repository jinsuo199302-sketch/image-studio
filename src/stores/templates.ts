import { defineStore } from 'pinia'
import type { Template } from '../data/templates'
import * as templateApi from '../services/templateApi'
import type { CreateTemplatePayload } from '../services/templateApi'

export const useTemplateStore = defineStore('templates', {
  state: () => ({
    items: [] as Template[],
    mine: [] as Template[],
    loading: false,
    mineLoading: false,
    error: '',
    mineError: '',
    loaded: false,
    mineLoaded: false,
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
    /** "我的设计"：只有登录后才有意义，每次调用都重新拉取（不缓存），避免切换账号后看到上一个人的数据 */
    async fetchMine() {
      this.mineLoading = true
      this.mineError = ''
      try {
        this.mine = await templateApi.listTemplates(undefined, true)
        this.mineLoaded = true
      } catch (e) {
        this.mineError = e instanceof Error ? e.message : '加载我的设计失败'
      } finally {
        this.mineLoading = false
      }
    },
    async fetchOne(id: string): Promise<Template | null> {
      const cached = this.items.find((t) => t.id === id) ?? this.mine.find((t) => t.id === id)
      if (cached) return cached
      try {
        return await templateApi.getTemplate(id)
      } catch {
        return null
      }
    },
    async createTemplate(payload: CreateTemplatePayload): Promise<Template> {
      const created = await templateApi.createTemplate(payload)
      this.mine.unshift(created)
      return created
    },
    async removeTemplate(id: string) {
      await templateApi.deleteTemplate(id)
      this.items = this.items.filter((t) => t.id !== id)
      this.mine = this.mine.filter((t) => t.id !== id)
    },
    resetMine() {
      this.mine = []
      this.mineLoaded = false
    },
  },
})
