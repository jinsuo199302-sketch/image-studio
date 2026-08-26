/**
 * 节日头像框——纯 Canvas 程序化绘制（不是套用现成边框图库素材），
 * 零 AI 成本、零版权风险，跟"边框贴纸"类工具的效果类似但形状/图案是自己代码画的。
 */

export interface AvatarFrameTheme {
  key: string
  label: string
  ringColors: [string, string] // [外圈, 内圈] 描边色
  decorColor: string
  bannerBg: string
  bannerText: string
  defaultText: string
  shape: 'star' | 'dot' | 'snowflake' | 'lantern'
}

export const AVATAR_FRAME_THEMES: AvatarFrameTheme[] = [
  {
    key: 'birthday',
    label: '生日',
    ringColors: ['#f9a8d4', '#fbbf24'],
    decorColor: '#f472b6',
    bannerBg: '#f472b6',
    bannerText: '#ffffff',
    defaultText: '生日快乐',
    shape: 'dot',
  },
  {
    key: 'festive',
    label: '喜庆红',
    ringColors: ['#c8161d', '#f6c92e'],
    decorColor: '#f6c92e',
    bannerBg: '#c8161d',
    bannerText: '#f6c92e',
    defaultText: '国庆快乐',
    shape: 'star',
  },
  {
    key: 'christmas',
    label: '圣诞',
    ringColors: ['#166534', '#dc2626'],
    decorColor: '#ffffff',
    bannerBg: '#166534',
    bannerText: '#ffffff',
    defaultText: '圣诞快乐',
    shape: 'snowflake',
  },
  {
    key: 'newyear',
    label: '新年',
    ringColors: ['#b91c1c', '#facc15'],
    decorColor: '#facc15',
    bannerBg: '#b91c1c',
    bannerText: '#facc15',
    defaultText: '新年快乐',
    shape: 'lantern',
  },
  {
    key: 'minimal',
    label: '简约',
    ringColors: ['#8b5cf6', '#c4b5fd'],
    decorColor: '#8b5cf6',
    bannerBg: '#8b5cf6',
    bannerText: '#ffffff',
    defaultText: '',
    shape: 'dot',
  },
]

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a1 = (Math.PI / 5) * (2 * i) - Math.PI / 2
    const a2 = (Math.PI / 5) * (2 * i + 1) - Math.PI / 2
    ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r)
    ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function drawSnowflake(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, r * 0.18)
  ctx.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.rotate((Math.PI / 3) * i)
    ctx.beginPath()
    ctx.moveTo(-r, 0)
    ctx.lineTo(r, 0)
    ctx.moveTo(r * 0.5, -r * 0.35)
    ctx.lineTo(r, 0)
    ctx.lineTo(r * 0.5, r * 0.35)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}

function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.7, r, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = Math.max(1, r * 0.12)
  ctx.beginPath()
  ctx.moveTo(0, -r * 1.15)
  ctx.lineTo(0, r * 1.15)
  ctx.stroke()
  ctx.restore()
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const SHAPE_DRAWERS = { star: drawStar, snowflake: drawSnowflake, lantern: drawLantern, dot: drawDot }

/** photo 已经是加载好的 HTMLImageElement，size 是最终画布边长（正方形） */
export function renderAvatarFrame(
  canvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  theme: AvatarFrameTheme,
  bannerText: string,
): void {
  const size = 800
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2 - 20
  const photoRadius = size * 0.36

  // 照片按 cover 规则裁剪填满圆形区域，不拉伸变形
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, photoRadius, 0, Math.PI * 2)
  ctx.clip()
  const srcRatio = photo.naturalWidth / photo.naturalHeight
  let sx = 0
  let sy = 0
  let sw = photo.naturalWidth
  let sh = photo.naturalHeight
  if (srcRatio > 1) {
    sw = sh
    sx = (photo.naturalWidth - sw) / 2
  } else {
    sh = sw
    sy = (photo.naturalHeight - sh) / 2
  }
  ctx.drawImage(photo, sx, sy, sw, sh, cx - photoRadius, cy - photoRadius, photoRadius * 2, photoRadius * 2)
  ctx.restore()

  // 双色圆环描边——外粗内细，视觉上有层次感，不是单调的一条线
  ctx.beginPath()
  ctx.arc(cx, cy, photoRadius + 14, 0, Math.PI * 2)
  ctx.lineWidth = 14
  ctx.strokeStyle = theme.ringColors[0]
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, photoRadius + 26, 0, Math.PI * 2)
  ctx.lineWidth = 4
  ctx.strokeStyle = theme.ringColors[1]
  ctx.stroke()

  // 环绕装饰图案，用固定种子角度分布（不是真随机，保证每次生成结果一致可复现）
  const decorCount = 16
  const decorRing = photoRadius + 52
  const draw = SHAPE_DRAWERS[theme.shape]
  for (let i = 0; i < decorCount; i++) {
    const angle = (Math.PI * 2 * i) / decorCount
    const dx = cx + Math.cos(angle) * decorRing
    const dy = cy + Math.sin(angle) * decorRing
    const r = 8 + (i % 3) * 3
    draw(ctx, dx, dy, r, theme.decorColor)
  }

  // 底部祝福语横幅
  const text = bannerText.trim()
  if (text) {
    const bannerY = cy + photoRadius + 70
    const bannerH = 56
    const bannerW = Math.min(size - 80, text.length * 42 + 80)
    ctx.fillStyle = theme.bannerBg
    ctx.beginPath()
    const rx = cx - bannerW / 2
    const ry = bannerY - bannerH / 2
    const radius = bannerH / 2
    ctx.moveTo(rx + radius, ry)
    ctx.arcTo(rx + bannerW, ry, rx + bannerW, ry + bannerH, radius)
    ctx.arcTo(rx + bannerW, ry + bannerH, rx, ry + bannerH, radius)
    ctx.arcTo(rx, ry + bannerH, rx, ry, radius)
    ctx.arcTo(rx, ry, rx + bannerW, ry, radius)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = theme.bannerText
    ctx.font = 'bold 30px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cx, bannerY + 2)
  }
}
