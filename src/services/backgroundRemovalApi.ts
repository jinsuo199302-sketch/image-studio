import { authPostForm } from './httpClient'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 演示模式：未配置真实接口时，直接原图返回，不做真实抠图，
 * 仅用于验证上传 -> 处理 -> 插入画布的流程。
 */
async function mockRemoveBackground(imageDataUrl: string): Promise<string> {
  await delay(1000 + Math.random() * 600)
  return imageDataUrl
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/**
 * 走后端代理 /api/ai/background-removal：后端本地跑 rembg（开源模型，不依赖任何第三方 key），
 * 结果是真透明背景的 PNG。首次调用后端要下载模型，会明显慢一次。
 */
async function realRemoveBackground(imageDataUrl: string): Promise<string> {
  const form = new FormData()
  form.append('image', await dataUrlToBlob(imageDataUrl), 'image.png')

  const data = await authPostForm<{ data: Array<{ url?: string; b64_json?: string }> }>(
    '/background-removal',
    form,
    '抠图接口请求失败',
  )
  const item = data.data?.[0]
  if (!item) throw new Error('抠图接口返回结果为空')
  return item.url ?? `data:image/png;base64,${item.b64_json}`
}

export async function removeBackground(authenticated: boolean, imageDataUrl: string): Promise<string> {
  if (authenticated) {
    return realRemoveBackground(imageDataUrl)
  }
  return mockRemoveBackground(imageDataUrl)
}
