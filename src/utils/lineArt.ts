/**
 * 彩色图 → 线稿。纯前端 Canvas，零后端。
 *
 * 用「自适应阈值」（局部均值对比，跟后端手抄报线稿版 _to_lineart 的 OpenCV
 * adaptiveThreshold 一个路子）提干净的轮廓线，而不是 Sobel 梯度——后者会把蜡笔/
 * 水彩的笔触纹理全当成边缘，出来一片脏网点。提完再按「深浅」压成浅色半透明铺在
 * 透明底上，可直接叠在彩纸/背景上。
 */

export interface LineArtOptions {
  /** 线条粗细 1~5：越大取样块越大、并做膨胀，线更粗 */
  thickness: number
  /** 线条深浅 1~5：越小越淡（只留最重的主轮廓、透明度低），越大越明显 */
  depth: number
  /** 线条颜色，默认深灰 */
  color?: string
  /** 线型：实线（默认）/ 虚线（在干净线条上叠斜向断点） */
  lineStyle?: 'solid' | 'dashed'
}

function toGray(data: Uint8ClampedArray, n: number): Float32Array {
  const g = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return g
}

/** 分离式盒式模糊近似高斯，radius 为整数半径 */
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src.slice()
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const win = radius * 2 + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    const row = y * w
    for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win
      acc += src[row + Math.min(w - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / win
      acc += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x]
    }
  }
  return out
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (!m) return [75, 85, 99]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 3x3 最大值膨胀，让线更连贯/更粗 */
function dilateAlpha(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const v = a[yy * w + Math.min(w - 1, Math.max(0, x + dx))]
          if (v > m) m = v
        }
      }
      out[y * w + x] = m
    }
  }
  return out
}

/** 通用：把一张灰度权重图（alpha 0~1）按颜色/线型/粗细渲染成透明底 PNG */
function alphaToDataUrl(
  alpha: Float32Array,
  w: number,
  h: number,
  cx: CanvasRenderingContext2D,
  cv: HTMLCanvasElement,
  opts: LineArtOptions,
): string {
  const thickness = Math.min(5, Math.max(1, Math.round(opts.thickness)))
  const d1 = thickness >= 3 ? dilateAlpha(alpha, w, h) : alpha
  const a2 = thickness >= 5 ? dilateAlpha(d1, w, h) : d1
  const dashed = opts.lineStyle === 'dashed'
  const period = 6 + thickness * 3
  const onFrac = 0.55
  const [cr, cg, cb] = hexToRgb(opts.color || '#4b5563')
  const out = cx.createImageData(w, h)
  const od = out.data
  for (let y = 0, i = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++, p += 4) {
      let a = a2[i]
      if (dashed && a > 0 && ((x + y) % period) / period >= onFrac) a = 0
      od[p] = cr
      od[p + 1] = cg
      od[p + 2] = cb
      od[p + 3] = Math.round(a * 255)
    }
  }
  cx.putImageData(out, 0, 0)
  return cv.toDataURL('image/png')
}

/**
 * 把"黑线白底"的图（AI 线稿 / 扫描的线稿）压成任意深浅的透明底线稿。
 * AI 已经把线画干净了，这里只负责按「深浅」调不透明度、按「粗细」加粗、可选虚线。
 */
export function styleLineArt(img: HTMLImageElement, opts: LineArtOptions): string {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const cx = cv.getContext('2d', { willReadFrequently: true })!
  cx.fillStyle = '#fff'
  cx.fillRect(0, 0, w, h)
  cx.drawImage(img, 0, 0)
  const { data } = cx.getImageData(0, 0, w, h)
  const gray = toGray(data, w * h)
  const depth = Math.min(5, Math.max(1, Math.round(opts.depth)))
  const cap = [0.34, 0.52, 0.7, 0.86, 1.0][depth - 1]
  const alpha = new Float32Array(w * h)
  for (let i = 0; i < alpha.length; i++) {
    const dark = (255 - gray[i]) / 255 // 白底→0，黑线→1
    if (dark < 0.12) continue
    let s = (dark - 0.12) / 0.5
    if (s > 1) s = 1
    alpha[i] = s * cap
  }
  return alphaToDataUrl(alpha, w, h, cx, cv, opts)
}

/** @returns 透明底的线稿 data URL（PNG） */
export function imageToLineArt(img: HTMLImageElement, opts: LineArtOptions): string {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const cx = cv.getContext('2d', { willReadFrequently: true })!
  cx.drawImage(img, 0, 0)
  const { data } = cx.getImageData(0, 0, w, h)

  const thickness = Math.min(5, Math.max(1, Math.round(opts.thickness)))
  const depth = Math.min(5, Math.max(1, Math.round(opts.depth)))

  const gray = toGray(data, w * h)
  // 先轻抹一遍杀掉蜡笔/水彩的细纹理，只留真正的轮廓
  const denoised = boxBlur(gray, w, h, 1)
  // 自适应阈值的"局部均值"：取样块随粗细放大
  const blockR = 6 + thickness * 4
  const mean = boxBlur(denoised, w, h, blockR)

  // C：像素比周围暗多少才算线。depth 小 → C 大 → 只留最重的主轮廓（更淡/更少）
  const C = [16, 11, 7, 4.5, 2.5][depth - 1]
  const soft = 7 // 抗锯齿过渡
  // 透明度上限：depth 小很淡，大接近实色
  const alphaCap = [0.3, 0.46, 0.62, 0.8, 1.0][depth - 1]

  const raw = new Float32Array(w * h)
  for (let i = 0; i < raw.length; i++) {
    const d = mean[i] - denoised[i] // >0：比周围暗 = 线
    if (d <= C) continue
    let s = (d - C) / soft
    if (s > 1) s = 1
    raw[i] = s * alphaCap
  }

  return alphaToDataUrl(raw, w, h, cx, cv, opts)
}
