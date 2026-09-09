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

export interface DeckTheme {
  primary: string
  accent: string
  primaryDk: string
  paper: string
  ink: string
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
export interface DeckSlideIn {
  title?: string
  en?: string
  intro?: string
  bullets?: string[]
  data?: { kind: 'bar' | 'stat'; items: { label: string; value: string | number }[] }
  /** 对比页：左右两栏各一个观点组 */
  compare?: DeckCompare
  /** SWOT 四象限 */
  swot?: DeckSwot
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
}

const esc = (s = '') =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const pad2 = (n: number) => String(n).padStart(2, '0')

function css(t: DeckTheme): string {
  return `
  .slide{--m:96px;width:1280px;height:720px;position:relative;overflow:hidden;background:${t.paper};
    font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;color:${t.ink};box-sizing:border-box}
  .slide *{box-sizing:border-box;margin:0;padding:0}
  .bg{position:absolute;inset:0;width:1280px;height:720px;object-fit:cover;z-index:0}
  .z{position:relative;z-index:1;height:100%}
  .tick{width:52px;height:3px;background:${t.accent};flex:none}
  .en{font-size:12px;letter-spacing:3px;color:#a9adb6;font-weight:700}

  /* 封面 */
  .s-cover{background:#fff}
  .s-cover .side{position:absolute;left:0;top:0;width:16px;height:100%;background:${t.primary};z-index:2}
  .s-cover .side::after{content:"";position:absolute;left:0;top:0;width:16px;height:128px;background:${t.accent}}
  .s-cover .panel{position:absolute;left:76px;top:150px;width:760px;padding:44px 44px 40px;background:rgba(255,255,255,.9);border-radius:8px;z-index:2}
  .s-cover .kick{font-size:13px;letter-spacing:4px;color:${t.accent};font-weight:800}
  .s-cover h1{font-size:52px;line-height:1.18;color:${t.primaryDk};font-weight:800;margin:14px 0 20px}
  .s-cover .sub{font-size:19px;color:#7c7c7c;margin-top:20px}
  .s-cover .meta{margin-top:36px;font-size:13px;color:#9a9a9a;line-height:2}

  /* 目录 */
  .s-toc{padding:76px 116px}
  .s-toc h2{font-size:38px;color:${t.primary};font-weight:800}
  .s-toc .en{margin:10px 0 4px;color:${t.accent}}
  .s-toc .grid{margin-top:52px;display:grid;grid-template-columns:1fr;gap:6px}
  .s-toc .grid.two{grid-template-columns:1fr 1fr;column-gap:56px}
  .s-toc .it{display:flex;align-items:baseline;gap:22px;padding:16px 0;border-bottom:1px solid #e4e7ec}
  .s-toc .no{font-size:30px;font-weight:800;color:${t.primary};opacity:.32;min-width:46px}
  .s-toc .h{font-size:18px;font-weight:700}

  /* 章节过渡 */
  .s-sec{background:${t.primaryDk};color:#fff}
  .s-sec .big{position:absolute;left:64px;top:210px;font-size:190px;font-weight:800;color:rgba(255,255,255,.09);line-height:.9}
  .s-sec .box{position:absolute;left:96px;top:404px;width:920px}
  .s-sec .part{font-size:18px;letter-spacing:6px;color:${t.accent};font-weight:800}
  .s-sec h2{font-size:42px;font-weight:800;margin:12px 0 14px}
  .s-sec .en{color:rgba(255,255,255,.5)}

  /* 内容页骨架 */
  .body{padding:50px 96px;height:100%;display:flex;flex-direction:column}
  .head{text-align:center}
  .head h2{font-size:25px;color:${t.primary};font-weight:800}
  .head .fl{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:8px}
  .head .fl::before,.head .fl::after{content:"";width:28px;height:3px;background:${t.accent}}
  .head .en{margin-top:8px}
  .intro{text-align:center;color:#8b8b8b;font-size:15px;line-height:1.6;margin:20px auto 0;max-width:880px}

  /* 卡片（2~3 条） */
  .cards{display:grid;gap:30px;flex:1;margin-top:42px;align-content:center}
  .card{border:1px solid #e2e5ec;border-radius:14px;padding:32px 26px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px}
  .card .ring{width:58px;height:58px;border:2px solid ${t.primary};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:${t.primary}}
  .card .bd{width:26px;height:3px;background:${t.accent}}
  .card .ct{font-size:16px;line-height:1.62}

  /* 清单（4~5 条） */
  .list{flex:1;margin-top:34px;display:flex;flex-direction:column;justify-content:center}
  .row{display:flex;align-items:center;gap:22px;padding:16px 0;border-bottom:1px solid #e8eaef}
  .row:last-child{border-bottom:0}
  .row .n{width:36px;height:36px;flex:none;border:2px solid ${t.accent};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${t.accent}}
  .row .rt{font-size:16px;line-height:1.5}

  /* 引言（1 句） */
  .quote{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:20px}
  .quote .q{font-size:60px;color:${t.accent};font-weight:800;line-height:.6}
  .quote .qt{font-size:22px;line-height:1.7;max-width:900px;font-weight:600}

  /* 时间轴（流程/步骤） */
  .steps{flex:1;display:flex;align-items:center;margin-top:30px}
  .steps .track{flex:1;display:flex;align-items:flex-start;position:relative}
  .steps .track::before{content:"";position:absolute;left:6%;right:6%;top:19px;height:2px;background:#dfe2e8}
  .steps .st{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:0 10px}
  .steps .dot{width:40px;height:40px;border-radius:50%;background:${t.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;position:relative;z-index:1}
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
  .cmp{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:38px;margin-top:40px;align-content:center}
  .cmp .col{border:1px solid #e2e5ec;border-radius:14px;padding:30px 28px;display:flex;flex-direction:column;gap:16px}
  .cmp .col.a{border-top:4px solid ${t.primary}}
  .cmp .col.b{border-top:4px solid ${t.accent}}
  .cmp .ch{font-size:19px;font-weight:800}
  .cmp .col.a .ch{color:${t.primary}}
  .cmp .col.b .ch{color:${t.primaryDk}}
  .cmp .cd{width:26px;height:3px;background:${t.accent}}
  .cmp .ci{font-size:15px;line-height:1.6;padding-left:16px;position:relative}
  .cmp .ci::before{content:"";position:absolute;left:0;top:9px;width:6px;height:6px;border-radius:50%;background:${t.accent}}

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

  /* 结尾 */
  .closing{background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center}
  .closing .ty{font-size:13px;letter-spacing:6px;color:${t.accent};font-weight:800}
  .closing h1{font-size:54px;font-weight:800;color:${t.primary}}
  .closing .sub{font-size:17px;color:#8a8a8a}
  `
}

const bgImg = (url?: string) => (url ? `<img class="bg" src="${esc(url)}" crossorigin="anonymous">` : '')

/* ── 页型 ─────────────────────────────────────────────── */
function cover(o: DeckOutline): string {
  const b = o.bg?.cover
  return `<div class="slide s-cover">${bgImg(b)}<div class="side"></div>
    <div class="panel">
      <div class="kick">KEYNOTE PRESENTATION</div>
      <h1>${esc(o.title)}</h1><div class="tick"></div>
      ${o.subtitle ? `<div class="sub">${esc(o.subtitle)}</div>` : ''}
      <div class="meta"><div>汇报单位：____________</div><div>汇报时间：____________</div></div>
    </div></div>`
}

function toc(o: DeckOutline): string {
  const rows = o.sections.slice(0, 6)
  const two = rows.length > 4
  const li = rows
    .map(
      (s, i) =>
        `<div class="it"><span class="no">${pad2(i + 1)}</span><span class="h">${esc(s.heading)}</span></div>`,
    )
    .join('')
  return `<div class="slide s-toc">${bgImg(o.bg?.content)}<div class="z">
    <h2>目录</h2><div class="en">CONTENTS</div><div class="tick"></div>
    <div class="grid ${two ? 'two' : ''}">${li}</div></div></div>`
}

function section(s: DeckSection, idx: number, total: number, o: DeckOutline): string {
  return `<div class="slide s-sec">${bgImg(o.bg?.section)}
    <div class="big">${pad2(idx)}</div>
    <div class="box">
      <div class="part">PART ${pad2(idx)} / ${pad2(total)}</div>
      <h2>${esc(s.heading)}</h2><div class="tick"></div>
      ${s.en ? `<div class="en" style="margin-top:14px">${esc(s.en)}</div>` : ''}
    </div></div>`
}

function head(sl: DeckSlideIn, en: string): string {
  return `<div class="head"><h2>${esc(sl.title || '')}</h2><div class="fl"></div>
    <div class="en">${esc(sl.en || en)}</div></div>
    ${sl.intro ? `<div class="intro">${esc(sl.intro)}</div>` : ''}`
}

const STEP_RE = /流程|步骤|阶段|环节|顺序|先后|第一步|首先/

function content(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const items = (sl.bullets || []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
  const n = items.length
  let body: string
  const asSteps = n >= 3 && STEP_RE.test((sl.title || '') + (sl.intro || ''))

  if (asSteps) {
    body = `<div class="steps"><div class="track">${items
      .map((b, i) => `<div class="st"><div class="dot">${i + 1}</div><div class="sl">${esc(b)}</div></div>`)
      .join('')}</div></div>`
  } else if (n === 1) {
    body = `<div class="quote"><div class="q">"</div><div class="qt">${esc(items[0])}</div><div class="tick"></div></div>`
  } else if (n === 2 || n === 3) {
    body = `<div class="cards" style="grid-template-columns:repeat(${n},1fr)">${items
      .map(
        (b, i) =>
          `<div class="card"><div class="ring">${i + 1}</div><div class="bd"></div><div class="ct">${esc(b)}</div></div>`,
      )
      .join('')}</div>`
  } else {
    body = `<div class="list">${items
      .map(
        (b, i) => `<div class="row"><div class="n">${pad2(i + 1)}</div><div class="rt">${esc(b)}</div></div>`,
      )
      .join('')}</div>`
  }
  return `<div class="slide body">${bgImg(o.bg?.content)}<div class="z">${head(sl, en)}${body}</div></div>`
}

function chart(sl: DeckSlideIn, t: DeckTheme, en: string, o: DeckOutline): string {
  const d = sl.data!
  const rows = d.items.filter((r) => r.label).slice(0, 6)
  let body: string
  if (d.kind === 'stat') {
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
  return `<div class="slide body">${bgImg(o.bg?.content)}<div class="z">${head(sl, en)}${body}</div></div>`
}

function compare(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const c = sl.compare!
  const col = (side: 'a' | 'b', g: { heading: string; points: string[] }) =>
    `<div class="col ${side}"><div class="ch">${esc(g.heading)}</div><div class="cd"></div>${(g.points || [])
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((p) => `<div class="ci">${esc(p)}</div>`)
      .join('')}</div>`
  return `<div class="slide body">${bgImg(o.bg?.content)}<div class="z">${head(sl, en)}
    <div class="cmp">${col('a', c.left)}${col('b', c.right)}</div></div></div>`
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
  return `<div class="slide body">${bgImg(o.bg?.content)}<div class="z">${head(sl, en)}
    <div class="swot">
      ${quad('qs', '优势', 'STRENGTHS', s.s)}
      ${quad('qw', '劣势', 'WEAKNESSES', s.w)}
      ${quad('qo', '机会', 'OPPORTUNITIES', s.o)}
      ${quad('qt', '威胁', 'THREATS', s.t)}
    </div></div></div>`
}

function closing(o: DeckOutline): string {
  return `<div class="slide closing">${bgImg(o.bg?.content)}<div class="z" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
    <div class="ty">THANK YOU</div><h1>感谢观看</h1><div class="tick"></div>
    <div class="sub">${esc(o.title)}</div></div></div>`
}

const EN = ['OVERVIEW', 'ANALYSIS', 'KEY POINTS', 'ACTION PLAN', 'SUMMARY', 'OUTLOOK']

/** 大纲 → 一组幻灯片 HTML 字符串 + 主题 CSS */
export function composeDeck(o: DeckOutline): { styleTag: string; slides: string[] } {
  const t = o.theme
  const slides: string[] = [cover(o)]
  if (o.sections.length) slides.push(toc(o))
  o.sections.forEach((sec, si) => {
    slides.push(section(sec, si + 1, o.sections.length, o))
    sec.slides.forEach((sl) => {
      const en = EN[si % EN.length]
      slides.push(
        sl.swot
          ? swot(sl, en, o)
          : sl.compare
            ? compare(sl, en, o)
            : sl.data?.items?.length
              ? chart(sl, t, en, o)
              : content(sl, en, o),
      )
    })
  })
  slides.push(closing(o))
  return { styleTag: `<style>${css(t)}</style>`, slides }
}
