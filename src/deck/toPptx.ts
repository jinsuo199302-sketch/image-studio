/**
 * 渲染好的幻灯片 DOM → 可编辑 PPTX（浏览器里跑，服务器零负担）。
 * 用 pptxgenjs 生成原生形状/文本框，坐标从 measureSlide 量出来的图元换算。
 */
import PptxGenJS from 'pptxgenjs'
import { measureSlide, type Prim } from './measure'

const IN_PER_PX_W = 13.333 / 1280
const IN_PER_PX_H = 7.5 / 720
const SLIDE_W = 13.333
const SLIDE_H = 7.5

/** 把矩形裁到画布内（模拟 .slide 的 overflow:hidden）。完全在外返回 null。 */
function clip(x: number, y: number, w: number, h: number) {
  const x0 = Math.max(0, x)
  const y0 = Math.max(0, y)
  const x1 = Math.min(SLIDE_W, x + w)
  const y1 = Math.min(SLIDE_H, y + h)
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, clipped: x0 !== x || y0 !== y || x1 !== x + w || y1 !== y + h }
}

async function imgToDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { mode: 'cors' })
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onloadend = () => resolve(fr.result as string)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function addPrim(slide: PptxGenJS.Slide, p: Prim, pptx: PptxGenJS, imgCache: Map<string, string>) {
  const x = p.x * IN_PER_PX_W
  const y = p.y * IN_PER_PX_H
  const w = p.w * IN_PER_PX_W
  const h = p.h * IN_PER_PX_H

  if (p.kind === 'rect') {
    const c = clip(x, y, w, h)
    if (!c) return
    // 椭圆/圆无法裁切：越界就整体丢弃，别在画布外露出半个
    if (p.ellipse && c.clipped) return
    const opts: PptxGenJS.ShapeProps = { x: c.x, y: c.y, w: c.w, h: c.h }
    opts.fill = p.fill ? { color: p.fill.replace('#', '') } : { type: 'none' }
    if (p.lineColor) opts.line = { color: p.lineColor.replace('#', ''), width: Math.max(0.5, p.lineW || 1) }
    else opts.line = { type: 'none' } as unknown as PptxGenJS.ShapeLineProps
    if (p.ellipse) slide.addShape(pptx.ShapeType.ellipse, opts)
    else if (p.radius) {
      opts.rectRadius = Math.min(0.5, (p.radius * IN_PER_PX_W) / Math.min(c.w, c.h)) * Math.min(c.w, c.h)
      slide.addShape(pptx.ShapeType.roundRect, opts)
    } else slide.addShape(pptx.ShapeType.rect, opts)
    return
  }

  if (p.kind === 'image') {
    const data = p.src ? imgCache.get(p.src) : null
    if (!data) return
    const c = clip(x, y, w, h)
    if (!c) return
    if (c.clipped) {
      // 越界的图按裁掉的比例裁图源，不压缩变形
      slide.addImage({
        data,
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        sizing: { type: 'crop', w: c.w, h: c.h, x: c.x - x, y: c.y - y },
      })
    } else {
      slide.addImage({ data, x, y, w, h })
    }
    return
  }

  if (p.kind === 'text' && p.text) {
    if (x >= SLIDE_W - 0.05 || x + w <= 0.05 || y >= SLIDE_H - 0.05) return
    const fs = p.fontSize || 16
    const lh = p.lineHeight || 1.2
    const wrap = p.wrap !== false
    // 不换行的文字（标题/大数字/装饰英文）：给足横向余量，PPT 字体更宽也不会被框逼折行
    let tx = x
    let tw = w
    if (!wrap) {
      const extra = (fs * (p.text.length > 6 ? 0.5 : 0.9)) * IN_PER_PX_W
      tw = w + extra
      if (p.align === 'center') tx = x - extra / 2
      else if (p.align === 'right') tx = x - extra
    }
    slide.addText(p.text, {
      x: tx,
      y,
      w: tw,
      h: p.vcenter ? h : wrap ? Math.max(h, fs * lh * IN_PER_PX_H * 1.3) : fs * lh * IN_PER_PX_H * 1.35,
      fontSize: fs * 0.75,
      bold: p.bold,
      italic: p.italic,
      color: (p.color || '#222222').replace('#', ''),
      align: p.align || 'left',
      valign: p.vcenter ? 'middle' : 'top',
      fontFace: p.font || 'Microsoft YaHei',
      lineSpacingMultiple: lh,
      charSpacing: p.letterSpacing ? p.letterSpacing * 0.75 : undefined,
      margin: 0,
      wrap,
      autoFit: false,
    })
  }
}

/** slideEls：一组已经渲染在页面上的 .slide 元素（1280×720）。返回 pptx Blob。 */
export async function slidesToPptx(slideEls: HTMLElement[], title = '演示文稿'): Promise<Blob> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'W', width: 13.333, height: 7.5 })
  pptx.layout = 'W'
  pptx.title = title

  const measured = slideEls.map((el) => measureSlide(el))

  // 预取所有图片
  const imgCache = new Map<string, string>()
  const srcs = new Set<string>()
  measured.forEach((m) => m.prims.forEach((p) => p.kind === 'image' && p.src && srcs.add(p.src)))
  await Promise.all(
    [...srcs].map(async (s) => {
      const d = await imgToDataUrl(s)
      if (d) imgCache.set(s, d)
    }),
  )

  for (const m of measured) {
    const slide = pptx.addSlide()
    for (const p of m.prims) addPrim(slide, p, pptx, imgCache)
  }

  return (await pptx.write({ outputType: 'blob' })) as Blob
}
