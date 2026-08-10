export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9'

export interface StylePreset {
  key: string
  label: string
}

export interface GenerationParams {
  prompt: string
  negativePrompt: string
  style: string
  aspectRatio: AspectRatio
  batchSize: 1 | 2 | 4 | 6 | 9
  referenceImage: string | null
}

export interface GeneratedImage {
  id: string
  url: string
  prompt: string
  style: string
  aspectRatio: AspectRatio
  createdAt: number
  starred: boolean
}

export interface HistorySession {
  id: string
  prompt: string
  createdAt: number
  images: GeneratedImage[]
}

export interface WritingSession {
  id: string
  message: string
  createdAt: number
  results: string[]
}

export interface VideoSession {
  id: string
  prompt: string
  duration: 5 | 10
  ratio: '16:9' | '9:16' | '1:1'
  createdAt: number
  url: string
}
