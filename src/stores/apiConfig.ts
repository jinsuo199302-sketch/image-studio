import { defineStore } from 'pinia'
import type { ApiConfig } from '../types'

const STORAGE_KEY = 'image-studio.apiConfig'

function load(): ApiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt storage
  }
  return { baseUrl: '', apiKey: '' }
}

export const useApiConfigStore = defineStore('apiConfig', {
  state: () => ({
    config: load() as ApiConfig,
  }),
  getters: {
    isConfigured: (state) => Boolean(state.config.baseUrl && state.config.apiKey),
  },
  actions: {
    save(config: ApiConfig) {
      this.config = config
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    },
  },
})
