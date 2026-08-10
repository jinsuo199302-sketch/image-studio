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
