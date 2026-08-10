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
 * TODO: 接入真实超分辨率接口后在此实现，需要先在后端 ai_proxy.py 里加一个转发路由
 * （参考 images/generations 那个路由的写法），前端这里再改成调用 authPostJson('/images/upscale', ...)
 */
async function realUpscale(_imageDataUrl: string): Promise<string> {
  throw new Error('尚未接入真实高清放大接口')
}

export async function upscaleImage(authenticated: boolean, imageDataUrl: string): Promise<string> {
  if (authenticated) {
    return realUpscale(imageDataUrl)
  }
  return mockUpscale(imageDataUrl)
}
