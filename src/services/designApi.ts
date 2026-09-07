import type { CanvasElement } from '../data/templates'
import type { WarpKind } from '../components/editor/CanvasStage.vue'
import { FONT_OPTIONS } from '../data/fonts'
import { authPostForm, authPostJson } from './httpClient'

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
): Promise<HandoutResult> {
  return authPostJson<HandoutResult>(
    '/design/handout',
    {
      category, topic, style, border,
      with_content: withContent, layered,
      canvas_width: canvasWidth, canvas_height: canvasHeight,
    },
    '手抄报生成失败',
  )
}

/** 可拆分手抄报里替换单个元素：一句提示词 → 一张透明底小图 */
export async function regenerateElement(prompt: string, style = 'color'): Promise<{ src: string; assetId: string }> {
  return authPostJson<{ src: string; assetId: string }>(
    '/design/element',
    { prompt, style },
    '元素生成失败',
  )
}
