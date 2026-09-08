/**
 * 彩色图 → 极淡线稿。纯前端 Canvas，零后端。
 *
 * 思路：灰度 → 轻度模糊（模糊半径 = 线条粗细）→ Sobel 梯度幅值当"线条强度" →
 * 映射成浅灰半透明像素铺在透明底上。刻意压低不透明度，让它像"用铅笔轻轻描过一遍"，
 * 而不是黑白复印件。输出透明 PNG，放画布上可直接叠在彩纸/背景上。
 */

export interface LineArtOptions {
  /** 线条粗细 1~5：越大预模糊越多、并做膨胀，线更粗 */
  thickness: number
  /** 线条深浅 1~5：越大梯度增益越高、透明度上限越高，线更明显 */
  depth: number
  /** 线条颜色，默认灰 */
  color?: string
}

function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h)
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return g
}

/** 分离式盒式模糊近似高斯，radius 为整数半径 */
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const win = radius * 2 + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    const row = y * w
    for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win
      const add = src[row + Math.min(w - 1, x + radius + 1)]
      const sub = src[row + Math.max(0, x - radius)]
      acc += add - sub
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win
      const add = tmp[Math.min(h - 1, y + radius + 1) * w + x]
      const sub = tmp[Math.max(0, y - radius) * w + x]
      acc += add - sub
    }
  }
  return out
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [107, 114, 128]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 对 alpha 通道做一次 3x3 最大值膨胀，让线更连贯/更粗 */
function dilateAlpha(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx))
          const v = a[yy * w + xx]
          if (v > m) m = v
        }
      }
      out[y * w + x] = m
    }
  }
  return out
}

/**
 * @returns 透明底的线稿 data URL（PNG）
 */
export function imageToLineArt(img: HTMLImageElement, opts: LineArtOptions): string {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(img, 0, 0)
  const { data } = sctx.getImageData(0, 0, w, h)

  const thickness = Math.min(5, Math.max(1, opts.thickness))
  const depth = Math.min(5, Math.max(1, opts.depth))

  const gray = toGray(data, w, h)
  const blurRadius = [0, 0, 1, 1, 2][thickness - 1]
  const g = blurRadius > 0 ? boxBlur(gray, w, h, blurRadius) : gray

  // Sobel 梯度幅值
  const alpha = new Float32Array(w * h)
  // 增益：depth 越大越敏感；4~5 档明显
  const gain = [0.8, 1.05, 1.35, 1.75, 2.2][depth - 1]
  // 透明度上限：刻意压低——最淡档最多 0.32，最深档也就 0.7
  const alphaCap = [0.32, 0.42, 0.52, 0.62, 0.72][depth - 1]
  // 低于这个幅值的当噪点丢掉
  const noiseFloor = [10, 8, 6, 5, 4][depth - 1]

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const tl = g[i - w - 1], t = g[i - w], tr = g[i - w + 1]
      const l = g[i - 1], r = g[i + 1]
      const bl = g[i + w - 1], b = g[i + w], br = g[i + w + 1]
      const gx = tl + 2 * l + bl - tr - 2 * r - br
      const gy = tl + 2 * t + tr - bl - 2 * b - br
      let mag = Math.sqrt(gx * gx + gy * gy)
      if (mag < noiseFloor) {
        alpha[i] = 0
        continue
      }
      let aVal = (mag / 255) * gain
      if (aVal > 1) aVal = 1
      alpha[i] = aVal * alphaCap
    }
  }

  const finalAlpha = thickness >= 4 ? dilateAlpha(alpha, w, h) : alpha

  const [cr, cg, cb] = hexToRgb(opts.color || '#6b7280')
  const out = sctx.createImageData(w, h)
  const od = out.data
  for (let i = 0, p = 0; i < finalAlpha.length; i++, p += 4) {
    od[p] = cr
    od[p + 1] = cg
    od[p + 2] = cb
    od[p + 3] = Math.round(finalAlpha[i] * 255)
  }
  sctx.putImageData(out, 0, 0)
  return src.toDataURL('image/png')
}
