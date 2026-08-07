import type { ApiConfig } from '../types'

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

/**
 * TODO: 接入真实抠图接口后在此实现，常见服务如 remove.bg：
 *
 * const form = new FormData()
 * form.append('image_file_b64', imageDataUrl.split(',')[1])
 * const res = await fetch(`${config.baseUrl}/removebg`, {
 *   method: 'POST',
 *   headers: { 'X-Api-Key': config.apiKey },
 *   body: form,
 * })
 * const blob = await res.blob()
 * return URL.createObjectURL(blob)
 */
async function realRemoveBackground(_config: ApiConfig, _imageDataUrl: string): Promise<string> {
  throw new Error('尚未接入真实抠图接口')
}

export async function removeBackground(config: ApiConfig | null, imageDataUrl: string): Promise<string> {
  if (config && config.baseUrl && config.apiKey) {
    return realRemoveBackground(config, imageDataUrl)
  }
  return mockRemoveBackground(imageDataUrl)
}
