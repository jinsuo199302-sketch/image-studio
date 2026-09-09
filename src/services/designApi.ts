import type { CanvasElement } from '../data/templates'
import type { WarpKind } from '../components/editor/CanvasStage.vue'
import { FONT_OPTIONS } from '../data/fonts'
import { authGetJson, authPostForm, authPostJson, authPostJsonBlob } from './httpClient'

/** 参考图生成里标题文字的"手法类别"提示——只对应编辑器已有的特效/变形预设名，
 * 不含任何具体字形/字体信息，是版权边界要求的"学手法不抄表达"在标题上的落地。 */
export interface TitleStyleHint {
  effect: 'none' | 'outline' | 'emboss' | 'neon'
  warp: WarpKind
}

export interface GeneratedDesign {
  background: string
  elements: CanvasElement[]
  /** 仅"参考图生成"tab 会填，其它生成链路不涉及标题手法分类 */
  titleStyle?: TitleStyleHint
  /** 手抄报按选定纸张尺寸生成——应用前先把画布调到这个尺寸 */
  canvasSize?: { width: number; height: number }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 演示模式：未登录时用一版写死的示例版式模拟生成结果，
 * 让界面/交互可以完整跑通，不代表真实 AI 生成质量。
 */
async function mockGenerate(
  prompt: string,
  canvasWidth: number,
  canvasHeight: number,
): Promise<GeneratedDesign> {
  await delay(1200 + Math.random() * 800)
  const title = prompt.trim() || '你的专属海报'
  const w = canvasWidth
  const h = canvasHeight
  return {
    background: '#fff4e6',
    elements: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        width: w,
        height: Math.round(h * 0.42),
        fill: '#7c3aed',
        rx: 0,
      },
      {
        type: 'image',
        x: Math.round(w * 0.1),
        y: Math.round(h * 0.06),
        width: Math.round(w * 0.8),
        height: Math.round(h * 0.28),
        src: `https://picsum.photos/seed/design-${Date.now()}/${Math.round(w * 0.8)}/${Math.round(h * 0.28)}`,
      },
      {
        type: 'text',
        x: Math.round(w * 0.08),
        y: Math.round(h * 0.46),
        width: Math.round(w * 0.84),
        text: title,
        fontSize: 44,
        fontWeight: 'bold',
        color: '#3b0764',
        align: 'center',
        fontFamily: FONT_OPTIONS[8]?.value ?? 'sans-serif',
      },
      {
        type: 'rect',
        x: Math.round(w * 0.15),
        y: Math.round(h * 0.58),
        width: Math.round(w * 0.7),
        height: 48,
        fill: '#fde047',
        rx: 24,
      },
      {
        type: 'text',
        x: Math.round(w * 0.15),
        y: Math.round(h * 0.585),
        width: Math.round(w * 0.7),
        text: '早鸟优惠 · 限时报名中',
        fontSize: 22,
        fontWeight: 'bold',
        color: '#7c3aed',
        align: 'center',
        fontFamily: FONT_OPTIONS[0]?.value ?? 'sans-serif',
      },
      {
        type: 'text',
        x: Math.round(w * 0.08),
        y: Math.round(h * 0.7),
        width: Math.round(w * 0.84),
        text: '这是演示模式生成的示例版式，登录后可获得围绕你的描述真实生成的内容。',
        fontSize: 18,
        fontWeight: 'normal',
        color: '#1f2329',
        align: 'left',
        fontFamily: FONT_OPTIONS[0]?.value ?? 'sans-serif',
      },
    ],
  }
}

/**
 * 走后端代理 /api/ai/design/generate，真实 key 只在服务器上。
 * 后端会依次调用文字模型拟版式、图片模型补图，一次性把结果拼好返回。
 * 未经真实联调验证——如果调用报错或解析失败，把报错信息发给我，按实际返回结构调整。
 */
async function realGenerate(
  prompt: string,
  canvasWidth: number,
  canvasHeight: number,
): Promise<GeneratedDesign> {
  return authPostJson<GeneratedDesign>(
    '/design/generate',
    {
      prompt,
      canvas_width: canvasWidth,
      canvas_height: canvasHeight,
      fonts: FONT_OPTIONS,
    },
    '设计生成失败',
  )
}

export async function generateDesign(
  authenticated: boolean,
  prompt: string,
  canvasWidth: number,
  canvasHeight: number,
): Promise<GeneratedDesign> {
  if (authenticated) {
    return realGenerate(prompt, canvasWidth, canvasHeight)
  }
  return mockGenerate(prompt, canvasWidth, canvasHeight)
}

export interface LayoutPresetSection {
  heading: string
  items: string[]
}

/**
 * 走后端代理 /api/ai/design/layout-preset——纯确定性代码排版，不调用 AI，不存在生成失败/
 * 内容跑偏的问题，只会因为输入不合法（比如没填标题）报错。跟 generateDesign 是两条不同的
 * 链路，不共用 mock/demo 逻辑：这个不需要真实 key，只需要登录（跟别的 /api/ai/* 接口保持
 * 权限一致，虽然它本身不花 AI 额度）。
 */
export async function generateLayoutPreset(
  structure: 'bullet-list' | 'dense-board',
  canvasWidth: number,
  canvasHeight: number,
  params: { title: string; intro?: string; items?: string[]; sections?: LayoutPresetSection[] },
  /** 供"参考图生成"/"手抄报"复用 dense-board 分区栏格算法时用：跳过内置标题、栏格从 topOffset
   * 开始铺、按分类换配色 */
  denseBoardOptions?: { includeTitle?: boolean; topOffset?: number; colors?: [string, string] },
): Promise<GeneratedDesign> {
  return authPostJson<GeneratedDesign>(
    '/design/layout-preset',
    {
      structure,
      canvas_width: canvasWidth,
      canvas_height: canvasHeight,
      title: params.title,
      intro: params.intro || undefined,
      items: params.items,
      sections: params.sections,
      include_title: denseBoardOptions?.includeTitle ?? true,
      top_offset: denseBoardOptions?.topOffset,
      colors: denseBoardOptions?.colors,
    },
    '排版生成失败',
  )
}

/**
 * 走后端代理 /api/ai/design/reference-to-background：上传一张参考图，后端先用视觉模型
 * 提炼出"氛围/元素类别/构图留白"这个粒度的风格描述（不提取可判定为复刻的具体细节），
 * 再喂给 gpt-image-2 生成一张全新的整图背景。只返回背景图，不含标题文字——文字层由调用方
 * （AIDesignPanel 的"参考图生成"tab）按默认样式叠加，用户再在编辑器里自由调整。
 */
export async function generateBackgroundFromReference(
  imageFile: File,
): Promise<{ backgroundSrc: string; styleDescription: string; titleStyle: TitleStyleHint; assetId: string | null }> {
  const form = new FormData()
  form.append('image', imageFile, imageFile.name || 'reference.png')
  return authPostForm<{ backgroundSrc: string; styleDescription: string; titleStyle: TitleStyleHint; assetId: string | null }>(
    '/design/reference-to-background',
    form,
    '参考图背景生成失败',
  )
}

/** 纸张尺寸——手抄报默认横版，跟后端 app/handout_categories.py 的 SIZES 保持一致 */
export const HANDOUT_SIZES: { key: string; label: string; w: number; h: number }[] = [
  { key: '16k', label: '16 开', w: 1300, h: 920 },
  { key: 'a4', label: 'A4', w: 1480, h: 1050 },
  { key: 'b4', label: 'B4', w: 1770, h: 1250 },
  { key: '8k', label: '8 开', w: 1900, h: 1340 },
  { key: 'a3', label: 'A3', w: 2100, h: 1480 },
  { key: '4k', label: '4 开', w: 2600, h: 1840 },
]

/** 画风——决定 AI 彩色版插画的渲染风格，跟后端 STYLES 保持一致。线稿版一律从彩色版提取 */
export const HANDOUT_STYLES: { key: string; label: string }[] = [
  { key: 'color', label: '彩色卡通' },
  { key: 'watercolor', label: '水彩风格' },
  { key: 'crayon', label: '蜡笔风格' },
  { key: 'marker', label: '马克笔' },
]

/** 花边边框——AI 在画面四周画一圈装饰花边，用户只选风格。跟后端 BORDERS 保持一致 */
export const HANDOUT_BORDERS: { key: string; label: string }[] = [
  { key: 'theme', label: '跟随主题' },
  { key: 'none', label: '不要边框' },
  { key: 'wave', label: '波浪圆点' },
  { key: 'vine', label: '藤蔓花草' },
  { key: 'star', label: '星星泡泡' },
  { key: 'cloud', label: '云朵彩虹' },
  { key: 'geo', label: '几何波点' },
  { key: 'stationery', label: '文具元素' },
  { key: 'bunting', label: '彩旗挂饰' },
]

/** 跟后端 app/handout_categories.py 的 key/label/hint 保持一致——挑分类用的，不用另请求一次接口 */
export const HANDOUT_CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: 'safety', label: '安全教育', hint: '消防安全 / 交通安全 / 防溺水 / 防触电…' },
  { key: 'eco', label: '环保低碳', hint: '垃圾分类 / 节约用水 / 保护地球…' },
  { key: 'reading', label: '读书阅读', hint: '读书月 / 好书推荐 / 阅读感悟…' },
  { key: 'festival', label: '传统节日', hint: '春节 / 端午 / 中秋 / 国庆…' },
  { key: 'etiquette', label: '文明礼仪', hint: '校园礼仪 / 文明用语 / 待人接物…' },
  { key: 'science', label: '科技科普', hint: '科学小知识 / 动手实验 / 科学家故事…' },
  { key: 'mental-health', label: '心理健康', hint: '认识情绪 / 缓解压力 / 与人相处…' },
  { key: 'patriotic', label: '爱国教育', hint: '我爱祖国 / 国庆节 / 红色故事…' },
]

export interface HandoutResult {
  /** 经典版：AI 画的彩色版主体插画（左半边）；可拆分版为 null */
  coloredSrc: string | null
  /** 经典版：OpenCV 从彩色版提取的黑白线稿版；可拆分版为 null */
  lineartSrc: string | null
  /** @deprecated 兼容旧字段，等于 coloredSrc */
  backgroundSrc: string | null
  /** 可拆分版：AI 出的整张手抄报原图（预览用）；经典版无此字段 */
  fullSrc?: string
  /** 可拆分版：拆出来的可拖动元素个数 */
  elementCount?: number
  /** 后端已经把版面排好了，前端直接用。经典版 elements = 标题+文字板块；
   *  可拆分版 elements = 底图 + 一堆元素图 + 标题 + 文字板块 */
  background: string
  elements: GeneratedDesign['elements']
  title: string
  sections: LayoutPresetSection[]
  colors: [string, string]
  assetId: string | null
}

/**
 * 手抄报一键生成：只传分类 + 可选的具体主题，不用自己写 prompt。
 * withContent=false 出纯涂色版；layered=true 出「可拆分元素版」——AI 出整张图后
 * 用视觉模型框出每个图画元素、逐个抠成透明小图，铺成一堆可单独拖动/替换的图层。
 */
export async function generateHandout(
  category: string,
  topic: string,
  style: string,
  border: string,
  canvasWidth: number,
  canvasHeight: number,
  withContent = true,
  layered = false,
  customPrompt = '',
): Promise<HandoutResult> {
  const body = {
    category, topic, style, border,
    custom_prompt: customPrompt,
    with_content: withContent, layered,
    canvas_width: canvasWidth, canvas_height: canvasHeight,
  }
  if (!layered) {
    return authPostJson<HandoutResult>('/design/handout', body, '手抄报生成失败')
  }
  const { jobId } = await authPostJson<{ jobId: string }>('/design/handout', body, '手抄报生成失败')
  return pollHandoutJob(jobId, '手抄报生成失败')
}

/** 手抄报/拆解都是异步 job（几分钟），下单后轮询同一个 job 接口到出结果 */
async function pollHandoutJob(jobId: string, label: string): Promise<HandoutResult> {
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000))
    const job = await authGetJson<{ status: string; result?: HandoutResult; detail?: string }>(
      `/design/handout/job/${jobId}`,
      label,
    )
    if (job.status === 'done' && job.result) return job.result
    if (job.status === 'error') throw new Error(job.detail || label)
  }
  throw new Error('生成超时，请稍后重试')
}

/** 上传一张现成的整图（豆包/别处生成的手抄报），拆成一堆可单独拖动/替换的透明贴纸图层 */
export async function decomposeImage(
  src: string,
  canvasWidth: number,
  canvasHeight: number,
  style = 'color',
): Promise<HandoutResult> {
  const blob = await (await fetch(src)).blob()
  const form = new FormData()
  form.append('image', blob, 'image.png')
  form.append('canvas_width', String(canvasWidth))
  form.append('canvas_height', String(canvasHeight))
  form.append('style', style)
  const { jobId } = await authPostForm<{ jobId: string }>('/design/decompose', form, '图片拆解失败')
  return pollHandoutJob(jobId, '图片拆解失败')
}

/**
 * 任意彩色图 → 干净黑白线稿（AI 版，效果接近豆包）。返回的是黑线白底图，
 * 调用方再按需要把黑线压成任意深浅铺到透明底上。计费「AI线稿」1 次。
 */
export async function aiLineArt(src: string): Promise<{ src: string; assetId: string }> {
  const blob = await (await fetch(src)).blob()
  const form = new FormData()
  form.append('image', blob, 'image.png')
  return authPostForm<{ src: string; assetId: string }>('/design/lineart', form, '线稿生成失败')
}

export interface DeckSlide {
  background: string
  elements: Record<string, unknown>[]
  w: number
  h: number
}
export interface DeckOutlineRaw {
  title: string
  subtitle?: string
  palette?: string[]
  mood?: string
  cover_image?: string
  cover_features?: { value: string; label: string; en?: string }[]
  sections: {
    heading: string
    en?: string
    slides: {
      layout?: string
      title?: string
      en?: string
      intro?: string
      bullets?: string[]
      data?: { kind: 'bar' | 'stat' | 'ring'; items: { label: string; value: string | number }[] }
      compare?: { left: { heading: string; points: string[] }; right: { heading: string; points: string[] } }
      swot?: { s: string[]; w: string[]; o: string[]; t: string[] }
      big_number?: { value: string; label?: string; note?: string }
      matrix?: { xLabel?: string; yLabel?: string; cells: { title: string; items: string[] }[] }
      icons?: string[]
      image?: string
      images?: string[]
    }[]
  }[]
}
export interface DeckResult {
  title: string
  theme: string
  slides: DeckSlide[]
  outline?: DeckOutlineRaw
  bg?: { cover?: string; content?: string; section?: string } | null
}

async function pollDeckJob(jobId: string): Promise<DeckResult> {
  const deadline = Date.now() + 8 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 5000))
    const job = await authGetJson<{ status: string; result?: DeckResult; detail?: string }>(
      `/design/handout/job/${jobId}`,
      'PPT 生成失败',
    )
    if (job.status === 'done' && job.result) return job.result
    if (job.status === 'error') throw new Error(job.detail || 'PPT 生成失败')
  }
  throw new Error('生成超时，请稍后重试')
}

export interface DeckPhoto {
  url: string
  tag: string
}

/** AI PPT 配图：上传若干张真实照片 → 每张打一句标签，返回 [{url,tag}]。生成时带上即可。 */
export async function uploadDeckPhotos(files: File[]): Promise<DeckPhoto[]> {
  const form = new FormData()
  for (const f of files) form.append('files', f, f.name || 'photo.jpg')
  const r = await authPostForm<{ photos: DeckPhoto[] }>('/design/deck/photos', form, '照片上传失败')
  return r.photos
}

export interface DeckRefStyle {
  theme: string
  palette: string[]
  mood: string
  ai_bg: boolean
}

/** 上传一张喜欢的 PPT 模板/参考图 → 判断风格类别 + 提取配色气质（不复刻版面） */
export async function analyzeDeckReference(file: File): Promise<DeckRefStyle> {
  const form = new FormData()
  form.append('image', file, file.name || 'ref.jpg')
  return authPostForm<DeckRefStyle>('/design/deck/reference', form, '参考图分析失败')
}

/** AI 生成 PPT：主题 → 一套幻灯片。aiBg=true 时后端另出 3 张整页背景图，走异步轮询。 */
export async function generateDeck(
  topic: string,
  sections: number,
  theme: string,
  extra = '',
  aiBg = false,
  photos: DeckPhoto[] = [],
  palette: string[] = [],
): Promise<DeckResult> {
  const r = await authPostJson<DeckResult & { jobId?: string }>(
    '/design/deck',
    { topic, sections, theme, extra, ai_bg: aiBg, photos, palette },
    'PPT 生成失败',
  )
  return r.jobId ? pollDeckJob(r.jobId) : r
}

/**
 * 传资料生成 PPT：上传 Word/PDF/txt/图片，或直接粘贴长文本 → AI 重组成大纲 → 一套幻灯片。
 * 内容全部来自用户资料。始终异步。file 与 pastedText 二选一。
 */
export async function generateDeckFromMaterial(
  input: { file?: File; pastedText?: string },
  sections: number,
  theme: string,
  extra = '',
  aiBg = false,
  photos: DeckPhoto[] = [],
  palette: string[] = [],
): Promise<DeckResult> {
  const form = new FormData()
  if (input.file) form.append('file', input.file, input.file.name || 'material')
  if (input.pastedText) form.append('text', input.pastedText)
  form.append('sections', String(sections))
  form.append('theme', theme)
  form.append('extra', extra)
  form.append('ai_bg', String(aiBg))
  if (photos.length) form.append('photos_json', JSON.stringify(photos))
  if (palette.length === 5) form.append('palette_json', JSON.stringify(palette))
  const { jobId } = await authPostForm<{ jobId: string }>('/design/deck/material', form, 'PPT 生成失败')
  return pollDeckJob(jobId)
}

/** 已生成的幻灯片数据 → 下载 PPTX（不重新扣次数） */
export async function deckToPptx(slides: DeckSlide[], theme: string, title: string): Promise<Blob> {
  return authPostJsonBlob('/design/deck/pptx', { slides, theme, title }, 'PPTX 导出失败')
}

/** 可拆分手抄报里替换单个元素：一句提示词 → 一张透明底小图 */
export async function regenerateElement(prompt: string, style = 'color'): Promise<{ src: string; assetId: string }> {
  return authPostJson<{ src: string; assetId: string }>(
    '/design/element',
    { prompt, style },
    '元素生成失败',
  )
}
