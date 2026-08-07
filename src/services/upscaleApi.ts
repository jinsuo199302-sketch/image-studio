import type { ApiConfig } from '../types'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 演示模式：未配置真实接口时，直接原图返回，不做真实超分辨率处理，
 * 仅用于验证上传 -> 处理 -> 插入画布的流程。
 */
async function mockUpscale(imageDataUrl: string): Promise<string> {
  await delay(1200 + Math.random() * 800)
  return imageDataUrl
}

/**
 * TODO: 接入真实超分辨率接口后在此实现，通常传入图片 + 放大倍数：
 *
 * const res = await fetch(`${config.baseUrl}/v1/images/upscale`, {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
 *   body: JSON.stringify({ image: imageDataUrl, scale: 2 }),
 * })
 * const data = await res.json()
 * return data.url
 */
async function realUpscale(_config: ApiConfig, _imageDataUrl: string): Promise<string> {
  throw new Error('尚未接入真实高清放大接口')
}

export async function upscaleImage(config: ApiConfig | null, imageDataUrl: string): Promise<string> {
  if (config && config.baseUrl && config.apiKey) {
    return realUpscale(config, imageDataUrl)
  }
  return mockUpscale(imageDataUrl)
}
