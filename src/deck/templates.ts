/**
 * 幻灯片 HTML 模板。每个函数吐一段 <div class="slide">…</div>（1280×720）。
 * 排版用 CSS（flex/grid/真字号/发丝线），渲染后 measure + pptxgenjs 转可编辑 PPTX。
 *
 * 设计原则（参考主流 AI PPT 工具的"去 AI 味"经验）：
 *  - 按内容类型换版式：1 句=引言 / 2~3 条=卡片 / 4~5 条=清单 / 流程=时间轴 / 数据=图表
 *  - 克制配色：主色管结构，强调色只点缀
 *  - 强层级：字号阶梯拉开；充足留白；发丝线分隔而非重框
 *  - 内容页浅底 / 章节页深底，形成节奏
 */

import { ICONS, ICON_HINTS } from './icons'

/** 一个 Tabler 线性图标的内联 SVG（stroke 用当前色，靠外层 color 上主题色） */
function icon(name: string, size = 40): string {
  const inner = ICONS[name] || ICONS['circle-check']
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

/** 给一条要点挑个图标：LLM 指定的优先，否则按关键词猜，再不行按顺序轮 */
function pickIcon(text: string, i: number, hint?: string): string {
  if (hint && ICONS[hint]) return hint
  for (const [re, nm] of ICON_HINTS) if (re.test(text)) return nm
  const rot = ['target', 'bulb', 'circle-check', 'flag-3', 'shield-check', 'chart-bar', 'settings', 'star']
  return rot[i % rot.length]
}

export interface DeckTheme {
  primary: string
  accent: string
  primaryDk: string
  paper: string
  ink: string
  /** 'geo' = 纯几何图形装饰风（白底 + 同心圆弧/圆点圈/环形进度，不用 AI 大图） */
  style?: 'plain' | 'geo'
}

/* ── 几何装饰 SVG（geo 风格用，全篇复用同一套母题）────────────── */
/** 右上角标志性的同心圆弧组 */
function arcCluster(t: DeckTheme, size = 420): string {
  const c = size / 2
  const ring = (r: number, col: string, w: number, dash = '') =>
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`
  const arc = (r: number, col: string, w: number, a0: number, a1: number) => {
    const p = (a: number) => `${c + r * Math.cos((a * Math.PI) / 180)} ${c + r * Math.sin((a * Math.PI) / 180)}`
    const large = a1 - a0 > 180 ? 1 : 0
    return `<path d="M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${ring(c - 8, t.primary + '14', 2)}
    ${arc(c - 8, t.primary, 6, 120, 260)}
    ${ring(c - 46, t.accent + '22', 14)}
    ${arc(c - 84, t.accent, 5, -30, 120)}
    ${ring(c - 120, t.primary + '10', 2, '2 8')}
    <circle cx="${c}" cy="${c}" r="${c - 150}" fill="${t.primary}0c"/>
  </svg>`
}
/** 圆点虚线圈 */
function dotRing(t: DeckTheme, size = 120): string {
  const c = size / 2
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${c - 6}" fill="none" stroke="${t.accent}" stroke-width="4" stroke-dasharray="1 9" stroke-linecap="round"/></svg>`
}
/** 环形进度：pct 0~100 */
function progRing(t: DeckTheme, pct: number, size = 150): string {
  const c = size / 2
  const r = c - 12
  const circ = 2 * Math.PI * r
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${t.primary}18" stroke-width="10"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${t.accent}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${circ}" stroke-dashoffset="${off}" transform="rotate(-90 ${c} ${c})"/>
  </svg>`
}
/** 放射线爆发（从一个角射出的细线） */
function rayBurst(t: DeckTheme, size = 380): string {
  const c = size / 2
  let lines = ''
  for (let a = 0; a < 90; a += 7.5) {
    const rad = (a * Math.PI) / 180
    lines += `<line x1="${c}" y1="${c}" x2="${c + (c - 6) * Math.cos(rad)}" y2="${c + (c - 6) * Math.sin(rad)}" stroke="${t.primary}12" stroke-width="2"/>`
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${lines}<circle cx="${c}" cy="${c}" r="${c - 40}" fill="none" stroke="${t.accent}22" stroke-width="8"/></svg>`
}
/** 六边形轮廓组 */
function hexCluster(t: DeckTheme, size = 300): string {
  const hex = (cx: number, cy: number, r: number, col: string, w: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
    }).join(' ')
    return `<polygon points="${pts}" fill="none" stroke="${col}" stroke-width="${w}"/>`
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${hex(size * 0.6, size * 0.4, size * 0.32, t.primary + '1a', 3)}
    ${hex(size * 0.3, size * 0.62, size * 0.2, t.accent + '33', 3)}
    ${hex(size * 0.72, size * 0.78, size * 0.14, t.primary + '22', 3)}
  </svg>`
}
/** 环形/甜甜圈饼图：segs = [{value, color}] */
function donut(t: DeckTheme, segs: { v: number; c: string }[], size = 180): string {
  const cx = size / 2
  const r = size / 2 - 14
  const total = segs.reduce((s, x) => s + x.v, 0) || 1
  let acc = -90
  const circ = 2 * Math.PI * r
  const arcs = segs
    .map((s) => {
      const frac = s.v / total
      const el = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.c}" stroke-width="22"
        stroke-dasharray="${(frac * circ).toFixed(1)} ${circ}" stroke-dashoffset="${(-((acc + 90) / 360) * circ).toFixed(1)}"
        transform="rotate(-90 ${cx} ${cx})"/>`
      acc += frac * 360
      return el
    })
    .join('')
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${t.primary}12" stroke-width="22"/>${arcs}</svg>`
}
/** 六边形图片框（clip-path 在 CSS，这里只给 wrapper） */
function hexImg(url: string): string {
  return `<div class="hexf"><div class="hexf-b"></div><img src="${esc(url)}" crossorigin="anonymous"></div>`
}
/** 四分之一圆环（角落装饰） */
function quarter(t: DeckTheme, size = 300): string {
  const s = size
  return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    <path d="M ${s} 0 A ${s} ${s} 0 0 1 0 ${s} L 0 ${s - 46} A ${s - 46} ${s - 46} 0 0 0 ${s - 46} 0 Z" fill="${t.primary}10"/>
    <path d="M ${s} ${s * 0.42} A ${s * 0.58} ${s * 0.58} 0 0 1 ${s * 0.42} ${s}" fill="none" stroke="${t.accent}" stroke-width="7" stroke-linecap="round"/>
  </svg>`
}
/** V 形箭头条（流程） */
function chevronStrip(items: string[], t: DeckTheme): string {
  const n = items.length
  return `<div class="chvs">${items
    .map(
      (b, i) =>
        `<div class="chv${i === 0 ? ' first' : ''}${i === n - 1 ? ' last' : ''}" style="background:${
          i % 2 ? t.primaryDk : t.primary
        }"><span class="chn">${pad2(i + 1)}</span><span class="cht">${esc(b)}</span></div>`,
    )
    .join('')}</div>`
}
/** 中心辐射（hub-and-spoke）：中心圆 + 四周条目。坐标用百分比，铺满整个内容区 */
function spokeDiagram(t: DeckTheme, center: string, items: string[]): string {
  const n = Math.min(items.length, 6)
  // viewBox 1000×520，中心 (500,255)，椭圆半径拉大到接近整宽
  const cx = 500
  const cy = 255
  const rx = 372
  const ry = 210
  const nodes = items.slice(0, n).map((b, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2
    return { b: short(b), x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
  const lines = nodes
    .map(
      (nd) =>
        `<line x1="${cx}" y1="${cy}" x2="${nd.x.toFixed(0)}" y2="${nd.y.toFixed(0)}" stroke="${t.primary}3a" stroke-width="2"/>`,
    )
    .join('')
  const dots = nodes
    .map(
      (nd) =>
        `<div class="spn" style="left:${((nd.x / 1000) * 100).toFixed(2)}%;top:${((nd.y / 520) * 100).toFixed(2)}%"><span class="spd"></span><span class="spt">${esc(
          nd.b,
        )}</span></div>`,
    )
    .join('')
  return `<div class="spoke"><svg viewBox="0 0 1000 520" preserveAspectRatio="none">${lines}</svg>
    <div class="spc">${esc(short(center, 10))}</div>${dots}</div>`
}
/** 斜向叠放的方块阶梯（参考模板 #2） */
function stackBlocks(items: string[], t: DeckTheme): string {
  const n = Math.min(items.length, 5)
  return `<div class="stk">${items
    .slice(0, n)
    .map(
      (b, i) =>
        `<div class="stki" style="margin-left:${i * 78}px;background:${i % 2 ? t.primaryDk : t.primary}"><span class="skn">${pad2(
          i + 1,
        )}</span><span class="skt">${esc(b)}</span></div>`,
    )
    .join('')}</div>`
}
/** 横向编号圆点轴，标签上下交替（参考模板 #3） */
function numRail(items: string[], t: DeckTheme): string {
  const n = Math.min(items.length, 6)
  void t
  return `<div class="nrail"><div class="nrl"></div>${items
    .slice(0, n)
    .map(
      (b, i) =>
        `<div class="nr ${i % 2 ? 'dn' : 'up'}"><div class="nrt">${esc(b)}</div><div class="nrc">${pad2(i + 1)}</div></div>`,
    )
    .join('')}</div>`
}
/** 倒三角形图片框（参考模板 #8） */
function triImg(url: string): string {
  return `<div class="trif"><div class="trif-b"></div><img src="${esc(url)}" crossorigin="anonymous"></div>`
}
/** 蜂窝六边形群 + 图标/照片（参考模板 #7）。百分比定位，铺满内容区。
 * 传了 images（≥3 张）时外圈六边形套真实照片+底部说明条，否则套图标+文字。 */
function hexHive(t: DeckTheme, center: string, items: string[], images?: string[]): string {
  const n = Math.min(items.length, 6)
  const pos: [number, number][] = [
    [0, -1.05],
    [0.92, -0.52],
    [0.92, 0.52],
    [0, 1.05],
    [-0.92, 0.52],
    [-0.92, -0.52],
  ]
  // viewBox 1000×480，中心 (500,240)
  const rx = 300
  const ry = 172
  const usePhoto = !!images && images.length >= 3
  const cells = items
    .slice(0, n)
    .map((b, i) => {
      const [dx, dy] = pos[i]
      const left = (((500 + dx * rx) / 1000) * 100).toFixed(2)
      const top = (((240 + dy * ry) / 480) * 100).toFixed(2)
      if (usePhoto && images![i]) {
        return `<div class="hvc hvc-ph" style="left:${left}%;top:${top}%"><img src="${esc(
          images![i],
        )}" crossorigin="anonymous"><span class="hvcap">${esc(short(b, 16))}</span></div>`
      }
      return `<div class="hvc" style="left:${left}%;top:${top}%;background:${
        i % 2 ? t.primary : t.primaryDk
      }"><span class="hvi">${icon(pickIcon(b, i), 24)}</span><span class="hvt">${esc(short(b, 14))}</span></div>`
    })
    .join('')
  return `<div class="hive"><div class="hvc mid">${esc(short(center, 10))}</div>${cells}</div>`
}
/** 树状图：主干 + 分支线 + 圆形节点（叶子），适合"发展方向/分支要点" */
function treeDiagram(t: DeckTheme, items: string[]): string {
  const n = Math.min(Math.max(items.length, 2), 6)
  const VBW = 1000
  const VBH = 520
  const forkX = 500
  const forkY = 300
  const baseY = 480
  const spread = 740
  const nodes = items.slice(0, n).map((b, i) => {
    const t0 = n === 1 ? 0.5 : i / (n - 1)
    const x = forkX - spread / 2 + t0 * spread
    const y = 150 + Math.abs(t0 - 0.5) * 2 * 60
    return { b: short(b, 14), x, y }
  })
  const branches = nodes
    .map(
      (nd) =>
        `<path d="M ${forkX} ${forkY} Q ${((forkX + nd.x) / 2).toFixed(0)} ${((forkY + nd.y) / 2 + 30).toFixed(
          0,
        )} ${nd.x.toFixed(0)} ${(nd.y + 36).toFixed(0)}" fill="none" stroke="${t.primary}40" stroke-width="3"/>`,
    )
    .join('')
  const trunk = `<path d="M ${forkX} ${baseY} L ${forkX} ${forkY}" stroke="${t.primaryDk}" stroke-width="10" stroke-linecap="round"/>`
  const nodesHtml = nodes
    .map(
      (nd, i) =>
        `<div class="trn" style="left:${((nd.x / VBW) * 100).toFixed(2)}%;top:${((nd.y / VBH) * 100).toFixed(
          2,
        )}%;background:${i % 2 ? t.accent : t.primary}"><span>${icon(pickIcon(nd.b, i), 24)}</span></div>
        <div class="trnl" style="left:${((nd.x / VBW) * 100).toFixed(2)}%;top:${(
          ((nd.y + 62) / VBH) *
          100
        ).toFixed(2)}%">${esc(nd.b)}</div>`,
    )
    .join('')
  return `<div class="tree"><svg viewBox="0 0 ${VBW} ${VBH}" preserveAspectRatio="none">${trunk}${branches}</svg>${nodesHtml}</div>`
}
/** 菱形宫格：旋转 45° 的方块图标 + 文字，3~4 项 */
function diamondGrid(t: DeckTheme, items: string[]): string {
  const n = Math.min(Math.max(items.length, 3), 4)
  const cells = items
    .slice(0, n)
    .map(
      (b, i) =>
        `<div class="dmc"><div class="dmd" style="background:${i % 2 ? t.accent : t.primary}"><span class="dmi">${icon(
          pickIcon(b, i),
          26,
        )}</span></div><div class="dmt">${esc(short(b, 12))}</div></div>`,
    )
    .join('')
  return `<div class="dmg n${n}">${cells}</div>`
}
/** 灯泡放射内容：中心灯泡 + 环绕图标要点，跟 spoke 结构类似但视觉是不同的签名动作 */
function bulbSpoke(t: DeckTheme, items: string[]): string {
  const n = Math.min(items.length, 6)
  const cx = 500
  const cy = 255
  const rx = 372
  const ry = 195
  const nodes = items.slice(0, n).map((b, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2
    return { b: short(b, 16), x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
  const lines = nodes
    .map(
      (nd) =>
        `<line x1="${cx}" y1="${cy}" x2="${nd.x.toFixed(0)}" y2="${nd.y.toFixed(0)}" stroke="${t.accent}44" stroke-width="2" stroke-dasharray="2 7"/>`,
    )
    .join('')
  const dots = nodes
    .map(
      (nd, i) =>
        `<div class="bln" style="left:${((nd.x / 1000) * 100).toFixed(2)}%;top:${((nd.y / 510) * 100).toFixed(
          2,
        )}%"><span class="blni">${icon(pickIcon(nd.b, i), 24)}</span><span class="blnt">${esc(nd.b)}</span></div>`,
    )
    .join('')
  return `<div class="bulbsp"><svg viewBox="0 0 1000 510" preserveAspectRatio="none">${lines}</svg>
    <div class="blc">${icon('bulb', 50)}</div>${dots}</div>`
}
/** 弧形箭头循环（参考模板 #9）。圆形保持等比，居中，标签在四周 */
function arrowRing(t: DeckTheme, center: string, items: string[]): string {
  const n = Math.min(Math.max(items.length, 3), 5)
  const VB = 900
  const cx = VB / 2
  const cy = VB / 2
  const R = 250
  const seg = 360 / n
  const g = 18
  const pt = (a: number, r = R) =>
    `${(cx + r * Math.cos((a * Math.PI) / 180)).toFixed(1)} ${(cy + r * Math.sin((a * Math.PI) / 180)).toFixed(1)}`
  let arcs = ''
  let nodes = ''
  for (let i = 0; i < n; i++) {
    const a0 = -90 + i * seg + g / 2
    const a1 = -90 + (i + 1) * seg - g / 2
    const large = a1 - a0 > 180 ? 1 : 0
    const col = i % 2 ? t.primary : t.accent
    arcs += `<path d="M ${pt(a0)} A ${R} ${R} 0 ${large} 1 ${pt(a1)}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round"/>`
    const rad = (a1 * Math.PI) / 180
    const bx = cx + R * Math.cos(rad)
    const by = cy + R * Math.sin(rad)
    const td = rad + Math.PI / 2
    const s = 18
    arcs += `<polygon points="${(bx + s * Math.cos(td)).toFixed(1)},${(by + s * Math.sin(td)).toFixed(1)} ${(
      bx -
      s * Math.cos(td) +
      s * 1.15 * Math.cos(rad)
    ).toFixed(1)},${(by - s * Math.sin(td) + s * 1.15 * Math.sin(rad)).toFixed(1)} ${(bx - s * Math.cos(td) - s * 1.15 * Math.cos(rad)).toFixed(
      1,
    )},${(by - s * Math.sin(td) - s * 1.15 * Math.sin(rad)).toFixed(1)}" fill="${col}"/>`
    const am = (a0 + a1) / 2
    nodes += `<div class="arn" style="left:${(((cx + (R + 78) * Math.cos((am * Math.PI) / 180)) / VB) * 100).toFixed(
      2,
    )}%;top:${(((cy + (R + 78) * Math.sin((am * Math.PI) / 180)) / VB) * 100).toFixed(2)}%"><span class="arnn">${pad2(
      i + 1,
    )}</span><span class="arnt">${esc(items[i] || '')}</span></div>`
  }
  return `<div class="aring"><svg viewBox="0 0 ${VB} ${VB}">${arcs}</svg><div class="arc-c">${esc(center)}</div>${nodes}</div>`
}
/** 占比象形图：两段百分比 + 小人图标条（参考模板 #4） */
function pictoSplit(t: DeckTheme, rows: { label: string; value: number }[]): string {
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0) || 1
  const segs = [
    { v: Number(rows[0].value) || 1, c: t.primary },
    { v: Number(rows[1].value) || 1, c: t.accent },
  ]
  const p0 = Math.round(((Number(rows[0].value) || 0) / total) * 100)
  const legend = rows
    .slice(0, 2)
    .map((r, i) => {
      const pct = Math.round(((Number(r.value) || 0) / total) * 100)
      const filled = Math.max(1, Math.round(pct / 10))
      const ppl = Array.from({ length: 10 }, (_, k) => `<span class="pcp${k < filled ? ' on' : ''}">${icon('user', 16)}</span>`).join('')
      return `<div class="pcr"><div class="pch"><span class="pcd" style="background:${i ? t.accent : t.primary}"></span>${esc(
        r.label,
      )} · <b>${pct}%</b></div><div class="pcpr">${ppl}</div></div>`
    })
    .join('')
  return `<div class="picto"><div class="pcpie">${donut(t, segs, 320)}<div class="pcv">${p0}%</div></div><div class="pcrs">${legend}</div></div>`
}
/** 小几何母题：齿轮 / 灯泡 / 花瓣（参考模板 #5 #11 #6，只做角落淡装饰不做主图） */
function motif(t: DeckTheme, kind: 'gear' | 'bulb' | 'petal', size = 240): string {
  const c = size / 2
  if (kind === 'gear') {
    const teeth = Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30 * Math.PI) / 180
      const r0 = c - 30
      const r1 = c - 8
      return `<line x1="${(c + r0 * Math.cos(a)).toFixed(1)}" y1="${(c + r0 * Math.sin(a)).toFixed(1)}" x2="${(
        c +
        r1 * Math.cos(a)
      ).toFixed(1)}" y2="${(c + r1 * Math.sin(a)).toFixed(1)}" stroke="${t.primary}12" stroke-width="10" stroke-linecap="round"/>`
    }).join('')
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${teeth}<circle cx="${c}" cy="${c}" r="${
      c - 40
    }" fill="none" stroke="${t.primary}12" stroke-width="10"/><circle cx="${c}" cy="${c}" r="${c - 70}" fill="none" stroke="${
      t.accent
    }1f" stroke-width="6"/></svg>`
  }
  if (kind === 'bulb') {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${c}" cy="${c - 16}" r="${
      c - 46
    }" fill="none" stroke="${t.primary}12" stroke-width="10"/><rect x="${c - 22}" y="${size - 74}" width="44" height="30" rx="6" fill="none" stroke="${
      t.primary
    }12" stroke-width="10"/><path d="M ${c} ${size - 40} v 16" stroke="${t.accent}22" stroke-width="8" stroke-linecap="round"/></svg>`
  }
  const petals = Array.from({ length: 8 }, (_, i) => {
    const a = i * 45
    return `<ellipse cx="${c}" cy="${c - c * 0.42}" rx="${c * 0.16}" ry="${c * 0.4}" fill="${
      i % 2 ? t.accent + '14' : t.primary + '12'
    }" transform="rotate(${a} ${c} ${c})"/>`
  }).join('')
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${petals}<circle cx="${c}" cy="${c}" r="${
    c * 0.16
  }" fill="${t.accent}22"/></svg>`
}

export interface DeckCompare {
  left: { heading: string; points: string[] }
  right: { heading: string; points: string[] }
}
export interface DeckSwot {
  s: string[]
  w: string[]
  o: string[]
  t: string[]
}
export interface DeckBigNumber {
  value: string
  label?: string
  note?: string
}
export interface DeckMatrix {
  xLabel?: string
  yLabel?: string
  cells: { title: string; items: string[] }[]
}
export type DeckLayout =
  | 'cards'
  | 'list'
  | 'quote'
  | 'timeline'
  | 'big_number'
  | 'stats'
  | 'bar'
  | 'compare'
  | 'matrix'
  | 'swot'
  | 'image_text'
  | 'rings'
  | 'spoke'
  | 'hive'
  | 'cycle'
  | 'gallery'
  | 'tree'
  | 'diamond'
  | 'bulb'
export interface DeckSlideIn {
  /** LLM 判断的版式类型；缺失时按内容推断 */
  layout?: DeckLayout | string
  title?: string
  en?: string
  intro?: string
  bullets?: string[]
  data?: { kind: 'bar' | 'stat' | 'ring'; items: { label: string; value: string | number }[] }
  /** 对比页：左右两栏各一个观点组 */
  compare?: DeckCompare
  /** SWOT 四象限 */
  swot?: DeckSwot
  /** 单个核心大数字 */
  big_number?: DeckBigNumber
  /** 通用四象限 */
  matrix?: DeckMatrix
  /** 每条要点对应的图标语义名（可选，LLM 给；缺了按关键词自动挑） */
  icons?: string[]
  /** 真实照片 URL（用户上传 / AI 生成）——有则这一页排成「图文分栏」，几何风套图框 */
  image?: string
  /** 一组照片 URL（正好 2~3 张）——gallery 版式：几何图框照片墙 */
  images?: string[]
}
export interface DeckSection {
  heading: string
  en?: string
  slides: DeckSlideIn[]
}
export interface DeckOutline {
  title: string
  subtitle?: string
  theme: DeckTheme
  sections: DeckSection[]
  /** AI 生成的整页背景（可选） */
  bg?: { cover?: string; content?: string; section?: string } | null
  /** 用户上传的照片里选一张当封面主图（可选） */
  coverImage?: string
  /** 封面亮点规格条（产品/方案发布类）：3~4 个 */
  coverFeatures?: { value: string; label: string; en?: string }[]
  /** 参考图归类出来的排版倾向（只影响装饰母题轮换和疏密，版面尺寸位置仍全部本引擎算） */
  style_hint?: { density?: 'airy' | 'balanced' | 'packed' | string; motif?: string }
}

const esc = (s = '') =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** 中文办公稿正文段落：首行空两格（用全角空格，导出到 PPT 也保留） */
const para = (s = '') => '　　' + esc(s.replace(/^[　\s]+/, ''))

/** 节点类版式（spoke/hive/tree/diamond/bulb）的标签是贴在图形节点上的短标签，不是段落。
 * LLM 有时不听话给成整句，字数一长就会在固定宽度的盒子里裹很多行、撑破/压住图标——
 * 防御性截断，不指望提示词管住模型。 */
const short = (s: string, n = 16) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

const pad2 = (n: number) => String(n).padStart(2, '0')

function css(t: DeckTheme): string {
  return `
  .slide{--m:96px;width:1280px;height:720px;position:relative;overflow:hidden;background:${t.paper};
    font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;color:${t.ink};box-sizing:border-box}
  .slide *{box-sizing:border-box;margin:0;padding:0}
  .bg{position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;z-index:0}
  .z{position:relative;z-index:1;height:100%;display:flex;flex-direction:column}
  .tick{width:52px;height:3px;background:${t.accent};flex:none}
  .en{font-size:12px;letter-spacing:3px;color:#a9adb6;font-weight:700}

  /* 封面 */
  .s-cover{background:#f4f5f7}
  .s-cover .side{position:absolute;left:0;top:0;width:16px;height:100%;background:${t.primary};z-index:3}
  .s-cover .side::after{content:"";position:absolute;left:0;top:0;width:16px;height:150px;background:${t.accent}}
  /* 角落造型装饰（代码画，无 AI 背景时用）—— 一律控制在画面内，不出血 */
  .s-cover .cn1{position:absolute;right:0;top:0;width:340px;height:300px;background:${t.primary};z-index:0}
  .s-cover .cn2{position:absolute;right:0;top:0;width:132px;height:132px;background:${t.accent};z-index:1}
  .s-cover .cn3{position:absolute;right:340px;top:0;width:52px;height:200px;background:${t.primaryDk};z-index:0}
  .s-cover .br1{position:absolute;right:90px;bottom:84px;width:132px;height:7px;background:${t.primary};z-index:1}
  .s-cover .br2{position:absolute;right:90px;bottom:84px;width:7px;height:132px;background:${t.primary};z-index:1}
  .s-cover .panel{position:absolute;left:110px;top:196px;width:720px;z-index:2}
  .s-cover .kbar{width:64px;height:8px;background:${t.accent};margin-bottom:22px}
  .s-cover .kick{font-size:13px;letter-spacing:5px;color:${t.accent};font-weight:800}
  .s-cover h1{font-size:56px;line-height:1.16;color:${t.primaryDk};font-weight:800;margin:12px 0 20px}
  .s-cover .tick{width:96px;height:6px;background:${t.accent}}
  .s-cover .sub{font-size:20px;color:#6f7378;margin-top:20px;line-height:1.5}
  .s-cover .suben{font-size:12px;letter-spacing:3px;color:#9aa4b2;font-weight:700;margin-top:8px}
  .s-cover .meta{margin-top:40px;font-size:13px;color:#9a9a9a;line-height:2.1}
  /* 封面亮点规格条 */
  .s-cover .feats{display:flex;margin-top:34px}
  .s-cover .feat{padding-right:22px;margin-right:22px;border-right:1px solid rgba(120,130,150,.28)}
  .s-cover .feat:last-child{border-right:0;margin-right:0}
  .s-cover .feat .fv{font-size:19px;font-weight:800;color:${t.accent};display:flex;align-items:center;gap:6px}
  .s-cover .feat .fv .ico{width:18px;height:18px}
  .s-cover .feat .fl{font-size:12px;color:${t.primaryDk};margin-top:5px;font-weight:600}
  .s-cover .feat .fe{font-size:9px;letter-spacing:1px;color:#9aa4b2;margin-top:2px}

  /* 封面：有 AI 整图时——白字直接压在图左侧的干净区，梯度蒙层兜底 */
  .s-cover.on-bg{background:${t.primaryDk}}
  .s-cover.on-bg .scrim{position:absolute;left:0;top:0;width:56%;height:100%;background:linear-gradient(90deg,rgba(8,16,34,.86) 46%,rgba(8,16,34,0));z-index:1}
  .s-cover.on-bg .panel{left:96px;width:600px}
  .s-cover.on-bg .kick{color:#c7d4ec}
  .s-cover.on-bg h1{color:#fff}
  .s-cover.on-bg .sub{color:rgba(255,255,255,.74)}
  .s-cover.on-bg .suben{color:rgba(255,255,255,.4)}
  .s-cover.on-bg .meta{color:rgba(255,255,255,.5)}
  .s-cover.on-bg .feat{border-color:rgba(255,255,255,.22)}
  .s-cover.on-bg .feat .fl{color:rgba(255,255,255,.85)}
  .s-cover.on-bg .feat .fe{color:rgba(255,255,255,.4)}

  /* 封面带用户照片：右 46% 放图，左侧留白放标题 */
  .s-cover.has-pic .cpic{position:absolute;right:0;top:0;width:46%;height:100%;object-fit:cover;z-index:1}
  .s-cover.has-pic .cn1,.s-cover.has-pic .cn2,.s-cover.has-pic .cn3,.s-cover.has-pic .ring{display:none}

  /* 图文分栏内容页 */
  .imgrow{flex:1;display:flex;gap:54px;margin-top:24px;margin-bottom:12px;align-items:stretch}
  .imgrow.rev{flex-direction:row-reverse}
  .imgrow .pic{position:relative;width:50%;flex:none}
  .imgrow .pic .fr{position:absolute;left:16px;top:16px;width:100%;height:calc(100% - 4px);background:${t.accent};z-index:0}
  .imgrow.rev .pic .fr{left:auto;right:16px}
  .imgrow .pic img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover;display:block;background:#eef0f3}
  .imgrow .txt{flex:1;display:flex;flex-direction:column;justify-content:center;gap:18px;padding:8px 0}
  .imgrow .lead{font-size:16px;line-height:1.64;color:#7d7d7d;padding-left:16px;border-left:3px solid ${t.accent}}
  .imgrow .li{font-size:17px;line-height:1.62;padding-left:22px;position:relative;font-weight:500}
  .imgrow .li::before{content:"";position:absolute;left:0;top:10px;width:9px;height:9px;border-radius:50%;background:${t.accent}}

  /* 目录 */
  .s-toc{padding:76px 116px}
  .s-toc h2{font-size:38px;color:${t.primary};font-weight:800}
  .s-toc .en{margin:10px 0 4px;color:${t.accent}}
  .s-toc .grid{margin-top:52px;display:grid;grid-template-columns:1fr;gap:6px}
  .s-toc .grid.two{grid-template-columns:1fr 1fr;column-gap:56px}
  .s-toc .it{display:flex;align-items:center;gap:18px;padding:15px 0;border-bottom:1px solid #e4e7ec}
  .s-toc .tocic{width:40px;height:40px;flex:none;border-radius:11px;background:${t.primary}10;color:${t.primary};display:flex;align-items:center;justify-content:center}
  .s-toc .no{font-size:24px;font-weight:800;color:${t.primary};opacity:.34;min-width:36px}
  .s-toc .h{font-size:18px;font-weight:700}

  /* 章节过渡 */
  .s-sec{background:${t.primaryDk};color:#fff}
  .s-sec .sbar{position:absolute;left:0;top:0;width:14px;height:100%;background:${t.accent};z-index:3}
  .s-sec .blk{position:absolute;right:0;top:0;width:44%;height:100%;background:rgba(255,255,255,.05);z-index:0}
  /* 有 AI 整图时，左侧压一层深色让白字压得住 */
  .s-sec .scrim{position:absolute;left:0;top:0;width:60%;height:100%;background:rgba(10,13,18,.44);z-index:1}
  .s-sec .big{position:absolute;right:36px;top:96px;font-size:330px;font-weight:800;color:rgba(255,255,255,.08);line-height:.72;z-index:1;font-family:"Arial Black","Arial",sans-serif}
  .s-sec .box{position:absolute;left:120px;top:256px;width:660px;z-index:2}
  .s-sec .part{font-size:15px;letter-spacing:6px;color:${t.accent};font-weight:800}
  .s-sec .pnx{font-size:13px;letter-spacing:3px;font-weight:700;color:rgba(255,255,255,.42);margin-top:8px}
  .s-sec h2{font-size:48px;font-weight:800;margin:14px 0 22px;line-height:1.22}
  .s-sec .rule{width:520px;height:1px;background:rgba(255,255,255,.22)}
  .s-sec .en{margin-top:18px;color:rgba(255,255,255,.4);letter-spacing:2px;font-size:12px;font-weight:700}

  /* 内容页骨架。.body 是加在 .slide 上的修饰类（同一个元素），只管内边距和弹性布局，
     绝对不要设 height / position —— .slide 已经是显式 720px；早先写过 height:100%，
     导出隐藏舞台没有父级高度时会塌成内容高度，整页排版全乱（踩过） */
  .body{padding:54px 96px;display:flex;flex-direction:column}
  .head{text-align:center}
  .head h2{font-size:28px;color:${t.primary};font-weight:800;letter-spacing:.5px}
  .head .fl{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:10px}
  .head .fl::before,.head .fl::after{content:"";width:30px;height:3px;background:${t.accent}}
  .head .en{margin-top:8px}
  /* 导语按中文办公稿：左对齐、首行空两格（缩进写在文本里，导出到 PPT 也保留） */
  .intro{text-align:left;color:#7f7f7f;font-size:15px;line-height:1.72;margin:20px 0 0}
  /* 内容页统一的淡雅底纹（代码画，全篇一致；无 AI 内容底图时用） */
  .cbg{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  .cbg i{position:absolute;display:block}
  .cbg .a{right:-100px;top:-100px;width:260px;height:260px;border-radius:50%;background:${t.primary}0a}
  .cbg .b{right:56px;top:52px;width:64px;height:64px;border-radius:50%;background:${t.accent}12}
  .cbg .c{left:52px;bottom:44px;width:52px;height:5px;background:${t.accent}88}
  .cbg .d{left:52px;bottom:44px;width:5px;height:52px;background:${t.accent}88}
  /* AI 正文底图上压一层白：中间条带（放文字）压得实，上下边缘留通透让科技底纹透出来 */
  .cwash{position:absolute;inset:0;z-index:0;background:linear-gradient(180deg,
    rgba(255,255,255,.44) 0%,rgba(255,255,255,.85) 13%,rgba(255,255,255,.86) 62%,rgba(255,255,255,.62) 84%,rgba(255,255,255,.3) 100%)}
  /* 每张内容页固定的科技角标（不管有没有 AI 底图都画，全篇一致的科技母题） */
  .ctech{position:absolute;inset:0;z-index:0;pointer-events:none}
  .ctech i{position:absolute;display:block;background:${t.accent}}
  .ctech .t1{right:64px;top:58px;width:44px;height:3px}
  .ctech .t2{right:64px;top:67px;width:24px;height:3px;opacity:.55}
  .ctech .b1{left:64px;bottom:58px;width:3px;height:44px}
  .ctech .b2{left:64px;bottom:58px;width:44px;height:3px}
  .ctech .dot{right:64px;top:82px;width:56px;height:4px;background:repeating-linear-gradient(90deg,${t.primary}66 0 4px,transparent 4px 12px)}
  .body>.z,.s-toc>.z{position:relative;z-index:1}

  .ico{display:block}

  /* 卡片（2~3 条） */
  .cards{display:grid;gap:28px;flex:1;margin-top:36px;align-content:center}
  .card{border:1px solid #e4e7ec;border-radius:16px;padding:30px 28px;display:flex;flex-direction:column;align-items:flex-start;gap:16px;background:#fff}
  .card .ic{width:60px;height:60px;flex:none;border-radius:15px;background:${t.primary}12;color:${t.primary};display:flex;align-items:center;justify-content:center}
  .card .num{font-size:12px;letter-spacing:2px;font-weight:800;color:${t.accent}}
  .card .ct{font-size:16px;line-height:1.64;text-align:left;align-self:stretch;color:${t.ink}}

  /* 清单（4~5 条） */
  .list{flex:1;margin-top:30px;display:flex;flex-direction:column;justify-content:center;gap:6px}
  .row{display:flex;align-items:center;gap:20px;padding:15px 0;border-bottom:1px solid #ebedf1}
  .row:last-child{border-bottom:0}
  .row .ic{width:44px;height:44px;flex:none;border-radius:12px;background:${t.primary}0f;color:${t.primary};display:flex;align-items:center;justify-content:center}
  .row .n{font-size:12px;font-weight:800;color:${t.accent};letter-spacing:1px;flex:none;width:24px}
  .row .rt{font-size:16px;line-height:1.55;color:${t.ink}}
  /* geo 风清单：整条撑满 + 交替底色 + 粗色左条 + 大号序号 */
  .geo .list{margin-top:24px;gap:14px;justify-content:space-evenly}
  .geo .list .row{border-bottom:0;padding:18px 26px;gap:22px;background:${t.primary}0c;border-left:5px solid ${t.primary};border-radius:0 12px 12px 0}
  .geo .list .row:nth-child(even){background:${t.accent}14;border-left-color:${t.accent}}
  .geo .list .row .n{width:auto;font-size:22px;color:${t.primary};font-family:"Arial","Microsoft YaHei",sans-serif;opacity:.9}
  .geo .list .row:nth-child(even) .n{color:${t.primaryDk}}
  .geo .list .row .ic{background:#fff;box-shadow:0 0 0 1px ${t.primary}22;border-radius:12px}
  .geo .list .row .rt{font-weight:600}

  /* 引言（1 句） */
  .quote{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:20px}
  .quote .q{font-size:60px;color:${t.accent};font-weight:800;line-height:.6}
  .quote .qt{font-size:22px;line-height:1.7;max-width:900px;font-weight:600}

  /* 时间轴（流程/步骤） */
  .steps{flex:1;display:flex;align-items:center;margin-top:30px}
  .steps .track{flex:1;display:flex;align-items:flex-start;position:relative}
  .steps .track::before{content:"";position:absolute;left:6%;right:6%;top:25px;height:2px;background:${t.primary}33}
  .steps .st{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:0 10px}
  .steps .dot{width:52px;height:52px;border-radius:50%;background:${t.primary};color:#fff;display:flex;align-items:center;justify-content:center;position:relative;z-index:1}
  .steps .sn{font-size:11px;letter-spacing:1px;font-weight:800;color:${t.accent}}
  .steps .sl{font-size:14px;line-height:1.5;color:${t.ink}}

  /* KPI 大数字 */
  .kpi{flex:1;display:flex;align-items:center;justify-content:space-around;margin-top:20px}
  .kpi .it{text-align:center;flex:1}
  .kpi .it + .it{border-left:1px solid #e4e7ec}
  .kpi .v{font-size:58px;font-weight:800;color:${t.primary};line-height:1}
  .kpi .bd{width:30px;height:3px;background:${t.accent};margin:12px auto 8px}
  .kpi .k{font-size:15px;color:#666}

  /* 横向条形图 */
  .bars{flex:1;margin-top:34px;display:flex;flex-direction:column;justify-content:center;gap:20px}
  .bar{display:flex;align-items:center;gap:18px}
  .bar .bl{width:190px;font-size:15px;text-align:right;flex:none;color:#555}
  .bar .track{flex:1;height:16px;background:#eceff4;border-radius:8px;position:relative}
  .bar .fill{position:absolute;left:0;top:0;height:16px;border-radius:8px}
  .bar .bv{width:64px;font-size:16px;font-weight:800;color:${t.primary};flex:none}

  /* 对比页（两栏） */
  .cmp{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:38px;margin-top:30px;margin-bottom:8px;align-content:stretch;grid-auto-rows:1fr}
  .cmp .col{border:1px solid #e2e5ec;border-radius:14px;padding:32px 30px;display:flex;flex-direction:column;gap:16px}
  .cmp .col.a{border-top:4px solid ${t.primary}}
  .cmp .col.b{border-top:4px solid ${t.accent}}
  .cmp .ch{font-size:19px;font-weight:800}
  .cmp .col.a .ch{color:${t.primary}}
  .cmp .col.b .ch{color:${t.primaryDk}}
  .cmp .cd{width:26px;height:3px;background:${t.accent}}
  .cmp .ci{font-size:15px;line-height:1.6}

  /* SWOT 四象限 */
  .swot{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:20px;margin-top:32px}
  .swot .q{border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:10px;border:1px solid #e6e8ee}
  .swot .q .qh{font-size:16px;font-weight:800;letter-spacing:1px;display:flex;align-items:baseline;gap:10px}
  .swot .q .qh span{font-size:12px;font-weight:700;color:#9aa0ab}
  .swot .q .qi{font-size:13.5px;line-height:1.55}
  .swot .qs{background:${t.primary}12;border-color:${t.primary}44}
  .swot .qs .qh{color:${t.primaryDk}}
  .swot .qw{background:#d9534f10;border-color:#d9534f3a}
  .swot .qw .qh{color:#b5433f}
  .swot .qo{background:${t.accent}18;border-color:${t.accent}55}
  .swot .qo .qh{color:${t.primaryDk}}
  .swot .qt{background:#5b6b8210;border-color:#5b6b823a}
  .swot .qt .qh{color:#47566f}

  /* 单个大数字 */
  .bignum{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px}
  .bignum .bar{width:220px;height:8px;background:${t.accent}}
  .bignum .v{font-size:150px;font-weight:800;color:${t.primary};line-height:1;font-family:"Arial Black","Arial",sans-serif}
  .bignum .lb{font-size:24px;font-weight:800;color:${t.ink}}
  .bignum .nt{font-size:16px;color:#8b8b8b;max-width:760px;line-height:1.6}

  /* 通用四象限 */
  .mtx{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:20px;margin-top:36px;position:relative}
  .mtx .q{border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:9px;border:1px solid #e6e8ee}
  .mtx .q .qh{font-size:16px;font-weight:800}
  .mtx .q .qi{font-size:13.5px;line-height:1.55}
  .mtx .q0{background:${t.primary}12;border-color:${t.primary}40}
  .mtx .q0 .qh{color:${t.primaryDk}}
  .mtx .q1{background:${t.accent}18;border-color:${t.accent}50}
  .mtx .q1 .qh{color:${t.primaryDk}}
  .mtx .q2{background:${t.primaryDk}10;border-color:${t.primaryDk}33}
  .mtx .q2 .qh{color:${t.primaryDk}}
  .mtx .q3{background:#5b6b8210;border-color:#5b6b8236}
  .mtx .q3 .qh{color:#47566f}
  .mtx .xl{position:absolute;left:0;right:0;top:-24px;text-align:center;font-size:12px;letter-spacing:2px;font-weight:700;color:#9aa0ab}
  .mtx .yl{position:absolute;left:-30px;top:50%;transform:translateY(-50%) rotate(-90deg);font-size:12px;letter-spacing:2px;font-weight:700;color:#9aa0ab;white-space:nowrap}

  /* 结尾 */
  .closing{background:#f4f5f7;display:flex;align-items:center;justify-content:center;text-align:center}
  .closing .cn{position:absolute;left:0;top:0;width:230px;height:230px;background:${t.primary};z-index:0}
  .closing .cn.b{left:auto;right:0;top:auto;bottom:0}
  .closing .cn.s{width:96px;height:96px;background:${t.accent};z-index:1}
  .closing .inner{position:relative;z-index:2;width:780px;display:flex;flex-direction:column;align-items:center;gap:18px}
  .closing .ty{font-size:13px;letter-spacing:6px;color:${t.accent};font-weight:800}
  .closing h1{font-size:58px;font-weight:800;color:${t.primary}}
  .closing .tick{width:96px;height:6px;background:${t.accent}}
  .closing .sub{font-size:17px;color:#8a8a8a;line-height:1.5}

  /* ══ 几何风（style:geo）——白底 + 同心圆弧/圆点圈/环形进度 ══ */
  .geo-d{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  .geo-d .gbar{position:absolute;left:0;top:0;width:8px;height:100%;background:${t.primary}}
  .geo-d .gbar::after{content:"";position:absolute;left:0;top:0;width:8px;height:140px;background:${t.accent}}
  /* 每页轮换的大装饰元素（往画面里多探一点，别只露一角） */
  .geo-d .v0{position:absolute;right:-90px;top:-90px}
  .geo-d .v1{position:absolute;right:-90px;bottom:-100px}
  .geo-d .v2{position:absolute;right:-50px;top:-50px}
  .geo-d .v3{position:absolute;right:80px;top:-90px}
  .geo-d .v4{position:absolute;right:-20px;bottom:-20px}
  .geo-d .v5{position:absolute;left:-90px;top:-90px}
  .geo-d .dr{position:absolute;left:-40px;bottom:-40px;opacity:.6}
  /* 右下角锚一块，压住空白 */
  .geo-d .cnr{position:absolute;right:0;bottom:0;width:180px;height:64px;background:${t.primary};clip-path:polygon(38px 0,100% 0,100% 100%,0 100%)}
  .geo-d .cnr::after{content:"";position:absolute;left:-14px;bottom:0;width:14px;height:64px;background:${t.accent}}

  /* geo 页眉：左对齐大标题 + 深蓝药丸小标 + 下划线 + 通栏细线，有分量 */
  .ghead{margin-bottom:12px;position:relative}
  .ghead .gpill{display:inline-block;background:${t.primary};color:#fff;font-size:12px;letter-spacing:2px;font-weight:800;padding:6px 16px;border-radius:3px}
  .ghead h2{font-size:34px;color:${t.primaryDk};font-weight:800;margin:16px 0 0;line-height:1.2}
  .ghead .gul{position:relative;width:74px;height:5px;background:${t.accent};margin-top:14px}
  .ghead .gul::after{content:"";position:absolute;left:88px;top:1px;width:360px;height:3px;background:${t.primary}1a}

  /* V 形箭头流程条：撑高成粗条，不是细带 */
  .chvs{flex:1;display:flex;align-items:stretch;margin-top:22px;margin-bottom:10px;gap:0;max-height:430px}
  .chv{flex:1;min-width:0;color:#fff;padding:28px 22px 28px 46px;position:relative;clip-path:polygon(0 0,calc(100% - 28px) 0,100% 50%,calc(100% - 28px) 100%,0 100%,28px 50%);margin-left:-22px;display:flex;flex-direction:column;justify-content:center;gap:12px}
  .chv.first{clip-path:polygon(0 0,calc(100% - 28px) 0,100% 50%,calc(100% - 28px) 100%,0 100%);margin-left:0;padding-left:30px}
  .chv .chn{font-size:14px;font-weight:800;color:${t.accent};letter-spacing:1px}
  .chv .cht{font-size:15.5px;line-height:1.5}

  /* 中心辐射图 */
  .spoke{flex:1;position:relative;margin-top:14px;align-self:stretch;width:100%}
  .spoke svg{position:absolute;inset:0;width:100%;height:100%}
  .spoke .spc{position:absolute;left:50%;top:49%;transform:translate(-50%,-50%);width:150px;height:150px;border-radius:50%;background:${t.primary};color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-size:17px;font-weight:800;padding:12px;line-height:1.3;box-shadow:0 0 0 10px ${t.primary}12}
  .spoke .spn{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px;width:172px;text-align:center}
  .spoke .spn .spd{width:16px;height:16px;border-radius:50%;background:${t.accent};box-shadow:0 0 0 6px ${t.accent}22}
  .spoke .spn .spt{display:block;width:100%;font-size:14px;color:${t.ink};line-height:1.45;font-weight:600}

  /* 六边形图片框 */
  .hexf{position:relative;width:340px;flex:none;aspect-ratio:1/1.1}
  .hexf img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);z-index:1}
  .hexf-b{position:absolute;inset:-8px;background:${t.accent};clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);z-index:0}
  .imgrow.hex{align-items:center;gap:60px}
  .imgrow.hex .pic{width:auto;flex:none}

  .g-cover{background:#fff}
  .g-cover .ga{position:absolute;right:-160px;top:-180px}
  .g-cover .gwedge{position:absolute;right:0;bottom:0;width:44%;height:78%;background:${t.primary};clip-path:polygon(28% 0,100% 0,100% 100%,0 100%)}
  .g-cover .gwedge2{position:absolute;right:0;bottom:0;width:44%;height:78%;background:${t.accent};clip-path:polygon(40% 0,52% 0,24% 100%,12% 100%);opacity:.9}
  .g-cover .panel{position:absolute;left:110px;top:196px;width:640px;z-index:2}

  .g-sec{background:${t.primaryDk};color:#fff}
  .g-sec .ga{position:absolute;right:-120px;top:50%;transform:translateY(-50%);opacity:.5}
  .g-sec .gbig{position:absolute;left:96px;top:150px;font-size:300px;font-weight:800;line-height:.8;color:rgba(255,255,255,.09);font-family:"Arial Black","Arial",sans-serif;z-index:1}
  .g-sec .box{position:absolute;left:120px;top:280px;width:640px;z-index:2}
  .g-sec .part{font-size:15px;letter-spacing:6px;color:${t.accent};font-weight:800}
  .g-sec h2{font-size:46px;font-weight:800;margin:14px 0 20px;line-height:1.2}
  .g-sec .rule{width:480px;height:1px;background:rgba(255,255,255,.22)}
  .g-sec .en{margin-top:16px;font-size:12px;letter-spacing:2px;color:rgba(255,255,255,.42);font-weight:700}

  /* 环形进度墙 */
  .rings{flex:1;display:flex;align-items:center;justify-content:space-evenly;margin-top:18px;gap:20px}
  .rings .rw{display:flex;flex-direction:column;align-items:center;text-align:center;position:relative}
  .rings .rw .rc{position:relative;display:flex}
  .rings .rw .rv{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;color:${t.primary};font-family:"Arial","Microsoft YaHei",sans-serif}
  .rings .rw .rl{margin-top:18px;font-size:16px;font-weight:600;color:${t.ink};max-width:220px;line-height:1.45}

  /* geo 风：白底 + 实心导航块卡片（参考模板那种），撑满整页高度 + 大号数字水印 */
  .body.geo,.s-toc.geo{background:#fff}
  /* 参考图排版倾向：饱满 = 边距收紧、正文更近；留白 = 边距放宽 */
  .body.geo.d-packed{padding:44px 80px}
  .body.geo.d-packed .ghead{margin-bottom:2px}
  .body.geo.d-packed .cards,.body.geo.d-packed .list,.body.geo.d-packed .imgrow{margin-top:18px}
  .body.geo.d-airy{padding:66px 116px}
  .body.geo.d-airy .cards,.body.geo.d-airy .list{margin-top:40px}
  .geo .cards{align-content:stretch;grid-auto-rows:1fr;margin-top:26px;gap:24px}
  .geo .cards .card{background:${t.primary};border:0;color:#fff;justify-content:flex-start;gap:18px;padding:34px 28px;position:relative;overflow:hidden}
  .geo .cards .card:nth-child(even){background:${t.primaryDk}}
  .geo .cards .card .ic{width:64px;height:64px;background:rgba(255,255,255,.14);color:#fff}
  .geo .cards .card .num{color:${t.accent};font-size:11px}
  .geo .cards .card .ct{color:rgba(255,255,255,.94);font-size:16px}
  .geo .cards .card .bn{position:absolute;right:16px;bottom:-24px;font-size:118px;line-height:1;font-weight:800;color:rgba(255,255,255,.10);font-family:"Arial","Microsoft YaHei",sans-serif}
  /* geo 风指标页：环形饼图 */
  .donuts{flex:1;display:flex;align-items:center;justify-content:space-evenly;margin-top:16px;gap:20px}
  .donuts .dn{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center}
  .donuts .dn .dc{position:relative;display:flex}
  .donuts .dn .dv{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;color:${t.primary};font-family:"Arial","Microsoft YaHei",sans-serif}
  .donuts .dn .dl{margin-top:16px;font-size:16px;font-weight:600;color:${t.ink};max-width:220px;line-height:1.45}

  /* 斜叠方块阶梯 */
  .stk{flex:1;display:flex;flex-direction:column;justify-content:center;gap:14px;margin-top:20px}
  .stki{width:600px;padding:16px 26px;color:#fff;display:flex;align-items:center;gap:18px;clip-path:polygon(26px 0,100% 0,calc(100% - 26px) 100%,0 100%)}
  .stki .skn{font-size:20px;font-weight:800;color:${t.accent};font-family:"Arial","Microsoft YaHei",sans-serif;flex:none}
  .stki .skt{font-size:15px;line-height:1.45}
  /* 横向编号圆点轴 */
  .nrail{flex:1;position:relative;display:flex;align-items:center;justify-content:space-between;margin:20px 76px 0}
  .nrail .nrl{position:absolute;left:10px;right:10px;top:50%;height:2px;background:${t.primary}26}
  .nrail .nr{position:relative;height:100%;display:flex;align-items:center;flex:none}
  .nrail .nrc{width:46px;height:46px;border-radius:50%;background:${t.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;border:4px solid #fff;box-shadow:0 0 0 1px ${t.primary}30;font-family:"Arial","Microsoft YaHei",sans-serif}
  .nrail .nrt{position:absolute;left:50%;transform:translateX(-50%);width:132px;text-align:center;font-size:13px;color:${t.ink};line-height:1.4}
  .nrail .nr:first-child .nrt{left:-8px;transform:none;text-align:left}
  .nrail .nr:last-child .nrt{left:auto;right:-8px;transform:none;text-align:right}
  .nrail .nr.up .nrt{bottom:calc(50% + 40px)}
  .nrail .nr.dn .nrt{top:calc(50% + 40px)}
  /* 倒三角图片框 */
  .trif{position:relative;width:390px;flex:none;aspect-ratio:1/0.9}
  .trif img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;clip-path:polygon(0 0,100% 0,50% 100%);z-index:1}
  .trif-b{position:absolute;inset:-10px;background:${t.accent};clip-path:polygon(0 0,100% 0,50% 100%);z-index:0}
  .imgrow.tri{align-items:center;gap:56px}
  .imgrow.tri .pic{width:auto;flex:none}
  /* 大图出血照片页 */
  .photobig{flex:1;display:flex;gap:0;margin-top:18px;position:relative}
  .photobig .pbtx{flex:1;display:flex;flex-direction:column;justify-content:center;gap:20px;padding-right:44px}
  .photobig .pbtx .lead{font-size:16px;color:${t.ink};line-height:1.7}
  .photobig .pbi{display:flex;align-items:flex-start;gap:12px;font-size:14px;color:${t.ink};line-height:1.5}
  .photobig .pbi .pbn{flex:none;width:26px;height:26px;border-radius:50%;background:${t.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;font-family:"Arial","Microsoft YaHei",sans-serif}
  .photobig .pbimg{position:absolute;right:-96px;top:-72px;bottom:-72px;width:46%;overflow:hidden}
  .photobig .pbimg img{width:100%;height:100%;object-fit:cover}
  .photobig .pbimg .pbfr{position:absolute;left:0;top:0;bottom:0;width:10px;background:${t.accent}}
  /* 照片墙 */
  .gallery{flex:1;display:flex;align-items:center;justify-content:center;gap:40px;margin-top:14px}
  .gallery .gcell{display:flex;flex-direction:column;align-items:center;gap:18px;width:330px}
  .gallery .gcell .hexf{width:310px}
  .gallery .gcell .gph{width:326px;aspect-ratio:4/3;overflow:hidden;position:relative}
  .gallery .gcell .gph::after{content:"";position:absolute;left:0;bottom:0;width:52px;height:7px;background:${t.accent}}
  .gallery .gcell .gph img{width:100%;height:100%;object-fit:cover}
  .gallery .gcell .gcap{font-size:14.5px;font-weight:600;color:${t.ink};text-align:center;line-height:1.5;max-width:300px}
  /* 蜂窝六边形群 */
  .hive{flex:1;position:relative;align-self:stretch;width:100%;margin-top:8px}
  .hive .hvc{position:absolute;transform:translate(-50%,-50%);width:158px;height:180px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:14px;font-size:13px;font-weight:600;line-height:1.3}
  .hive .hvc .hvt{display:block;width:100%}
  .hive .hvc.mid{left:50%;top:50%;background:${t.accent};font-size:16px;font-weight:800}
  .hive .hvc .hvi{opacity:.92}
  .hive .hvc-ph{padding:0;background:${t.primaryDk}}
  .hive .hvc-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .hive .hvc-ph .hvcap{position:absolute;left:6px;right:6px;bottom:14px;text-align:center;font-size:12px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.7);line-height:1.3}

  /* 树状图 */
  .tree{flex:1;position:relative;align-self:stretch;width:100%;margin-top:6px}
  .tree svg{position:absolute;inset:0;width:100%;height:100%}
  .tree .trn{position:absolute;transform:translate(-50%,-50%);width:62px;height:62px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 7px ${t.primary}12}
  .tree .trnl{position:absolute;transform:translate(-50%,0);width:168px;text-align:center;font-size:14px;font-weight:600;color:${t.ink};line-height:1.4}

  /* 菱形宫格 */
  .dmg{flex:1;display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:28px 70px;margin-top:22px;align-items:center;justify-items:center}
  .dmg.n3{grid-template-columns:repeat(3,1fr);grid-template-rows:1fr}
  .dmc{display:flex;flex-direction:column;align-items:center;gap:18px}
  .dmd{width:114px;height:114px;transform:rotate(45deg);display:flex;align-items:center;justify-content:center;border-radius:18px;box-shadow:0 10px 24px -8px rgba(0,0,0,.25)}
  .dmd .dmi{transform:rotate(-45deg);color:#fff;display:flex}
  .dmt{font-size:15px;font-weight:600;color:${t.ink};text-align:center;max-width:210px;line-height:1.45}

  /* 灯泡放射内容 */
  .bulbsp{flex:1;position:relative;margin-top:12px;align-self:stretch;width:100%}
  .bulbsp svg{position:absolute;inset:0;width:100%;height:100%}
  .bulbsp .blc{position:absolute;left:50%;top:49%;transform:translate(-50%,-50%);width:150px;height:150px;border-radius:50%;background:${t.accent};color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 14px ${t.accent}14,0 0 0 30px ${t.accent}0a}
  .bulbsp .bln{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:10px;width:180px;text-align:center}
  .bulbsp .bln .blni{width:46px;height:46px;flex:none;align-self:center;border-radius:12px;background:${t.primary}12;color:${t.primary};display:flex;align-items:center;justify-content:center}
  .bulbsp .bln .blnt{display:block;width:100%}
  .bulbsp .bln .blnt{font-size:13.5px;color:${t.ink};line-height:1.4;font-weight:600}
  /* 弧形箭头循环 */
  .aring{position:relative;align-self:center;width:512px;height:512px;margin:auto}
  .aring svg{position:absolute;inset:0;width:100%;height:100%}
  .aring .arc-c{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:150px;height:150px;border-radius:50%;background:${t.primaryDk};color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-size:17px;font-weight:800;padding:14px;line-height:1.3}
  .aring .arn{position:absolute;transform:translate(-50%,-50%);width:172px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:5px}
  .aring .arn .arnn{font-size:13px;font-weight:800;color:${t.accent};letter-spacing:1px}
  .aring .arn .arnt{font-size:14px;color:${t.ink};line-height:1.45;font-weight:600}
  /* 占比象形图 */
  .picto{flex:1;display:flex;align-items:center;justify-content:center;gap:76px;margin-top:12px;padding-left:12px}
  .picto .pcpie{position:relative;flex:none;display:flex}
  .picto .pcpie .pcv{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800;color:${t.primary};font-family:"Arial","Microsoft YaHei",sans-serif}
  .picto .pcrs{flex:none;width:420px;display:flex;flex-direction:column;gap:36px}
  .picto .pch{font-size:17px;color:${t.ink};display:flex;align-items:center;gap:8px;margin-bottom:10px}
  .picto .pch b{color:${t.primaryDk};font-size:19px}
  .picto .pcd{width:12px;height:12px;border-radius:3px;flex:none}
  .picto .pcpr{display:flex;gap:5px;color:${t.primary}2e}
  .picto .pcp{display:flex}
  .picto .pcp.on{color:${t.primary}}
  .picto .pcp.on ~ .pcp{color:${t.primary}2e}
  /* 小母题装饰位 */
  .geo-d .v6{position:absolute;right:-60px;bottom:-70px;opacity:.9}
  .geo-d .v7{position:absolute;right:40px;top:-90px;opacity:.9}
  .geo-d .v8{position:absolute;right:-70px;top:-70px;opacity:.9}
  `
}

const bgImg = (url?: string) => (url ? `<img class="bg" src="${esc(url)}" crossorigin="anonymous">` : '')

const isGeo = (o: DeckOutline) => o.theme.style === 'geo'
/** geo 风内容页装饰：左侧色条 + 左下圆点圈 + 每页轮换的大几何元素。
 * motif（参考图归类出来的主装饰形状）只改"轮换池的排序偏好"，具体尺寸/位置全在下面写死。*/
function geoDeco(t: DeckTheme, v = 0, motifKey = ''): string {
  const all = [
    `<div class="v0">${arcCluster(t, 460)}</div>`,
    `<div class="v1">${arcCluster(t, 420)}</div>`,
    `<div class="v2">${rayBurst(t, 400)}</div>`,
    `<div class="v3">${hexCluster(t, 300)}</div>`,
    `<div class="v4">${quarter(t, 300)}</div>`,
    `<div class="v5">${arcCluster(t, 380)}</div>`,
    `<div class="v6">${motif(t, 'gear', 240)}</div>`,
    `<div class="v7">${motif(t, 'bulb', 230)}</div>`,
    `<div class="v8">${motif(t, 'petal', 240)}</div>`,
  ]
  // 按主装饰母题挑一个优先子集轮换；没命中就用全集
  const pools: Record<string, number[]> = {
    hexagon: [3, 4, 6, 0, 2],
    circle: [0, 1, 5, 2, 7],
    arrow: [4, 2, 0, 5, 3],
    wedge: [4, 0, 5, 1, 8],
    line: [2, 1, 0, 5, 4],
  }
  const pool = pools[motifKey] || [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const big = all[pool[((v % pool.length) + pool.length) % pool.length]]
  // 右下角小色块隔页出现（偶数页），压住空白又不喧宾夺主
  const cnr = v % 2 === 0 ? '<div class="cnr"></div>' : ''
  return `<div class="geo-d">${big}<div class="dr">${dotRing(t, 130)}</div><div class="gbar"></div>${cnr}</div>`
}
let _geoIdx = 0

/* ── 页型 ─────────────────────────────────────────────── */
function gCover(o: DeckOutline): string {
  const t = o.theme
  const feats = (o.coverFeatures || []).filter((f) => f && f.value).slice(0, 4)
  const featStrip = feats.length
    ? `<div class="feats">${feats
        .map(
          (f, i) =>
            `<div class="feat"><div class="fv">${icon(pickIcon(f.label + f.value, i), 18)}${esc(f.value)}</div><div class="fl">${esc(f.label)}</div>${f.en ? `<div class="fe">${esc(f.en)}</div>` : ''}</div>`,
        )
        .join('')}</div>`
    : ''
  return `<div class="slide s-cover g-cover">
    <div class="ga">${arcCluster(t, 520)}</div>
    <div class="gwedge"></div><div class="gwedge2"></div>
    <div class="side"></div>
    <div class="panel">
      <div class="kbar"></div>
      <div class="kick">KEYNOTE PRESENTATION</div>
      <h1>${esc(o.title)}</h1><div class="tick"></div>
      ${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ''}
      ${featStrip}
      ${feats.length ? '' : '<div class="meta"><div>汇报单位：____________</div><div>汇报时间：____________</div></div>'}
    </div></div>`
}

function gSection(s: DeckSection, idx: number, total: number, o: DeckOutline): string {
  const t = o.theme
  return `<div class="slide s-sec g-sec">
    <div class="ga">${arcCluster(t, 460)}</div>
    <div class="gbig">${pad2(idx)}</div>
    <div class="box">
      <div class="part">PART ${pad2(idx)} · ${pad2(idx)} / ${pad2(total)}</div>
      <h2>${esc(s.heading)}</h2>
      <div class="rule"></div>
      ${s.en ? `<div class="en">${esc(s.en)}</div>` : ''}
    </div></div>`
}

function ringStats(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const t = o.theme
  const rows = (sl.data?.items || []).filter((r) => r.label).slice(0, 5)
  const rsz = rows.length <= 2 ? 300 : rows.length === 3 ? 240 : 200
  const body = `<div class="rings">${rows
    .map((r) => {
      const num = Math.abs(parseFloat(String(r.value).replace(/[^0-9.\-]/g, '')) || 0)
      return `<div class="rw"><div class="rc">${progRing(t, num, rsz)}<div class="rv">${esc(String(r.value))}</div></div><div class="rl">${esc(r.label)}</div></div>`
    })
    .join('')}</div>`
  return bodySlide(o, `${head(sl, en, o)}${body}`)
}

function cover(o: DeckOutline): string {
  if (isGeo(o)) return gCover(o)
  const b = o.bg?.cover
  const pic = !b && o.coverImage
  const cls = b ? 's-cover on-bg' : pic ? 's-cover has-pic' : 's-cover'
  const deco =
    !b && !pic
      ? `<div class="cn3"></div><div class="cn1"></div><div class="cn2"></div><div class="br1"></div><div class="br2"></div>`
      : ''
  const feats = (o.coverFeatures || []).filter((f) => f && f.value).slice(0, 4)
  const featStrip = feats.length
    ? `<div class="feats">${feats
        .map(
          (f, i) =>
            `<div class="feat"><div class="fv">${icon(pickIcon(f.label + f.value, i), 18)}${esc(f.value)}</div><div class="fl">${esc(f.label)}</div>${f.en ? `<div class="fe">${esc(f.en)}</div>` : ''}</div>`,
        )
        .join('')}</div>`
    : ''
  return `<div class="slide ${cls}">${bgImg(b)}${deco}${b ? '<div class="scrim"></div>' : ''}<div class="side"></div>
    ${pic ? `<img class="cpic" src="${esc(o.coverImage!)}" crossorigin="anonymous">` : ''}
    <div class="panel">
      <div class="kbar"></div>
      <div class="kick">KEYNOTE PRESENTATION</div>
      <h1>${esc(o.title)}</h1><div class="tick"></div>
      ${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ''}
      ${featStrip}
      ${feats.length ? '' : '<div class="meta"><div>汇报单位：____________</div><div>汇报时间：____________</div></div>'}
    </div></div>`
}

function toc(o: DeckOutline): string {
  const rows = o.sections.slice(0, 6)
  const two = rows.length > 4
  const li = rows
    .map(
      (s, i) =>
        `<div class="it"><span class="tocic">${icon(pickIcon(s.heading, i), 22)}</span><span class="no">${pad2(i + 1)}</span><span class="h">${esc(s.heading)}</span></div>`,
    )
    .join('')
  return `<div class="slide s-toc${isGeo(o) ? ' geo' : ''}">${cbg(o)}<div class="z">
    <h2>目录</h2><div class="en">CONTENTS</div><div class="tick"></div>
    <div class="grid ${two ? 'two' : ''}">${li}</div></div></div>`
}

function section(s: DeckSection, idx: number, total: number, o: DeckOutline): string {
  if (isGeo(o)) return gSection(s, idx, total, o)
  const withBg = !!o.bg?.section
  return `<div class="slide s-sec">${bgImg(o.bg?.section)}
    ${withBg ? '<div class="scrim"></div><div class="sbar"></div>' : '<div class="blk"></div><div class="sbar"></div>'}
    <div class="big">${pad2(idx)}</div>
    <div class="box">
      <div class="part">PART ${pad2(idx)}</div>
      <div class="pnx">${pad2(idx)} / ${pad2(total)}</div>
      <h2>${esc(s.heading)}</h2>
      <div class="rule"></div>
      ${s.en ? `<div class="en">${esc(s.en)}</div>` : ''}
    </div></div>`
}

function head(sl: DeckSlideIn, en: string, o?: DeckOutline): string {
  // geo 风：左对齐标题 + 深蓝药丸小标 + 下划线（参考模板那种页眉）
  if (o && isGeo(o)) {
    return `<div class="ghead"><span class="gpill">${esc(sl.en || en)}</span>
      <h2>${esc(sl.title || '')}</h2><div class="gul"></div></div>
      ${sl.intro ? `<div class="intro">${para(sl.intro)}</div>` : ''}`
  }
  return `<div class="head"><h2>${esc(sl.title || '')}</h2><div class="fl"></div>
    <div class="en">${esc(sl.en || en)}</div></div>
    ${sl.intro ? `<div class="intro">${para(sl.intro)}</div>` : ''}`
}

/** 每张内容页固定的科技角标（全篇一致的科技母题，AI 底图上也画） */
const techMark = '<div class="ctech"><i class="t1"></i><i class="t2"></i><i class="dot"></i><i class="b1"></i><i class="b2"></i></div>'

/** 内容页底：geo 风用几何装饰；否则有 AI 底图就铺图+渐变白蒙层，没有就代码淡纹+科技角标 */
const cbg = (o: DeckOutline) =>
  isGeo(o)
    ? geoDeco(o.theme, _geoIdx, o.style_hint?.motif || '')
    : (o.bg?.content
        ? `${bgImg(o.bg.content)}<div class="cwash"></div>`
        : `<div class="cbg"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i></div>`) + techMark
const bodySlide = (o: DeckOutline, inner: string) => {
  const dz = isGeo(o) && o.style_hint?.density === 'packed' ? ' d-packed' : isGeo(o) && o.style_hint?.density === 'airy' ? ' d-airy' : ''
  const html = `<div class="slide body${isGeo(o) ? ' geo' : ''}${dz}">${cbg(o)}<div class="z">${inner}</div></div>`
  if (isGeo(o)) _geoIdx++
  return html
}

const STEP_RE = /流程|步骤|阶段|环节|顺序|先后|第一步|首先/

function content(sl: DeckSlideIn, en: string, o: DeckOutline, imgFlip = false, layout = ''): string {
  const ic = (b: string, i: number, size: number) => icon(pickIcon(b, i, sl.icons?.[i]), size)
  if (sl.image) {
    const lis = (sl.bullets || [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((b) => `<div class="li">${esc(b)}</div>`)
      .join('')
    const geo = isGeo(o)
    // geo 风照片页三种框：六边形 / 倒三角 / 大图出血，按页序轮换。导语放正文列，不走 head
    const hdNoIntro = { ...sl, intro: '' }
    const gv = geo ? _geoIdx % 3 : -1
    if (gv === 2) {
      return bodySlide(
        o,
        `${head(hdNoIntro, en, o)}
        <div class="photobig">
          <div class="pbtx">${sl.intro ? `<div class="lead">${esc(sl.intro)}</div>` : ''}${(sl.bullets || [])
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3)
            .map((b, i) => `<div class="pbi"><span class="pbn">${pad2(i + 1)}</span><span>${esc(b)}</span></div>`)
            .join('')}</div>
          <div class="pbimg"><img src="${esc(sl.image)}" crossorigin="anonymous"><span class="pbfr"></span></div>
        </div>`,
      )
    }
    const picBlock = geo
      ? `<div class="pic">${gv === 1 ? triImg(sl.image) : hexImg(sl.image)}</div>`
      : `<div class="pic"><span class="fr"></span><img src="${esc(sl.image)}" crossorigin="anonymous"></div>`
    if (geo) {
      return bodySlide(
        o,
        `${head(hdNoIntro, en, o)}
        <div class="imgrow${imgFlip ? ' rev' : ''} ${gv === 1 ? 'tri' : 'hex'}">
          ${picBlock}
          <div class="txt">${sl.intro ? `<div class="lead">${esc(sl.intro)}</div>` : ''}${lis}</div>
        </div>`,
      )
    }
    return bodySlide(
      o,
      `<div class="head"><h2>${esc(sl.title || '')}</h2><div class="fl"></div><div class="en">${esc(sl.en || en)}</div></div>
      <div class="imgrow${imgFlip ? ' rev' : ''}">
        ${picBlock}
        <div class="txt">${sl.intro ? `<div class="lead">${esc(sl.intro)}</div>` : ''}${lis}</div>
      </div>`,
    )
  }
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  const n = items.length
  const asSteps = n >= 3 && STEP_RE.test((sl.title || '') + (sl.intro || ''))
  let branch: string
  if (layout === 'quote') branch = 'quote'
  else if (layout === 'timeline' && n >= 2) branch = 'timeline'
  else if (layout === 'list') branch = 'list'
  else if (layout === 'cards') branch = 'cards'
  else if (asSteps) branch = 'timeline'
  else branch = n <= 1 ? 'quote' : n <= 3 ? 'cards' : 'list'

  let body: string
  if (branch === 'timeline' && isGeo(o)) {
    // geo 风流程 → V 形箭头条 / 横向编号轴 交替
    body = _geoIdx % 2 === 1 ? numRail(items, o.theme) : chevronStrip(items, o.theme)
  } else if (branch === 'list' && isGeo(o) && _geoIdx % 2 === 1) {
    // geo 风清单 → 斜叠方块阶梯（隔页换）
    body = stackBlocks(items, o.theme)
  } else if (branch === 'timeline') {
    body = `<div class="steps"><div class="track">${items
      .map(
        (b, i) =>
          `<div class="st"><div class="dot">${ic(b, i, 26)}</div><div class="sn">STEP ${pad2(i + 1)}</div><div class="sl">${esc(b)}</div></div>`,
      )
      .join('')}</div></div>`
  } else if (branch === 'quote') {
    body = `<div class="quote"><div class="q">"</div><div class="qt">${esc(items[0] || '')}</div><div class="tick"></div></div>`
  } else if (branch === 'cards') {
    const cards = items.slice(0, 3)
    const geo = isGeo(o)
    body = `<div class="cards" style="grid-template-columns:repeat(${Math.max(cards.length, 1)},1fr)">${cards
      .map(
        (b, i) =>
          `<div class="card"><div class="ic">${ic(b, i, geo ? 34 : 30)}</div><div class="num">POINT ${pad2(
            i + 1,
          )}</div><div class="ct">${para(b)}</div>${geo ? `<div class="bn">${pad2(i + 1)}</div>` : ''}</div>`,
      )
      .join('')}</div>`
  } else {
    body = `<div class="list">${items
      .map(
        (b, i) =>
          `<div class="row"><div class="ic">${ic(b, i, 22)}</div><span class="n">${pad2(i + 1)}</span><div class="rt">${esc(b)}</div></div>`,
      )
      .join('')}</div>`
  }
  return bodySlide(o, `${head(sl, en, o)}${body}`)
}

function bigNumber(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const b = sl.big_number || { value: '' }
  return bodySlide(
    o,
    `${head(sl, en, o)}
    <div class="bignum">
      <div class="bar"></div>
      <div class="v">${esc(b.value || '—')}</div>
      ${b.label ? `<div class="lb">${esc(b.label)}</div>` : ''}
      ${b.note ? `<div class="nt">${esc(b.note)}</div>` : ''}
    </div>`,
  )
}

function matrix(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const m = sl.matrix || { cells: [] }
  const cells = (m.cells || []).slice(0, 4)
  const q = cells
    .map(
      (c, i) =>
        `<div class="q q${i}"><div class="qh">${esc(c.title || '')}</div>${(c.items || [])
          .slice(0, 4)
          .map((x) => `<div class="qi">· ${esc(x)}</div>`)
          .join('')}</div>`,
    )
    .join('')
  return bodySlide(
    o,
    `${head(sl, en, o)}
    <div class="mtx">${m.xLabel ? `<div class="xl">${esc(m.xLabel)}</div>` : ''}${m.yLabel ? `<div class="yl">${esc(m.yLabel)}</div>` : ''}${q}</div>`,
  )
}

function chart(sl: DeckSlideIn, t: DeckTheme, en: string, o: DeckOutline): string {
  const d = sl.data!
  const rows = d.items.filter((r) => r.label).slice(0, 6)
  let body: string
  const statNums = rows.map((r) => Math.abs(parseFloat(String(r.value).replace(/[^0-9.\-]/g, '')) || 0))
  // 只有当两个数确实互补成一个整体（和≈100）才当"占比"画饼图，否则是两个独立指标
  const isRatioPair =
    d.kind === 'stat' &&
    rows.length === 2 &&
    statNums.every((n) => n > 0 && n < 100) &&
    Math.abs(statNums[0] + statNums[1] - 100) <= 5
  if (isGeo(o) && isRatioPair) {
    // geo 风两项占比 → 饼图 + 小人象形图
    body = pictoSplit(t, [
      { label: rows[0].label, value: statNums[0] },
      { label: rows[1].label, value: statNums[1] },
    ])
  } else if (d.kind === 'stat' && isGeo(o)) {
    // geo 风把关键指标做成环形饼图
    {
      const dsz = rows.length <= 2 ? 330 : rows.length === 3 ? 250 : 210
      body = `<div class="donuts">${rows
        .slice(0, 4)
        .map((r, i) => {
          const n = Math.abs(parseFloat(String(r.value).replace(/[^0-9.\-]/g, '')) || 0)
          const pct = n > 100 ? 100 : n
          return `<div class="dn"><div class="dc">${donut(t, [{ v: pct, c: i % 2 ? t.accent : t.primary }, { v: 100 - pct, c: t.primary + '14' }], dsz)}<div class="dv">${esc(
            String(r.value),
          )}</div></div><div class="dl">${esc(r.label)}</div></div>`
        })
        .join('')}</div>`
    }
  } else if (d.kind === 'stat') {
    body = `<div class="kpi">${rows
      .slice(0, 4)
      .map(
        (r) =>
          `<div class="it"><div class="v">${esc(String(r.value))}</div><div class="bd"></div><div class="k">${esc(r.label)}</div></div>`,
      )
      .join('')}</div>`
  } else {
    const nums = rows.map((r) => Math.abs(parseFloat(String(r.value).replace(/[^0-9.\-]/g, '')) || 0))
    const mx = Math.max(...nums, 1)
    body = `<div class="bars">${rows
      .map((r, i) => {
        const pct = Math.max(4, (nums[i] / mx) * 100)
        return `<div class="bar"><div class="bl">${esc(r.label)}</div>
          <div class="track"><div class="fill" style="width:${pct}%;background:${i % 2 ? t.accent : t.primary}"></div></div>
          <div class="bv">${esc(String(r.value))}</div></div>`
      })
      .join('')}</div>`
  }
  return bodySlide(o, `${head(sl, en, o)}${body}`)
}

function compare(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const c = sl.compare!
  const col = (side: 'a' | 'b', g: { heading: string; points: string[] }) =>
    `<div class="col ${side}"><div class="ch">${esc(g.heading)}</div><div class="cd"></div>${(g.points || [])
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((p) => `<div class="ci">${para(p)}</div>`)
      .join('')}</div>`
  return bodySlide(o, `${head(sl, en, o)}<div class="cmp">${col('a', c.left)}${col('b', c.right)}</div>`)
}

function swot(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const s = sl.swot!
  const quad = (cls: string, label: string, sub: string, items: string[]) =>
    `<div class="q ${cls}"><div class="qh">${label}<span>${sub}</span></div>${(items || [])
      .map((i) => i.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((i) => `<div class="qi">· ${esc(i)}</div>`)
      .join('')}</div>`
  return bodySlide(
    o,
    `${head(sl, en, o)}
    <div class="swot">
      ${quad('qs', '优势', 'STRENGTHS', s.s)}
      ${quad('qw', '劣势', 'WEAKNESSES', s.w)}
      ${quad('qo', '机会', 'OPPORTUNITIES', s.o)}
      ${quad('qt', '威胁', 'THREATS', s.t)}
    </div>`,
  )
}

function closing(o: DeckOutline): string {
  const deco = isGeo(o)
    ? `<div class="ga" style="position:absolute;right:-160px;bottom:-180px">${arcCluster(o.theme, 520)}</div>`
    : o.bg?.content
      ? ''
      : '<div class="cn s"></div><div class="cn"></div><div class="cn b"></div>'
  return `<div class="slide closing">${isGeo(o) ? '' : bgImg(o.bg?.content)}${deco}
    <div class="inner">
      <div class="ty">THANK YOU</div><h1>感谢观看</h1><div class="tick"></div>
      <div class="sub">${esc(o.title)}</div>
    </div></div>`
}

const EN = ['OVERVIEW', 'ANALYSIS', 'KEY POINTS', 'ACTION PLAN', 'SUMMARY', 'OUTLOOK']

const CONTENT_LAYOUTS = new Set([
  'cards',
  'list',
  'quote',
  'timeline',
  'big_number',
  'stats',
  'bar',
  'compare',
  'matrix',
  'swot',
  'image_text',
  'rings',
  'spoke',
  'hive',
  'cycle',
  'gallery',
  'tree',
  'diamond',
  'bulb',
])

function spokeLayout(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  const center = (sl.title || '核心').trim()
  return bodySlide(o, `${head(sl, en, o)}${spokeDiagram(o.theme, center, items)}`)
}

function hiveLayout(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  const center = (sl.title || '核心').trim()
  if (!isGeo(o)) return content({ ...sl, layout: 'list' }, en, o, false, 'list')
  return bodySlide(o, `${head(sl, en, o)}${hexHive(o.theme, center, items, sl.images)}`)
}

function treeLayout(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  if (!isGeo(o)) return content({ ...sl, layout: 'list' }, en, o, false, 'list')
  return bodySlide(o, `${head(sl, en, o)}${treeDiagram(o.theme, items)}`)
}

function diamondLayout(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 4)
  if (!isGeo(o)) return content({ ...sl, layout: 'cards' }, en, o, false, 'cards')
  return bodySlide(o, `${head(sl, en, o)}${diamondGrid(o.theme, items)}`)
}

function bulbLayout(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  if (!isGeo(o)) return content({ ...sl, layout: 'list' }, en, o, false, 'list')
  return bodySlide(o, `${head(sl, en, o)}${bulbSpoke(o.theme, items)}`)
}

function cycleLayout(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 5)
  const center = (sl.title || '循环').trim()
  if (!isGeo(o)) return content({ ...sl, layout: 'timeline' }, en, o, false, 'timeline')
  return bodySlide(o, `${head(sl, en, o)}${arrowRing(o.theme, center, items)}`)
}

/** 照片墙：2~3 张照片套几何图框 + 每张一句说明 */
function galleryLayout(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const pics = (sl.images || []).filter(Boolean).slice(0, 3)
  const caps = (sl.bullets || []).map((s) => s.trim()).filter(Boolean)
  const geo = isGeo(o)
  const cells = pics
    .map(
      (u, i) =>
        `<div class="gcell">${
          geo ? hexImg(u) : `<div class="gph"><img src="${esc(u)}" crossorigin="anonymous"></div>`
        }<div class="gcap">${caps[i] ? esc(caps[i]) : ''}</div></div>`,
    )
    .join('')
  return bodySlide(o, `${head(sl, en, o)}<div class="gallery">${cells}</div>`)
}

/** LLM 给的 layout 优先，缺失/对不上数据就按 payload 推断 */
export function resolveLayout(sl: DeckSlideIn): string {
  let lay = String(sl.layout || '').trim().toLowerCase()
  const need: Record<string, keyof DeckSlideIn> = {
    swot: 'swot',
    matrix: 'matrix',
    compare: 'compare',
    big_number: 'big_number',
  }
  if (lay in need && (sl[need[lay]] == null || typeof sl[need[lay]] !== 'object')) lay = ''
  if ((lay === 'bar' || lay === 'stats' || lay === 'rings') && !sl.data?.items?.length) lay = ''
  if (
    (lay === 'spoke' || lay === 'hive' || lay === 'cycle' || lay === 'bulb') &&
    (sl.bullets || []).filter((b) => b && b.trim()).length < 3
  )
    lay = ''
  if (lay === 'tree' && (sl.bullets || []).filter((b) => b && b.trim()).length < 2) lay = ''
  if (lay === 'diamond' && (sl.bullets || []).filter((b) => b && b.trim()).length < 3) lay = ''
  if (lay === 'gallery' && (sl.images || []).filter(Boolean).length < 2) lay = ''
  if (CONTENT_LAYOUTS.has(lay)) return lay
  if ((sl.images || []).filter(Boolean).length >= 2) return 'gallery'
  if (sl.data?.kind === 'ring' && sl.data.items?.length) return 'rings'
  if (sl.swot && (sl.swot.s?.length || sl.swot.w?.length || sl.swot.o?.length || sl.swot.t?.length))
    return 'swot'
  if (sl.matrix?.cells?.length) return 'matrix'
  if (sl.compare && (sl.compare.left || sl.compare.right)) return 'compare'
  if (sl.big_number?.value) return 'big_number'
  if (sl.data?.items?.length) return sl.data.kind === 'bar' ? 'bar' : 'stats'
  if (sl.image) return 'image_text'
  const bl = (sl.bullets || []).filter((b) => b && b.trim())
  return bl.length <= 1 ? 'quote' : bl.length >= 4 ? 'list' : 'cards'
}

/** 大纲 → 一组幻灯片 HTML 字符串 + 主题 CSS */
export function composeDeck(o: DeckOutline): { styleTag: string; slides: string[] } {
  const t = o.theme
  _geoIdx = 0
  const slides: string[] = [cover(o)]
  if (o.sections.length) slides.push(toc(o))
  let imgFlip = false
  o.sections.forEach((sec, si) => {
    slides.push(section(sec, si + 1, o.sections.length, o))
    sec.slides.forEach((sl) => {
      const en = EN[si % EN.length]
      const lay = resolveLayout(sl)
      if (lay === 'swot') slides.push(swot(sl, en, o))
      else if (lay === 'matrix') slides.push(matrix(sl, en, o))
      else if (lay === 'compare') slides.push(compare(sl, en, o))
      else if (lay === 'rings') slides.push(ringStats(sl, en, o))
      else if (lay === 'spoke') slides.push(spokeLayout(sl, en, o))
      else if (lay === 'hive') slides.push(hiveLayout(sl, en, o))
      else if (lay === 'cycle') slides.push(cycleLayout(sl, en, o))
      else if (lay === 'gallery') slides.push(galleryLayout(sl, en, o))
      else if (lay === 'tree') slides.push(treeLayout(sl, en, o))
      else if (lay === 'diamond') slides.push(diamondLayout(sl, en, o))
      else if (lay === 'bulb') slides.push(bulbLayout(sl, en, o))
      else if (lay === 'bar' || lay === 'stats') slides.push(chart(sl, t, en, o))
      else if (lay === 'big_number') slides.push(bigNumber(sl, en, o))
      else if (lay === 'image_text') {
        slides.push(content(sl, en, o, imgFlip))
        imgFlip = !imgFlip
      } else {
        slides.push(content(sl, en, o, false, lay))
      }
    })
  })
  slides.push(closing(o))
  return { styleTag: `<style>${css(t)}</style>`, slides }
}
