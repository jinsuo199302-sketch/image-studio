/**
 * 幻灯片 HTML 模板。每个函数吐一段 <div class="slide">…</div>（1280×720）。
 * 排版用 CSS（flex/grid/真字号），比在坐标里摆快得多、也好看。
 * 渲染出来后 measure + pptxgenjs 转可编辑 PPTX。
 */

export interface DeckTheme {
  primary: string
  accent: string
  primaryDk: string
  paper: string
  ink: string
}

export interface DeckSlideIn {
  title?: string
  en?: string
  intro?: string
  bullets?: string[]
  data?: { kind: 'bar' | 'stat'; items: { label: string; value: string | number }[] }
}
export interface DeckOutline {
  title: string
  subtitle?: string
  theme: DeckTheme
  sections: { heading: string; en?: string; slides: DeckSlideIn[] }[]
}

const esc = (s = '') =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function css(t: DeckTheme): string {
  return `
  .slide{width:1280px;height:720px;position:relative;overflow:hidden;background:${t.paper};
    font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;color:${t.ink};box-sizing:border-box}
  .slide *{box-sizing:border-box;margin:0;padding:0}
  .kick{font-size:13px;letter-spacing:3px;color:${t.accent};font-weight:700}
  .tick{width:56px;height:3px;background:${t.accent}}

  .s-cover{background:#fff;padding:0}
  .s-cover .frame{position:absolute;left:0;top:0;width:14px;height:100%;background:${t.primary}}
  .s-cover .frame::after{content:"";position:absolute;left:0;top:0;width:14px;height:120px;background:${t.accent}}
  .s-cover .wrap{position:absolute;left:100px;top:196px;width:820px}
  .s-cover h1{font-size:56px;line-height:1.16;color:${t.primaryDk};font-weight:800;margin:16px 0 22px}
  .s-cover .sub{font-size:20px;color:#8a8a8a}
  .s-cover .meta{position:absolute;left:100px;bottom:64px;font-size:13px;color:#9a9a9a;line-height:2}

  .s-toc{padding:76px 116px}
  .s-toc h2{font-size:40px;color:${t.primary};font-weight:800}
  .s-toc .en{font-size:13px;letter-spacing:3px;color:${t.accent};font-weight:700;margin:8px 0 6px}
  .s-toc ul{list-style:none;margin-top:56px;display:grid;gap:8px}
  .s-toc li{display:flex;align-items:baseline;gap:24px;padding:18px 0;border-bottom:1px solid #e3e6ec}
  .s-toc .no{font-size:34px;font-weight:800;color:${t.primary};opacity:.35;min-width:52px}
  .s-toc .h{font-size:19px;font-weight:700}

  .s-sec{background:${t.primaryDk};color:#fff;padding:0}
  .s-sec .big{position:absolute;left:70px;top:230px;font-size:170px;font-weight:800;color:rgba(255,255,255,.10);line-height:1}
  .s-sec .box{position:absolute;left:96px;top:400px;width:900px}
  .s-sec .part{font-size:19px;letter-spacing:6px;color:${t.accent};font-weight:700}
  .s-sec h2{font-size:44px;font-weight:800;margin:14px 0 16px}
  .s-sec .en{font-size:12px;letter-spacing:3px;color:rgba(255,255,255,.55)}

  .body{padding:52px 96px;height:100%;display:flex;flex-direction:column}
  .head{text-align:center}
  .head h2{font-size:26px;color:${t.primary};font-weight:800}
  .head .l{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:8px}
  .head .l::before,.head .l::after{content:"";width:30px;height:3px;background:${t.accent}}
  .head .en{font-size:12px;letter-spacing:3px;color:#aeb2ba}
  .intro{text-align:center;color:#8a8a8a;font-size:16px;margin-top:22px;max-width:900px;align-self:center}

  .cards{display:grid;gap:32px;flex:1;margin-top:44px}
  .card{border:1px solid #e0e3ea;border-radius:14px;padding:30px 26px;display:flex;flex-direction:column;align-items:center;text-align:center;justify-content:flex-start}
  .card .ring{width:60px;height:60px;border:2px solid ${t.primary};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:${t.primary}}
  .card .ct{margin-top:18px;font-size:16px;line-height:1.6}

  .list{flex:1;margin-top:36px;display:flex;flex-direction:column;justify-content:center;gap:26px}
  .row{display:flex;align-items:center;gap:24px}
  .row .n{width:38px;height:38px;flex:none;border:2px solid ${t.accent};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${t.accent}}
  .row .rt{font-size:16px;line-height:1.55}

  .quote{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:22px}
  .quote .q{font-size:64px;color:${t.accent};font-weight:800;line-height:1}
  .quote .qt{font-size:22px;line-height:1.7;max-width:900px}

  .kpi{flex:1;display:flex;align-items:center;justify-content:space-around}
  .kpi .it{text-align:center}
  .kpi .v{font-size:60px;font-weight:800;color:${t.primary};line-height:1}
  .kpi .k{font-size:15px;color:#666;margin-top:10px}

  .bars{flex:1;margin-top:36px;display:flex;flex-direction:column;justify-content:center;gap:22px}
  .bar{display:flex;align-items:center;gap:18px}
  .bar .bl{width:180px;font-size:15px;text-align:right;flex:none}
  .bar .track{flex:1;height:18px;background:#e9edf3;border-radius:9px;position:relative}
  .bar .fill{position:absolute;left:0;top:0;height:18px;border-radius:9px}
  .bar .bv{width:70px;font-size:15px;font-weight:800;color:${t.primary};flex:none}

  .closing{background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center}
  .closing .ty{font-size:13px;letter-spacing:6px;color:${t.accent};font-weight:700}
  .closing h1{font-size:56px;font-weight:800;color:${t.primary}}
  .closing .sub{font-size:18px;color:#8a8a8a}
  `
}

function cover(o: DeckOutline): string {
  return `<div class="slide s-cover"><div class="frame"></div>
    <div class="wrap"><div class="kick">KEYNOTE PRESENTATION</div>
      <h1>${esc(o.title)}</h1><div class="tick"></div>
      ${o.subtitle ? `<div class="sub" style="margin-top:22px">${esc(o.subtitle)}</div>` : ''}</div>
    <div class="meta"><div>汇报单位：____________</div><div>汇报时间：____________</div></div></div>`
}

function toc(o: DeckOutline): string {
  const li = o.sections
    .slice(0, 6)
    .map(
      (s, i) =>
        `<li><span class="no">${String(i + 1).padStart(2, '0')}</span><span class="h">${esc(s.heading)}</span></li>`,
    )
    .join('')
  return `<div class="slide s-toc"><h2>目录</h2><div class="en">CONTENTS</div><div class="tick"></div>
    <ul>${li}</ul></div>`
}

function section(s: DeckOutline['sections'][0], idx: number, total: number): string {
  return `<div class="slide s-sec"><div class="big">${String(idx).padStart(2, '0')}</div>
    <div class="box"><div class="part">PART ${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>
      <h2>${esc(s.heading)}</h2><div class="tick"></div>
      ${s.en ? `<div class="en" style="margin-top:14px">${esc(s.en)}</div>` : ''}</div></div>`
}

function headHtml(sl: DeckSlideIn, en: string): string {
  return `<div class="head"><h2>${esc(sl.title || '')}</h2><div class="l"></div>
    <div class="en" style="margin-top:8px">${esc(sl.en || en)}</div></div>
    ${sl.intro ? `<div class="intro">${esc(sl.intro)}</div>` : ''}`
}

function content(sl: DeckSlideIn, _t: DeckTheme, enFallback: string): string {
  const items = (sl.bullets || []).filter(Boolean).slice(0, 5)
  const n = items.length
  let body = ''
  if (n === 1) {
    body = `<div class="quote"><div class="q">"</div><div class="qt">${esc(items[0])}</div><div class="tick"></div></div>`
  } else if (n === 2 || n === 3) {
    const cards = items
      .map(
        (b, i) =>
          `<div class="card"><div class="ring">${i + 1}</div><div class="ct">${esc(b)}</div></div>`,
      )
      .join('')
    body = `<div class="cards" style="grid-template-columns:repeat(${n},1fr)">${cards}</div>`
  } else {
    const rows = items
      .map(
        (b, i) =>
          `<div class="row"><div class="n">${String(i + 1).padStart(2, '0')}</div><div class="rt">${esc(b)}</div></div>`,
      )
      .join('')
    body = `<div class="list">${rows}</div>`
  }
  return `<div class="slide body">${headHtml(sl, enFallback)}${body}</div>`
}

function chart(sl: DeckSlideIn, t: DeckTheme, enFallback: string): string {
  const d = sl.data!
  const rows = d.items.filter((r) => r.label).slice(0, 6)
  let body = ''
  if (d.kind === 'stat') {
    body = `<div class="kpi">${rows
      .slice(0, 4)
      .map((r) => `<div class="it"><div class="v">${esc(String(r.value))}</div><div class="k">${esc(r.label)}</div></div>`)
      .join('')}</div>`
  } else {
    const nums = rows.map((r) => Math.abs(parseFloat(String(r.value).replace(/[^0-9.\-]/g, '')) || 0))
    const mx = Math.max(...nums, 1)
    body = `<div class="bars">${rows
      .map((r, i) => {
        const pct = Math.max(4, (nums[i] / mx) * 100)
        const col = i % 2 === 0 ? t.primary : t.accent
        return `<div class="bar"><div class="bl">${esc(r.label)}</div>
          <div class="track"><div class="fill" style="width:${pct}%;background:${col}"></div></div>
          <div class="bv">${esc(String(r.value))}</div></div>`
      })
      .join('')}</div>`
  }
  return `<div class="slide body">${headHtml(sl, enFallback)}${body}</div>`
}

function closing(o: DeckOutline): string {
  return `<div class="slide closing"><div class="ty">THANK YOU</div><h1>感谢观看</h1>
    <div class="tick"></div><div class="sub">${esc(o.title)}</div></div>`
}

const EN = ['OVERVIEW', 'ANALYSIS', 'KEY POINTS', 'ACTION PLAN', 'SUMMARY', 'OUTLOOK']

/** 大纲 → 一组幻灯片 HTML 字符串 + 主题 CSS */
export function composeDeck(o: DeckOutline): { styleTag: string; slides: string[] } {
  const t = o.theme
  const slides: string[] = [cover(o)]
  if (o.sections.length) slides.push(toc(o))
  o.sections.forEach((sec, si) => {
    slides.push(section(sec, si + 1, o.sections.length))
    sec.slides.forEach((sl) => {
      slides.push(sl.data?.items?.length ? chart(sl, t, EN[si % EN.length]) : content(sl, t, EN[si % EN.length]))
    })
  })
  slides.push(closing(o))
  return { styleTag: `<style>${css(t)}</style>`, slides }
}
