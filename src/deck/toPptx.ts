/**
 * 渲染好的幻灯片 DOM → 可编辑 PPTX（浏览器里跑，服务器零负担）。
 *
 * v2 图文混合方案：
 *  1. 用 snapdom 把整张幻灯片拍成一张位图当**背景**——所有装饰/色块/渐变/AI 整图 100% 保真
 *  2. 拍照前把文字全部临时透明掉，位图里没有文字
 *  3. 文字单独量出位置，铺成**真实可编辑的 pptx 文本框**叠在位图上
 * → 视觉跟浏览器里一模一样，文字还能在 PowerPoint 里改，彻底告别"逐图元重建"的对不齐问题。
 */
import PptxGenJS from 'pptxgenjs'
import { snapdom } from '@zumer/snapdom'
import { measureSlide, isTextLeaf, type Prim } from './measure'

const SLIDE_W = 13.333
const SLIDE_H = 7.5
const IN_PER_PX_W = SLIDE_W / 1280
const IN_PER_PX_H = SLIDE_H / 720

/** 等这张幻灯片里的图片都加载完，否则 snapdom 可能拍到空白 */
async function waitImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'))
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((res) => {
              img.addEventListener('load', () => res(), { once: true })
              img.addEventListener('error', () => res(), { once: true })
              setTimeout(res, 8000)
            }),
    ),
  )
}

function addTextBox(slide: PptxGenJS.Slide, p: Prim): void {
  if (!p.text || p.x >= 1280 - 2 || p.y >= 720 - 2 || p.x + p.w <= 2) return
  const fs = p.fontSize || 16
  const lh = p.lineHeight || 1.2
  const wrap = p.wrap !== false
  let tx = p.x * IN_PER_PX_W
  let tw = p.w * IN_PER_PX_W
  if (!wrap) {
    const extra = fs * (p.text.length > 6 ? 0.5 : 0.9) * IN_PER_PX_W
    tw += extra
    if (p.align === 'center') tx -= extra / 2
    else if (p.align === 'right') tx -= extra
  }
  const h = p.h * IN_PER_PX_H
  slide.addText(p.text, {
    x: tx,
    y: p.y * IN_PER_PX_H,
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

/** slideEls：一组已经渲染在页面上的 .slide 元素（1280×720，1:1）。返回 pptx Blob。 */
export async function slidesToPptx(slideEls: HTMLElement[], title = '演示文稿'): Promise<Blob> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'W', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'W'
  pptx.title = title

  for (const el of slideEls) {
    await waitImages(el)

    // 1. 先量文字（此时颜色还是真的）
    const texts = measureSlide(el).prims.filter((p) => p.kind === 'text' && p.text) as Prim[]

    // 2. 临时透明掉所有文字，拍整页位图，再恢复
    const leaves = Array.from(el.querySelectorAll<HTMLElement>('*')).filter(isTextLeaf)
    const saved = leaves.map((n) => n.style.getPropertyValue('color'))
    leaves.forEach((n) => n.style.setProperty('color', 'transparent', 'important'))
    let bgData: string
    try {
      const shot = await snapdom(el, { scale: 2, backgroundColor: '#ffffff', embedFonts: false })
      const canvas = await shot.toCanvas()
      bgData = canvas.toDataURL('image/jpeg', 0.92)
    } finally {
      leaves.forEach((n, i) => {
        if (saved[i]) n.style.setProperty('color', saved[i])
        else n.style.removeProperty('color')
      })
    }

    // 3. 位图背景 + 真实文本框
    const slide = pptx.addSlide()
    slide.addImage({ data: bgData, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H })
    for (const p of texts) addTextBox(slide, p)
  }

  return (await pptx.write({ outputType: 'blob' })) as Blob
}
