import type { ApiConfig, AspectRatio, GenerationParams, GeneratedImage } from '../types'

const ASPECT_SIZE: Record<AspectRatio, [number, number]> = {
  '1:1': [768, 768],
  '3:4': [768, 1024],
  '4:3': [1024, 768],
  '9:16': [576, 1024],
  '16:9': [1024, 576],
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
 * 按 OpenAI 兼容格式实现，baseUrl 约定已包含 /v1（如 https://api.openlux.ai/v1）。
 * 未经真实联调验证——如果调用报错，把报错信息发给我，按实际返回结构调整。
 */
async function realGenerate(config: ApiConfig, params: GenerationParams): Promise<GeneratedImage[]> {
  const res = await fetch(`${config.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: 'GPT-image-2',
      prompt: params.prompt,
      n: params.batchSize,
      size: sizeFromAspectRatio(params.aspectRatio),
    }),
  })
  if (!res.ok) {
    throw new Error(`生成接口请求失败：${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  const now = Date.now()
  return (data.data as Array<{ url?: string; b64_json?: string }>).map((item, i) => ({
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
  config: ApiConfig | null,
  params: GenerationParams,
): Promise<GeneratedImage[]> {
  if (config && config.baseUrl && config.apiKey) {
    return realGenerate(config, params)
  }
  return mockGenerate(params)
}
