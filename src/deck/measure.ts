/**
 * 把一个渲染好的幻灯片 DOM 量成一串"图元"（矩形/文字/图片/线），坐标是 slide 内的像素。
 * 不解析 CSS，直接读 getBoundingClientRect + getComputedStyle 的最终结果 —— flex/grid
 * 怎么摆的都无所谓，量的是最终位置。图元再交给 pptxgenjs 生成可编辑 PPTX。
 */

export interface Prim {
  kind: 'rect' | 'text' | 'image' | 'line'
  x: number
  y: number
  w: number
  h: number
  // rect
  fill?: string
  radius?: number
  ellipse?: boolean
  lineColor?: string
  lineW?: number
  // text
  text?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
  align?: 'left' | 'center' | 'right'
  font?: string
  lineHeight?: number
  letterSpacing?: number
  // image
  src?: string
}

function toRgb(c: string): string | null {
  if (!c || c === 'transparent') return null
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) return c.startsWith('#') ? c : null
  const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s))
  if (a !== undefined && a < 0.06) return null
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  // 有透明度就近似混到白底上（PPTX 形状不好做半透明）
  if (a !== undefined && a < 1) {
    return '#' + [r, g, b].map((v) => hex(v * a + 255 * (1 - a))).join('')
  }
  return '#' + [r, g, b].map((v) => hex(v)).join('')
}

function firstFont(family: string): string {
  const f = (family || '').split(',')[0].trim().replace(/["']/g, '')
  return f || 'Microsoft YaHei'
}

/** 这个元素是不是"文字叶子"：自己有可见文字，且没有还带文字的子元素 */
function isTextLeaf(el: HTMLElement): boolean {
  const own = Array.from(el.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim(),
  )
  if (!own) return false
  return !Array.from(el.children).some((c) => (c.textContent || '').trim())
}

export function measureSlide(root: HTMLElement): { w: number; h: number; prims: Prim[] } {
  const base = root.getBoundingClientRect()
  const prims: Prim[] = []

  const walk = (el: HTMLElement) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return
    const r = el.getBoundingClientRect()
    const x = r.left - base.left
    const y = r.top - base.top
    const w = r.width
    const h = r.height
    if (w < 0.5 || h < 0.5) {
      Array.from(el.children).forEach((c) => walk(c as HTMLElement))
      return
    }

    const fill = el === root ? toRgb(cs.backgroundColor) : toRgb(cs.backgroundColor)
    const bw = parseFloat(cs.borderTopWidth) || 0
    const bcol = toRgb(cs.borderTopColor)
    const radius = parseFloat(cs.borderTopLeftRadius) || 0
    const ellipse = radius >= Math.min(w, h) / 2 - 1

    if (el.tagName === 'IMG' && (el as HTMLImageElement).src) {
      prims.push({ kind: 'image', x, y, w, h, src: (el as HTMLImageElement).src })
      return
    }

    if (fill || (bw > 0 && bcol)) {
      prims.push({
        kind: 'rect', x, y, w, h,
        fill: fill || undefined,
        radius: radius && !ellipse ? radius : undefined,
        ellipse: ellipse || undefined,
        lineColor: bw > 0 && bcol ? bcol : undefined,
        lineW: bw > 0 && bcol ? bw : undefined,
      })
    }

    if (isTextLeaf(el)) {
      // innerText 会把 <br> 变成换行、去掉多余空白
      const t = (el.innerText || el.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
      if (t) {
        prims.push({
          kind: 'text', x, y, w, h,
          text: t,
          fontSize: parseFloat(cs.fontSize),
          bold: parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold',
          italic: cs.fontStyle === 'italic',
          color: toRgb(cs.color) || '#222222',
          align: (cs.textAlign === 'center' || cs.textAlign === 'right' ? cs.textAlign : 'left') as Prim['align'],
          font: firstFont(cs.fontFamily),
          lineHeight: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) || 1.2,
          letterSpacing: parseFloat(cs.letterSpacing) || 0,
        })
      }
      return
    }
    Array.from(el.children).forEach((c) => walk(c as HTMLElement))
  }

  walk(root)
  return { w: base.width, h: base.height, prims }
}
