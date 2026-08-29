/** 归一化矩形（相对图片宽高的 0~1 比例） */
export interface NormRect {
  x: number
  y: number
  w: number
  h: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * 按归一化矩形裁剪图片，返回裁剪后的 JPEG data URL。
 * 用原图分辨率裁（不是显示尺寸），保证送去识别的是清晰的局部。
 */
export async function cropDataUrl(src: string, rect: NormRect): Promise<string> {
  const img = await loadImage(src)
  const sx = Math.max(0, rect.x) * img.naturalWidth
  const sy = Math.max(0, rect.y) * img.naturalHeight
  const sw = Math.min(1 - rect.x, rect.w) * img.naturalWidth
  const sh = Math.min(1 - rect.y, rect.h) * img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}
