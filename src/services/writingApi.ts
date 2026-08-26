import { authPostJson } from './httpClient'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const MOCK_VARIANTS = [
  (t: string) => `关于"${t}"，这是第一个方案：专注细节，用心打磨每一处体验。`,
  (t: string) => `关于"${t}"，这是第二个方案：不止如此，更是一种全新选择。`,
  (t: string) => `关于"${t}"，这是第三个方案：值得信赖，值得拥有。`,
  (t: string) => `关于"${t}"，这是第四个方案：与众不同，只为懂你的人。`,
  (t: string) => `关于"${t}"，这是第五个方案：简单纯粹，恰到好处。`,
]

/**
 * 演示模式：未配置真实接口时，用模板拼接出几个示例文案，
 * 让界面/交互可以完整跑通，不代表真实 AI 生成质量。
 */
async function mockGenerate(message: string, count: number): Promise<string[]> {
  await delay(900 + Math.random() * 600)
  const t = message || '你的需求'
  return MOCK_VARIANTS.slice(0, count).map((build) => build(t))
}

/**
 * 走后端代理 /api/ai/chat/completions，真实 key 只在服务器上。
 * imageDataUrl 给了才切换成 content-parts 数组——跟参考图生成用的是同一条已验证过的
 * 多模态输入链路（ChatMessage.content: str | content-parts[]），不是新接口。
 */
async function realGenerate(message: string, count: number, imageDataUrl?: string): Promise<string[]> {
  const instruction = `${message}\n\n请给出 ${count} 个不同的文案方案。只返回一个 JSON 字符串数组，不要任何多余说明文字，例如 ["方案1", "方案2"]`
  const requestContent = imageDataUrl
    ? [
        { type: 'text', text: instruction },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ]
    : instruction
  const data = await authPostJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    '/chat/completions',
    {
      model: 'gemini-3-flash-preview',
      messages: [{ role: 'user', content: requestContent }],
    },
    '文案接口请求失败',
  )
  const replyText: string = data.choices?.[0]?.message?.content ?? ''
  try {
    const match = replyText.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match ? match[0] : replyText)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // 模型没有严格按 JSON 格式返回时，退化为按行拆分
  }
  return replyText.split('\n').map((s) => s.trim()).filter(Boolean)
}

export async function generateCopy(
  authenticated: boolean,
  message: string,
  count = 3,
  imageDataUrl?: string,
): Promise<string[]> {
  if (authenticated) {
    return realGenerate(message, count, imageDataUrl)
  }
  return mockGenerate(message, count)
}
