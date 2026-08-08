import type { ApiConfig } from '../types'

export type CopyType = 'headline' | 'slogan' | 'body' | 'social'

export interface WritingParams {
  topic: string
  type: CopyType
  tone: string
}

const TYPE_LABEL: Record<CopyType, string> = {
  headline: '标题',
  slogan: '广告语',
  body: '正文文案',
  social: '朋友圈文案',
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 演示模式：未配置真实接口时，用模板拼接出几个示例文案，
 * 让界面/交互可以完整跑通，不代表真实 AI 生成质量。
 */
async function mockGenerate(params: WritingParams): Promise<string[]> {
  await delay(900 + Math.random() * 600)
  const { topic, type } = params
  const t = topic || '你的产品'
  const templates: Record<CopyType, string[]> = {
    headline: [`${t}，重新定义体验`, `不止是${t}，更是新选择`, `${t}，超乎你的想象`],
    slogan: [`选择${t}，选择更好`, `${t}，值得信赖的选择`, `因${t}而不同`],
    body: [
      `${t}，专注细节，用心打磨每一处体验，只为给你带来更好的选择。`,
      `我们相信${t}不只是一件产品，更是一种生活方式，值得你拥有。`,
      `从设计到品质，${t}都经过反复打磨，只为呈现更好的自己。`,
    ],
    social: [`今天想和大家分享一下${t}，真的很不错，推荐给你们～`, `发现一个宝藏：${t}，用过都说好！`, `${t}测评来啦，看完你就懂了`],
  }
  return templates[type]
}

/**
 * 按 OpenAI 兼容 chat completions 格式实现，baseUrl 约定已包含 /v1。
 * 未经真实联调验证——如果调用报错或解析失败，把报错信息发给我，按实际返回结构调整。
 */
async function realGenerate(config: ApiConfig, params: WritingParams): Promise<string[]> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: 'gemini-3-flash-preview',
      messages: [
        {
          role: 'user',
          content: `写 3 条${TYPE_LABEL[params.type]}，主题：${params.topic}，语气：${params.tone}。只返回一个 JSON 字符串数组，不要任何多余说明文字，例如 ["文案1", "文案2", "文案3"]`,
        },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`写作接口请求失败：${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? ''
  try {
    const match = content.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match ? match[0] : content)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // 模型没有严格按 JSON 格式返回时，退化为按行拆分
  }
  return content.split('\n').map((s) => s.trim()).filter(Boolean)
}

export async function generateCopy(config: ApiConfig | null, params: WritingParams): Promise<string[]> {
  if (config && config.baseUrl && config.apiKey) {
    return realGenerate(config, params)
  }
  return mockGenerate(params)
}

export { TYPE_LABEL }
