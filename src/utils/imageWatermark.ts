// 给图片加水印（文字或图片 logo），支持四角/居中/平铺。纯 Canvas，无依赖。

export type WmLayout = 'tile' | 'center' | 'tl' | 'tr' | 'bl' | 'br'

export interface WatermarkOpts {
  type: 'text' | 'image'
  text: string
  color: string
  fontScale: number // 相对图片宽度的比例，如 0.05
  opacity: number // 0~1
  rotation: number // 度
  layout: WmLayout
  gap: number // 平铺间距倍数（相对水印自身尺寸）
  stroke: boolean // 文字描边，压在花背景上也看得清
  logo: HTMLImageElement | null
  logoScale: number // logo 宽度占图片宽度的比例
}

export const DEFAULT_WM: WatermarkOpts = {
  type: 'text',
  text: '仅供本人使用',
  color: '#ffffff',
  fontScale: 0.045,
  opacity: 0.35,
  rotation: -30,
  layout: 'tile',
  gap: 1.6,
  stroke: true,
  logo: null,
  logoScale: 0.18,
}

function loadBitmap(src: Blob | string): Promise<ImageBitmap> {
  if (typeof src === 'string') {
    return fetch(src).then((r) => r.blob()).then((b) => createImageBitmap(b))
  }
  return createImageBitmap(src)
}

export async function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo 加载失败'))
    img.src = src
  })
}

/** 返回水印一个单元的尺寸（未旋转前），用于平铺步进 */
function unitSize(ctx: CanvasRenderingContext2D, opts: WatermarkOpts, imgW: number): { w: number; h: number } {
  if (opts.type === 'image' && opts.logo) {
    const w = imgW * opts.logoScale
    return { w, h: w * (opts.logo.height / opts.logo.width) }
  }
  const fs = Math.max(10, imgW * opts.fontScale)
  ctx.font = `${fs}px "Microsoft YaHei", "PingFang SC", sans-serif`
  const m = ctx.measureText(opts.text || ' ')
  return { w: m.width, h: fs * 1.3 }
}

function drawUnit(ctx: CanvasRenderingContext2D, opts: WatermarkOpts, imgW: number) {
  if (opts.type === 'image' && opts.logo) {
    const w = imgW * opts.logoScale
    const h = w * (opts.logo.height / opts.logo.width)
    ctx.drawImage(opts.logo, -w / 2, -h / 2, w, h)
    return
  }
  const fs = Math.max(10, imgW * opts.fontScale)
  ctx.font = `${fs}px "Microsoft YaHei", "PingFang SC", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (opts.stroke) {
    ctx.lineWidth = Math.max(1, fs * 0.06)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.strokeText(opts.text, 0, 0)
  }
  ctx.fillStyle = opts.color
  ctx.fillText(opts.text, 0, 0)
}

export async function applyWatermark(src: Blob | string, opts: WatermarkOpts): Promise<Blob> {
  const bmp = await loadBitmap(src)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.drawImage(bmp, 0, 0)
  ctx.globalAlpha = opts.opacity

  const rad = (opts.rotation * Math.PI) / 180
  const { w: uw, h: uh } = unitSize(ctx, opts, bmp.width)

  if (opts.layout === 'tile') {
    // 在一个放大的、居中的旋转坐标系里铺满
    ctx.save()
    ctx.translate(bmp.width / 2, bmp.height / 2)
    ctx.rotate(rad)
    const diag = Math.hypot(bmp.width, bmp.height)
    const stepX = Math.max(uw, 20) * opts.gap
    const stepY = Math.max(uh, 20) * opts.gap * 1.4
    for (let y = -diag; y < diag; y += stepY) {
      for (let x = -diag; x < diag; x += stepX) {
        ctx.save()
        ctx.translate(x, y)
        drawUnit(ctx, opts, bmp.width)
        ctx.restore()
      }
    }
    ctx.restore()
  } else {
    const margin = bmp.width * 0.03
    let cx = bmp.width / 2
    let cy = bmp.height / 2
    if (opts.layout === 'tl') {
      cx = margin + uw / 2
      cy = margin + uh / 2
    } else if (opts.layout === 'tr') {
      cx = bmp.width - margin - uw / 2
      cy = margin + uh / 2
    } else if (opts.layout === 'bl') {
      cx = margin + uw / 2
      cy = bmp.height - margin - uh / 2
    } else if (opts.layout === 'br') {
      cx = bmp.width - margin - uw / 2
      cy = bmp.height - margin - uh / 2
    }
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rad)
    drawUnit(ctx, opts, bmp.width)
    ctx.restore()
  }

  ctx.globalAlpha = 1
  const isPng = typeof src !== 'string' && src.type === 'image/png'
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('导出失败'))),
      isPng ? 'image/png' : 'image/jpeg',
      0.92,
    )
  })
}
