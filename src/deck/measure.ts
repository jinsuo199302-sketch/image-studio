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
  wrap?: boolean
  vcenter?: boolean
  // image
  src?: string
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

/** 把 CSS 颜色解析成不透明 RGB 三元组，遇到半透明就混到 `bg` 上（PPTX 形状不支持半透明）。
 * bg 默认为白 —— 但深色章节页上的浅色装饰必须混到深底上，否则会变成刺眼的纯白。 */
function toRgb(c: string, bg: [number, number, number] = [255, 255, 255]): string | null {
  if (!c || c === 'transparent') return null
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) return c.startsWith('#') ? c : null
  const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s))
  if (a !== undefined && a < 0.02) return null
  if (a !== undefined && a < 1) {
    return '#' + [r, g, b].map((v, i) => hex2(v * a + bg[i] * (1 - a))).join('')
  }
  return '#' + [r, g, b].map((v) => hex2(v)).join('')
}

/** 只取 rgb() / rgba(a=1) / #hex 的不透明三元组，用来往下传背景色 */
function solidTriple(c: string): [number, number, number] | null {
  if (!c) return null
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s))
    if (a !== undefined && a < 0.5) return null
    return [r, g, b]
  }
  if (c.startsWith('#')) {
    const h = c.slice(1)
    const s = h.length === 3 ? h.replace(/./g, (x) => x + x) : h
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  }
  return null
}

function firstFont(family: string): string {
  const f = (family || '').split(',')[0].trim().replace(/["']/g, '')
  return f || 'Microsoft YaHei'
}

/** 这个元素是不是"文字叶子"：自己有可见文字，且没有还带文字的子元素 */
export function isTextLeaf(el: HTMLElement): boolean {
  const own = Array.from(el.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim(),
  )
  if (!own) return false
  return !Array.from(el.children).some((c) => (c.textContent || '').trim())
}

export function measureSlide(root: HTMLElement): { w: number; h: number; prims: Prim[] } {
  const base = root.getBoundingClientRect()
  const prims: Prim[] = []

  const walk = (el: HTMLElement, bg: [number, number, number]) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return
    const r = el.getBoundingClientRect()
    const x = r.left - base.left
    const y = r.top - base.top
    const w = r.width
    const h = r.height
    if (w < 0.5 || h < 0.5) {
      Array.from(el.children).forEach((c) => walk(c as HTMLElement, bg))
      return
    }

    const fill = toRgb(cs.backgroundColor, bg)
    // 这个元素有实底色时，它的后代就以此为背景往下混
    const childBg = solidTriple(cs.backgroundColor) || bg
    const bw = parseFloat(cs.borderTopWidth) || 0
    const bcol = toRgb(cs.borderTopColor, bg)
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
      // innerText 会把 <br> 变成换行、去掉多余空白。
      // 注意：不能用 .trim() —— 它会连开头的全角空格（首行缩进）一起吃掉
      const t = (el.innerText || el.textContent || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .replace(/^[ \t\r\n]+/, '')
        .replace(/\s+$/, '')
      if (t) {
        const fs = parseFloat(cs.fontSize)
        const lh = parseFloat(cs.lineHeight) / fs || 1.2
        // 浏览器里就一行的文字（标题/大数字/装饰英文）→ 导出时禁止换行，
        // 否则 PPT 字体更宽会折行、撑高文本框、压到下一个元素
        const oneLine = !t.includes('\n') && r.height <= fs * lh * 1.6
        // flex 居中的文字（圆圈里的序号、圆点里的数字）——PPT 里文本框跟形状是两个独立对象，
        // 得显式告诉它水平+垂直都居中，否则数字会歪到角上
        const flexCentered =
          cs.display.includes('flex') &&
          cs.justifyContent.includes('center') &&
          cs.alignItems.includes('center')
        prims.push({
          kind: 'text', x, y, w, h,
          text: t,
          fontSize: fs,
          bold: parseInt(cs.fontWeight, 10) >= 600 || cs.fontWeight === 'bold',
          italic: cs.fontStyle === 'italic',
          color: toRgb(cs.color, bg) || '#222222',
          align: flexCentered
            ? 'center'
            : ((cs.textAlign === 'center' || cs.textAlign === 'right' ? cs.textAlign : 'left') as Prim['align']),
          font: firstFont(cs.fontFamily),
          lineHeight: lh,
          letterSpacing: parseFloat(cs.letterSpacing) || 0,
          wrap: !oneLine,
          vcenter: flexCentered || undefined,
        })
      }
      return
    }
    Array.from(el.children).forEach((c) => walk(c as HTMLElement, childBg))
  }

  walk(root, solidTriple(getComputedStyle(root).backgroundColor) || [255, 255, 255])
  return { w: base.width, h: base.height, prims }
}
