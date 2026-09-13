/**
 * 渲染好的幻灯片 DOM → 可编辑 PPTX（浏览器里跑，服务器零负担）。
 *
 * v2 图文混合方案：
 *  1. 用 snapdom 把整张幻灯片拍成一张位图当**背景**——所有装饰/色块/渐变/AI 整图 100% 保真
 *  2. 拍照前把文字全部临时透明掉，位图里没有文字
 *  3. 文字单独量出位置，铺成**真实可编辑的 pptx 文本框**叠在位图上
 * → 视觉跟浏览器里一模一样，文字还能在 PowerPoint 里改，彻底告别"逐图元重建"的对不齐问题。
 *
 * v3 补充：
 *  - 数据表格（.dtbl）额外量一遍，拍照前跟文字一样临时隐藏，改用 pptxgenjs 的原生 addTable
 *    铺在同一个位置——导出后是真表格对象（能在 PowerPoint 里调列宽/加行），不是背景图里的死格子线。
 *  - 视频是额外挂件：跟大纲生成的内容无关，由用户在导出前选"第几页 + 本地视频/YouTube 链接"，
 *    走 pptxgenjs 的 addMedia，跟那页的位图背景、文本框叠在一起。
 */
import PptxGenJS from 'pptxgenjs'
import { snapdom } from '@zumer/snapdom'
import JSZip from 'jszip'
import { measureSlide, isTextLeaf, type Prim } from './measure'

const SLIDE_W = 13.333
const SLIDE_H = 7.5
const IN_PER_PX_W = SLIDE_W / 1280
const IN_PER_PX_H = SLIDE_H / 720

export interface VideoAttachment {
  /** 挂在第几页，从 0 开始（cover 是第 0 页） */
  slideIndex: number
  /** 'file' = 本地视频（base64 data URI）；'online' = YouTube 嵌入链接 */
  kind: 'file' | 'online'
  /** kind='file' 时是 data URI（如 'data:video/mp4;base64,...'）；kind='online' 时是嵌入链接 */
  src: string
}

/** rgb()/rgba() → 6 位 hex（有透明度时按混到 bg 上取近似色，pptx 填充不支持半透明） */
function cssColorToHex(css: string, bg: [number, number, number] = [255, 255, 255]): string {
  const m = css.match(/rgba?\(([^)]+)\)/)
  if (!m) return (css || '#333333').replace('#', '')
  const parts = m[1].split(',').map((s) => parseFloat(s))
  const [r, g, b] = parts
  const a = parts[3] === undefined ? 1 : parts[3]
  const mix = (v: number, bgv: number) => Math.max(0, Math.min(255, Math.round(v * a + bgv * (1 - a))))
  return [mix(r, bg[0]), mix(g, bg[1]), mix(b, bg[2])].map((v) => v.toString(16).padStart(2, '0')).join('')
}

interface ExtractedTable {
  el: HTMLElement
  /** 像素坐标（跟 measureSlide 量出来的文字 Prim 同一套坐标系，方便互相排除） */
  px: { x: number; y: number; w: number; h: number }
  rows: PptxGenJS.TableRow[]
}

/** 幻灯片里的 .dtbl（数据表格组件）→ pptxgenjs 原生表格数据 + 位置。量的是当前渲染出的真实颜色/字号。 */
function extractTables(root: HTMLElement): ExtractedTable[] {
  const base = root.getBoundingClientRect()
  const out: ExtractedTable[] = []
  for (const box of Array.from(root.querySelectorAll<HTMLElement>('.dtbl'))) {
    const table = box.querySelector('table')
    if (!table) continue
    const r = box.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue

    const ths = Array.from(table.querySelectorAll<HTMLElement>('thead th'))
    const headerRow: PptxGenJS.TableRow = ths.map((th) => {
      const cs = getComputedStyle(th)
      return {
        text: th.textContent?.trim() || '',
        options: {
          bold: true,
          color: cssColorToHex(cs.color),
          fill: { color: cssColorToHex(cs.backgroundColor) },
          fontSize: Math.max(8, (parseFloat(cs.fontSize) || 15) * 0.75),
          align: 'left',
          valign: 'middle',
        },
      }
    })
    const bodyRows: PptxGenJS.TableRow[] = Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
      const rowFill = cssColorToHex(getComputedStyle(tr).backgroundColor)
      return Array.from(tr.querySelectorAll<HTMLElement>('td')).map((td, ci) => {
        const cs = getComputedStyle(td)
        return {
          text: td.textContent?.trim() || '',
          options: {
            bold: ci === 0,
            color: cssColorToHex(cs.color),
            fill: { color: rowFill },
            fontSize: Math.max(8, (parseFloat(cs.fontSize) || 16.5) * 0.75),
            align: 'left',
            valign: 'middle',
          },
        }
      })
    })

    out.push({
      el: box,
      px: { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height },
      rows: [headerRow, ...bodyRows],
    })
  }
  return out
}

/** 等这张幻灯片里的图片都加载完，否则 snapdom 可能拍到空白 */
export async function waitImages(el: HTMLElement): Promise<void> {
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
    // 多行换行文本额外留一整行缓冲：量的是浏览器里的实际折行高度，但 PowerPoint 是另一套排版
    // 引擎（换行规则/字距计算都不同），同一款字体也可能多折一行；pptxgenjs 的 shrink-on-overflow
    // 只在人在 PowerPoint 里手动改字才会重算，文件刚打开时不会自动生效，所以这里只能靠留足高度
    // 缓冲去兜底——不是 100% 杜绝溢出，是把"实际多折一行"这种最常见的情况先兜住。
    h: p.vcenter ? h : wrap ? Math.max(h + fs * lh * IN_PER_PX_H, fs * lh * IN_PER_PX_H * 1.3) : fs * lh * IN_PER_PX_H * 1.35,
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

/** 点 p 是否落在某个矩形框（同一套像素坐标系）里，判断文字是不是表格自己的格子文字 */
function inBox(p: { x: number; y: number }, box: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= box.x - 1 && p.y >= box.y - 1 && p.x <= box.x + box.w + 1 && p.y <= box.y + box.h + 1
}

/**
 * slideEls：一组已经渲染在页面上的 .slide 元素（1280×720，1:1）。返回 pptx Blob。
 * videoAttachments：可选，跟大纲内容无关的手动挂件——第几页贴一段视频。
 */
export async function slidesToPptx(
  slideEls: HTMLElement[],
  title = '演示文稿',
  videoAttachments: VideoAttachment[] = [],
): Promise<Blob> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'W', width: SLIDE_W, height: SLIDE_H })
  pptx.layout = 'W'
  pptx.title = title

  for (let idx = 0; idx < slideEls.length; idx++) {
    const el = slideEls[idx]
    await waitImages(el)

    // 0. 数据表格：单独量一遍位置+行列文字/颜色，后面走 pptxgenjs 原生 addTable
    const tables = extractTables(el)

    // 1. 先量文字（此时颜色还是真的）——表格自己格子里的文字交给 addTable 出，这里剔掉避免文字叠两遍
    const texts = (measureSlide(el).prims.filter((p) => p.kind === 'text' && p.text) as Prim[]).filter(
      (p) => !tables.some((t) => inBox(p, t.px)),
    )

    // 2. 临时透明掉所有文字、隐藏表格整个框，拍整页位图，再恢复
    //    （表格要连底色/格线一起藏，不然位图里还留着一份旧样式的表格，跟真表格重叠）
    const leaves = Array.from(el.querySelectorAll<HTMLElement>('*')).filter(isTextLeaf)
    const savedColor = leaves.map((n) => n.style.getPropertyValue('color'))
    leaves.forEach((n) => n.style.setProperty('color', 'transparent', 'important'))
    const savedVis = tables.map((t) => t.el.style.getPropertyValue('visibility'))
    tables.forEach((t) => t.el.style.setProperty('visibility', 'hidden'))
    let bgData: string
    try {
      const shot = await snapdom(el, { scale: 2, backgroundColor: '#ffffff', embedFonts: false })
      const canvas = await shot.toCanvas()
      bgData = canvas.toDataURL('image/jpeg', 0.92)
    } finally {
      leaves.forEach((n, i) => {
        if (savedColor[i]) n.style.setProperty('color', savedColor[i])
        else n.style.removeProperty('color')
      })
      tables.forEach((t, i) => {
        if (savedVis[i]) t.el.style.setProperty('visibility', savedVis[i])
        else t.el.style.removeProperty('visibility')
      })
    }

    // 3. 位图背景 + 真实文本框 + 原生表格 + 视频挂件
    const slide = pptx.addSlide()
    slide.addImage({ data: bgData, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H })
    for (const p of texts) addTextBox(slide, p)
    for (const t of tables) {
      slide.addTable(t.rows, {
        x: t.px.x * IN_PER_PX_W,
        y: t.px.y * IN_PER_PX_H,
        w: t.px.w * IN_PER_PX_W,
        h: t.px.h * IN_PER_PX_H,
        border: { type: 'solid', color: 'E4E7EC', pt: 0.5 },
        autoPage: false,
      })
    }
    for (const v of videoAttachments.filter((a) => a.slideIndex === idx)) {
      const vw = 7, vh = (vw * 9) / 16
      slide.addMedia({
        type: v.kind === 'online' ? 'online' : 'video',
        link: v.kind === 'online' ? v.src : undefined,
        data: v.kind === 'file' ? v.src : undefined,
        x: (SLIDE_W - vw) / 2,
        y: (SLIDE_H - vh) / 2,
        w: vw,
        h: vh,
      })
    }
  }

  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  return preserveLeadingSpaces(blob)
}

/** pptxgenjs 生成的 <a:t> 没有 xml:space="preserve"——首行缩进用的两个全角空格
 * 在部分渲染器/PowerPoint 里可能被当无意义空白吃掉。解压重写这一个属性，其余原样打包回去。 */
async function preserveLeadingSpaces(blob: Blob): Promise<Blob> {
  try {
    const zip = await JSZip.loadAsync(blob)
    const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    for (const name of slideFiles) {
      const xml = await zip.files[name].async('string')
      const patched = xml.replace(/<a:t>/g, '<a:t xml:space="preserve">')
      if (patched !== xml) zip.file(name, patched)
    }
    return await zip.generateAsync({ type: 'blob', mimeType: blob.type })
  } catch {
    return blob // 修不了就算了，不影响正常导出
  }
}
