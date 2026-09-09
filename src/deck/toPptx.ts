/**
 * 渲染好的幻灯片 DOM → 可编辑 PPTX（浏览器里跑，服务器零负担）。
 * 用 pptxgenjs 生成原生形状/文本框，坐标从 measureSlide 量出来的图元换算。
 */
import PptxGenJS from 'pptxgenjs'
import { measureSlide, type Prim } from './measure'

const IN_PER_PX_W = 13.333 / 1280
const IN_PER_PX_H = 7.5 / 720

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
    const opts: PptxGenJS.ShapeProps = { x, y, w, h }
    opts.fill = p.fill ? { color: p.fill.replace('#', '') } : { type: 'none' }
    if (p.lineColor) opts.line = { color: p.lineColor.replace('#', ''), width: Math.max(0.5, p.lineW || 1) }
    else opts.line = { type: 'none' } as unknown as PptxGenJS.ShapeLineProps
    if (p.ellipse) slide.addShape(pptx.ShapeType.ellipse, opts)
    else if (p.radius) {
      opts.rectRadius = Math.min(0.5, (p.radius * IN_PER_PX_W) / Math.min(w, h)) * Math.min(w, h)
      slide.addShape(pptx.ShapeType.roundRect, opts)
    } else slide.addShape(pptx.ShapeType.rect, opts)
    return
  }

  if (p.kind === 'image') {
    const data = p.src ? imgCache.get(p.src) : null
    if (data) slide.addImage({ data, x, y, w, h })
    return
  }

  if (p.kind === 'text' && p.text) {
    slide.addText(p.text, {
      x, y, w, h: Math.max(h, (p.fontSize || 16) * IN_PER_PX_H * 1.4),
      fontSize: (p.fontSize || 16) * 0.75,
      bold: p.bold,
      italic: p.italic,
      color: (p.color || '#222222').replace('#', ''),
      align: p.align || 'left',
      valign: 'top',
      fontFace: p.font || 'Microsoft YaHei',
      lineSpacingMultiple: p.lineHeight || 1.2,
      charSpacing: p.letterSpacing ? p.letterSpacing * 0.75 : undefined,
      margin: 0,
      wrap: true,
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
