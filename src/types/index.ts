export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9'

/** 输出清晰度：standard = 模型原生尺寸；2k/4k = 生成后本地高质量放大到对应长边 */
export type OutputRes = 'standard' | '2k' | '4k'

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
  outputRes: OutputRes
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
  /** 用户这轮附带上传的图片——只在当前页面会话里展示，不会持久化进 localStorage（图片体积大，
   * 存多了容易把 50 条会话的存储配额挤爆），刷新页面后历史消息就只剩文字，是有意的取舍 */
  imageUrl?: string
}

export interface VideoSession {
  id: string
  prompt: string
  duration: 5 | 10
  ratio: '16:9' | '9:16' | '1:1'
  createdAt: number
  url: string
}
