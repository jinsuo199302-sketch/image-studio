import { authPostForm } from './httpClient'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/**
 * 老照片上色：走后端 /api/ai/colorize，本地跑上色模型（黑白 -> 彩色），返回 JPEG。
 * 未登录时演示模式直接原图返回，只验证上传 -> 处理 -> 展示流程。
 * saturation：1 = 模型原始输出；>1 提饱和（这个模型偏保守，褪色感强时往上调）。
 */
async function realColorize(imageDataUrl: string, saturation: number): Promise<string> {
  const form = new FormData()
  form.append('image', await dataUrlToBlob(imageDataUrl), 'image.jpg')
  form.append('saturation', String(saturation))
  const data = await authPostForm<{ data: Array<{ url?: string; b64_json?: string; mime?: string }> }>(
    '/colorize',
    form,
    '上色接口请求失败',
  )
  const item = data.data?.[0]
  if (!item) throw new Error('上色接口返回结果为空')
  return item.url ?? `data:${item.mime ?? 'image/jpeg'};base64,${item.b64_json}`
}

export async function colorizePhoto(
  authenticated: boolean,
  imageDataUrl: string,
  saturation = 1,
): Promise<string> {
  if (authenticated) return realColorize(imageDataUrl, saturation)
  await delay(1000 + Math.random() * 600)
  return imageDataUrl
}
