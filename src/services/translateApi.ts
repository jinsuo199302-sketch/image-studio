import { authPostJson } from './httpClient'

export interface TranslateParams {
  text: string
  targetLang: string
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const LANG_TAG: Record<string, string> = {
  英语: 'EN',
  日语: 'JA',
  韩语: 'KO',
  法语: 'FR',
  德语: 'DE',
  中文: 'ZH',
}

/**
 * 演示模式：未配置真实接口时，仅在原文前加语言标记模拟"翻译结果"，
 * 明确不是真实翻译，只用于验证界面交互。
 */
async function mockTranslate(params: TranslateParams): Promise<string> {
  await delay(700 + Math.random() * 500)
  const tag = LANG_TAG[params.targetLang] ?? params.targetLang
  return `[${tag} 演示译文] ${params.text}`
}

/**
 * 走后端代理 /api/ai/chat/completions，真实 key 只在服务器上。
 * 未经真实联调验证——如果调用报错，把报错信息发给我，按实际返回结构调整。
 */
async function realTranslate(params: TranslateParams): Promise<string> {
  const data = await authPostJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    '/chat/completions',
    {
      model: 'gemini-3-flash-preview',
      messages: [{ role: 'user', content: `将以下内容翻译成${params.targetLang}，只返回译文，不要任何多余说明：\n${params.text}` }],
    },
    '翻译接口请求失败',
  )
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

export async function translateText(authenticated: boolean, params: TranslateParams): Promise<string> {
  if (authenticated) {
    return realTranslate(params)
  }
  return mockTranslate(params)
}
