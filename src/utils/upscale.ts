/**
 * 本地高质量放大。模型出图最大 1536px，用户要 2K/4K 时在浏览器里用 canvas
 * 双线性/高质量重采样放大到目标长边——边缘更平滑、适合打印/壁纸，但不会凭空长出细节。
 */

export const RES_LONG_EDGE: Record<'standard' | '2k' | '4k', number | null> = {
  standard: null,
  '2k': 2560,
  '4k': 3840,
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * @param src        原图 url（data: / blob: / http）
 * @param longEdge   目标长边像素；null 或原图已够大则原样返回
 * @returns          PNG Blob
 */
export async function upscaleImage(src: string, longEdge: number | null): Promise<Blob> {
  const img = await loadImg(src)
  const curLong = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = longEdge && longEdge > curLong ? longEdge / curLong : 1

  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 一步放大太多会糊，>2 倍时分几次逐步放大，质量更好
  if (scale > 2) {
    let cw = img.naturalWidth
    let ch = img.naturalHeight
    let stage = document.createElement('canvas')
    stage.width = cw
    stage.height = ch
    stage.getContext('2d')!.drawImage(img, 0, 0)
    while (cw < w) {
      const nw = Math.min(w, cw * 2)
      const nh = Math.round((nw / cw) * ch)
      const next = document.createElement('canvas')
      next.width = nw
      next.height = nh
      const nctx = next.getContext('2d')!
      nctx.imageSmoothingEnabled = true
      nctx.imageSmoothingQuality = 'high'
      nctx.drawImage(stage, 0, 0, nw, nh)
      stage = next
      cw = nw
      ch = nh
    }
    ctx.drawImage(stage, 0, 0, w, h)
  } else {
    ctx.drawImage(img, 0, 0, w, h)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png')
  })
}
