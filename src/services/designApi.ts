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
  /** 供"参考图生成"复用 dense-board 分区栏格算法时用：跳过内置标题，栏格从 topOffset 开始铺 */
  denseBoardOptions?: { includeTitle?: boolean; topOffset?: number },
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
): Promise<{ backgroundSrc: string; styleDescription: string; titleStyle: TitleStyleHint }> {
  const form = new FormData()
  form.append('image', imageFile, imageFile.name || 'reference.png')
  return authPostForm<{ backgroundSrc: string; styleDescription: string; titleStyle: TitleStyleHint }>(
    '/design/reference-to-background',
    form,
    '参考图背景生成失败',
  )
}
