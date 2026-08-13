import type { CanvasElement } from '../data/templates'
import { FONT_OPTIONS } from '../data/fonts'
import { authPostJson } from './httpClient'

export interface GeneratedDesign {
  background: string
  elements: CanvasElement[]
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
