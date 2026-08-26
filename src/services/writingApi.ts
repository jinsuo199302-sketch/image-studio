import { authPostJson } from './httpClient'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 演示模式：未配置真实接口时，用模板拼接出几个示例文案，
 * 让界面/交互可以完整跑通，不代表真实 AI 生成质量。
 */
async function mockGenerate(message: string): Promise<string[]> {
  await delay(900 + Math.random() * 600)
  const t = message || '你的需求'
  return [
    `关于"${t}"，这是第一个方案：专注细节，用心打磨每一处体验。`,
    `关于"${t}"，这是第二个方案：不止如此，更是一种全新选择。`,
    `关于"${t}"，这是第三个方案：值得信赖，值得拥有。`,
  ]
}

/**
 * 走后端代理 /api/ai/chat/completions，真实 key 只在服务器上。
 * 未经真实联调验证——如果调用报错或解析失败，把报错信息发给我，按实际返回结构调整。
 */
async function realGenerate(message: string): Promise<string[]> {
  const data = await authPostJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    '/chat/completions',
    {
      model: 'gemini-3-flash-preview',
      messages: [
        {
          role: 'user',
          content: `${message}\n\n请给出 3 个不同的文案方案。只返回一个 JSON 字符串数组，不要任何多余说明文字，例如 ["方案1", "方案2", "方案3"]`,
        },
      ],
    },
    '文案接口请求失败',
  )
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

export async function generateCopy(authenticated: boolean, message: string): Promise<string[]> {
  if (authenticated) {
    return realGenerate(message)
  }
  return mockGenerate(message)
}
