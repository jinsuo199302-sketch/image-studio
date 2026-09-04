import type { AspectRatio, GenerationParams, GeneratedImage } from '../types'
import { authPostJson } from './httpClient'

// gpt-image-2 只接受这三种尺寸（1024²、竖 1024×1536、横 1536×1024），
// 其它比例就近取。更大的分辨率靠前端本地放大（见 utils/upscale.ts）。
const ASPECT_SIZE: Record<AspectRatio, [number, number]> = {
  '1:1': [1024, 1024],
  '3:4': [1024, 1536],
  '4:3': [1536, 1024],
  '9:16': [1024, 1536],
  '16:9': [1536, 1024],
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 演示模式：未配置真实接口时，用 picsum.photos 占位图模拟生成结果，
 * 让界面/交互可以完整跑通。
 */
async function mockGenerate(params: GenerationParams): Promise<GeneratedImage[]> {
  await delay(1200 + Math.random() * 800)
  const [w, h] = ASPECT_SIZE[params.aspectRatio]
  const now = Date.now()
  return Array.from({ length: params.batchSize }).map((_, i) => ({
    id: `${now}-${i}`,
    url: `https://picsum.photos/seed/${now}-${i}/${w}/${h}`,
    prompt: params.prompt,
    style: params.style,
    aspectRatio: params.aspectRatio,
    createdAt: now,
    starred: false,
  }))
}

function sizeFromAspectRatio(ratio: AspectRatio): string {
  const [w, h] = ASPECT_SIZE[ratio]
  return `${w}x${h}`
}

/**
 * 走后端代理 /api/ai/images/generations，真实 key 只在服务器上，浏览器拿不到。
 * 后端按 OpenAI 兼容格式转发给 openlux——未经真实联调验证，如果报错，把报错信息发给我按实际结构调整。
 */
async function realGenerate(params: GenerationParams): Promise<GeneratedImage[]> {
  const data = await authPostJson<{ data: Array<{ url?: string; b64_json?: string }> }>(
    '/images/generations',
    {
      model: 'gpt-image-2',
      prompt: params.prompt,
      n: params.batchSize,
      size: sizeFromAspectRatio(params.aspectRatio),
    },
    '生成接口请求失败',
  )
  const now = Date.now()
  return data.data.map((item, i) => ({
    id: `${now}-${i}`,
    url: item.url ?? `data:image/png;base64,${item.b64_json}`,
    prompt: params.prompt,
    style: params.style,
    aspectRatio: params.aspectRatio,
    createdAt: now,
    starred: false,
  }))
}

export async function generateImages(
  authenticated: boolean,
  params: GenerationParams,
): Promise<GeneratedImage[]> {
  if (authenticated) {
    return realGenerate(params)
  }
  return mockGenerate(params)
}
