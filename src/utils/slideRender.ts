/**
 * 把一页幻灯片的 elements 数组画到 canvas 上（缩略图 / 预览用）。
 * 后端 deck_gen 出的 elements 只有 text / rect / image 三种，坐标是 1280×720 基准。
 */

export interface SlideElement {
  type: 'text' | 'rect' | 'image'
  x: number
  y: number
  width: number
  height?: number
  // text
  text?: string
  fontSize?: number
  fontWeight?: string
  color?: string
  align?: 'left' | 'center' | 'right'
  fontFamily?: string
  stroke?: string
  strokeWidth?: number
  letterSpacing?: number
  // rect
  fill?: string
  rx?: number
  // image
  src?: string
}

export interface SlideData {
  background: string
  elements: SlideElement[]
  w: number
  h: number
}

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + rr, y)
  c.arcTo(x + w, y, x + w, y + h, rr)
  c.arcTo(x + w, y + h, x, y + h, rr)
  c.arcTo(x, y + h, x, y, rr)
  c.arcTo(x, y, x + w, y, rr)
  c.closePath()
}

/** 按字符宽度换行（中英文混排够用），返回每行文本 */
function wrapLines(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para) {
      if (c.measureText(line + ch).width > maxW && line) {
        out.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    out.push(line)
  }
  return out
}

/** 已加载好的图片缓存，key = src */
const imgCache = new Map<string, HTMLImageElement>()

export function preloadSlideImages(slides: SlideData[]): Promise<void> {
  const srcs = new Set<string>()
  for (const s of slides) for (const el of s.elements) if (el.type === 'image' && el.src) srcs.add(el.src)
  return Promise.all(
    [...srcs].map(
      (src) =>
        new Promise<void>((resolve) => {
          if (imgCache.has(src)) return resolve()
          const im = new Image()
          im.crossOrigin = 'anonymous'
          im.onload = () => {
            imgCache.set(src, im)
            resolve()
          }
          im.onerror = () => resolve()
          im.src = src
        }),
    ),
  ).then(() => undefined)
}

export function renderSlide(canvas: HTMLCanvasElement, slide: SlideData, targetW: number) {
  const scale = targetW / slide.w
  canvas.width = Math.round(slide.w * scale)
  canvas.height = Math.round(slide.h * scale)
  const c = canvas.getContext('2d')!
  c.clearRect(0, 0, canvas.width, canvas.height)
  c.save()
  c.scale(scale, scale)

  c.fillStyle = slide.background || '#ffffff'
  c.fillRect(0, 0, slide.w, slide.h)

  for (const el of slide.elements) {
    if (el.type === 'rect') {
      roundRectPath(c, el.x, el.y, el.width, el.height || 0, el.rx || 0)
      if (el.fill) {
        c.fillStyle = el.fill
        c.fill()
      }
      if (el.stroke) {
        c.strokeStyle = el.stroke
        c.lineWidth = el.strokeWidth || 1
        c.stroke()
      }
    } else if (el.type === 'image' && el.src && imgCache.has(el.src)) {
      c.drawImage(imgCache.get(el.src)!, el.x, el.y, el.width, el.height || 0)
    } else if (el.type === 'text' && el.text) {
      const size = el.fontSize || 16
      c.font = `${el.fontWeight === 'bold' ? 'bold ' : ''}${size}px ${el.fontFamily || '"Noto Sans SC", sans-serif'}`
      c.textBaseline = 'top'
      c.textAlign = (el.align as CanvasTextAlign) || 'left'
      try {
        ;(c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${el.letterSpacing || 0}px`
      } catch {
        /* 老浏览器不支持 letterSpacing，忽略 */
      }
      const ax = el.align === 'center' ? el.x + el.width / 2 : el.align === 'right' ? el.x + el.width : el.x
      const lines = wrapLines(c, el.text, el.width)
      let ly = el.y
      for (const ln of lines) {
        if (el.stroke && (el.strokeWidth || 0) > 0) {
          c.strokeStyle = el.stroke
          c.lineWidth = (el.strokeWidth || 1) * 2
          c.lineJoin = 'round'
          c.strokeText(ln, ax, ly)
        }
        c.fillStyle = el.color || '#000000'
        c.fillText(ln, ax, ly)
        ly += size * 1.16
      }
    }
  }
  c.restore()
}
