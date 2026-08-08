import { defineStore } from 'pinia'
import type { ApiConfig, ApiConfigs } from '../types'

const STORAGE_KEY = 'image-studio.apiConfigs'

function emptyConfig(): ApiConfig {
  return { baseUrl: '', apiKey: '' }
}

function load(): ApiConfigs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        image: parsed.image ?? emptyConfig(),
        text: parsed.text ?? emptyConfig(),
        video: parsed.video ?? emptyConfig(),
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return { image: emptyConfig(), text: emptyConfig(), video: emptyConfig() }
}

function isSet(config: ApiConfig) {
  return Boolean(config.baseUrl && config.apiKey)
}

export const useApiConfigStore = defineStore('apiConfig', {
  state: () => ({
    configs: load(),
  }),
  getters: {
    image: (state) => state.configs.image,
    text: (state) => state.configs.text,
    video: (state) => state.configs.video,
    isImageConfigured: (state) => isSet(state.configs.image),
    isTextConfigured: (state) => isSet(state.configs.text),
    isVideoConfigured: (state) => isSet(state.configs.video),
  },
  actions: {
    saveAll(configs: ApiConfigs) {
      this.configs = configs
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
    },
  },
})
