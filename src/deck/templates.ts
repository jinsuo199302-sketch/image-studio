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
export interface DeckSlideIn {
  /** LLM 判断的版式类型；缺失时按内容推断 */
  layout?: DeckLayout | string
  title?: string
  en?: string
  intro?: string
  bullets?: string[]
  data?: { kind: 'bar' | 'stat'; items: { label: string; value: string | number }[] }
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
  /** 用户上传的真实照片 URL——有则这一页排成「图文分栏」 */
  image?: string
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
}

const esc = (s = '') =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** 中文办公稿正文段落：首行空两格（用全角空格，导出到 PPT 也保留） */
const para = (s = '') => '　　' + esc(s.replace(/^[　\s]+/, ''))

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
  /* AI 正文底图上压一层白，不管 AI 画得多花都保证正文清晰 */
  .cwash{position:absolute;inset:0;background:rgba(255,255,255,.74);z-index:0}
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
  `
}

const bgImg = (url?: string) => (url ? `<img class="bg" src="${esc(url)}" crossorigin="anonymous">` : '')

/* ── 页型 ─────────────────────────────────────────────── */
function cover(o: DeckOutline): string {
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
  return `<div class="slide s-toc">${cbg(o)}<div class="z">
    <h2>目录</h2><div class="en">CONTENTS</div><div class="tick"></div>
    <div class="grid ${two ? 'two' : ''}">${li}</div></div></div>`
}

function section(s: DeckSection, idx: number, total: number, o: DeckOutline): string {
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

function head(sl: DeckSlideIn, en: string): string {
  return `<div class="head"><h2>${esc(sl.title || '')}</h2><div class="fl"></div>
    <div class="en">${esc(sl.en || en)}</div></div>
    ${sl.intro ? `<div class="intro">${para(sl.intro)}</div>` : ''}`
}

/** 内容页底：有 AI 底图就铺图 + 白色蒙层保证正文可读；没有就用代码画的淡纹 */
const cbg = (o: DeckOutline) =>
  o.bg?.content
    ? `${bgImg(o.bg.content)}<div class="cwash"></div>`
    : `<div class="cbg"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i></div>`
const bodySlide = (o: DeckOutline, inner: string) =>
  `<div class="slide body">${cbg(o)}<div class="z">${inner}</div></div>`

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
    return bodySlide(
      o,
      `<div class="head"><h2>${esc(sl.title || '')}</h2><div class="fl"></div><div class="en">${esc(sl.en || en)}</div></div>
      <div class="imgrow${imgFlip ? ' rev' : ''}">
        <div class="pic"><span class="fr"></span><img src="${esc(sl.image)}" crossorigin="anonymous"></div>
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
  if (branch === 'timeline') {
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
    body = `<div class="cards" style="grid-template-columns:repeat(${Math.max(cards.length, 1)},1fr)">${cards
      .map(
        (b, i) =>
          `<div class="card"><div class="ic">${ic(b, i, 30)}</div><div class="num">${pad2(i + 1)}</div><div class="ct">${para(b)}</div></div>`,
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
  return bodySlide(o, `${head(sl, en)}${body}`)
}

function bigNumber(sl: DeckSlideIn, en: string, o: DeckOutline): string {
  const b = sl.big_number || { value: '' }
  return bodySlide(
    o,
    `${head(sl, en)}
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
    `${head(sl, en)}
    <div class="mtx">${m.xLabel ? `<div class="xl">${esc(m.xLabel)}</div>` : ''}${m.yLabel ? `<div class="yl">${esc(m.yLabel)}</div>` : ''}${q}</div>`,
  )
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
  return bodySlide(o, `${head(sl, en)}${body}`)
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
  return bodySlide(o, `${head(sl, en)}<div class="cmp">${col('a', c.left)}${col('b', c.right)}</div>`)
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
    `${head(sl, en)}
    <div class="swot">
      ${quad('qs', '优势', 'STRENGTHS', s.s)}
      ${quad('qw', '劣势', 'WEAKNESSES', s.w)}
      ${quad('qo', '机会', 'OPPORTUNITIES', s.o)}
      ${quad('qt', '威胁', 'THREATS', s.t)}
    </div>`,
  )
}

function closing(o: DeckOutline): string {
  const deco = o.bg?.content ? '' : '<div class="cn s"></div><div class="cn"></div><div class="cn b"></div>'
  return `<div class="slide closing">${bgImg(o.bg?.content)}${deco}
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
])

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
  if ((lay === 'bar' || lay === 'stats') && !sl.data?.items?.length) lay = ''
  if (CONTENT_LAYOUTS.has(lay)) return lay
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
