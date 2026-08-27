import { authPostForm } from './httpClient'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/** 演示模式：未登录时原图返回，仅验证画蒙版 -> 提交 -> 替换画布这条流程 */
async function mockEraseObject(imageDataUrl: string): Promise<string> {
  await delay(1200 + Math.random() * 800)
  return imageDataUrl
}

/**
 * 走后端代理 /api/ai/images/edits：蒙版里透明（alpha=0）的区域是要重绘的部分，不透明部分保持原样。
 * 真实 key 只在服务器上。未经真实联调验证——如果调用报错，把报错信息发给我按 openlux 实际返回结构调整。
 */
async function realEraseObject(imageDataUrl: string, maskDataUrl: string, prompt: string): Promise<string> {
  const form = new FormData()
  form.append('image', await dataUrlToBlob(imageDataUrl), 'image.png')
  form.append('mask', await dataUrlToBlob(maskDataUrl), 'mask.png')
  form.append('model', 'gpt-image-2')
  form.append('prompt', prompt)
  form.append('n', '1')

  const data = await authPostForm<{ data: Array<{ url?: string; b64_json?: string }> }>(
    '/images/edits',
    form,
    '消除接口请求失败',
  )
  const item = data.data?.[0]
  if (!item) throw new Error('消除接口返回结果为空')
  return item.url ?? `data:image/png;base64,${item.b64_json}`
}

export async function eraseObject(
  authenticated: boolean,
  imageDataUrl: string,
  maskDataUrl: string,
  prompt: string,
): Promise<string> {
  if (authenticated) {
    return realEraseObject(imageDataUrl, maskDataUrl, prompt)
  }
  return mockEraseObject(imageDataUrl)
}

/**
 * 批量去重复水印：框选一个水印实例（box 是相对整图的 0~1 的 [x,y,w,h]），后端模板匹配
 * 找出所有相同的一次性 inpaint 掉。纯本地 OpenCV，不花 AI 额度。
 */
export async function removeRepeatedWatermark(
  authenticated: boolean,
  imageDataUrl: string,
  box: [number, number, number, number],
  threshold: number,
): Promise<{ url: string; count: number }> {
  if (!authenticated) {
    await delay(1000)
    return { url: imageDataUrl, count: 0 }
  }
  const form = new FormData()
  form.append('image', await dataUrlToBlob(imageDataUrl), 'image.png')
  form.append('box', box.join(','))
  form.append('threshold', String(threshold))
  const data = await authPostForm<{ data: Array<{ b64_json?: string; url?: string }>; count: number }>(
    '/remove-repeated-watermark',
    form,
    '去水印接口请求失败',
  )
  const item = data.data?.[0]
  if (!item) throw new Error('去水印接口返回结果为空')
  return { url: item.url ?? `data:image/png;base64,${item.b64_json}`, count: data.count ?? 0 }
}
