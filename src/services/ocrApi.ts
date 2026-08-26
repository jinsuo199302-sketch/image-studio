import { authPostJson } from './httpClient'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const OCR_INSTRUCTION =
  '提取图片中的所有文字内容，按原始的段落/换行输出。只输出识别到的文字本身，不要添加任何说明、前后缀或 markdown 格式。如果图片里没有可识别的文字，输出"未识别到文字"。'

async function mockOcr(): Promise<string> {
  await delay(800 + Math.random() * 500)
  return '（演示模式）这是识别出的示例文字内容，登录后可识别真实图片里的文字。'
}

/**
 * 走 /api/ai/chat/completions，复用参考图生成那条已验证过的多模态输入链路——不是接的
 * 专门的 OCR 模型（PaddleOCR 这类），是让视觉模型直接读图。轻量场景（截图/名片提取一段字）
 * 够用，零新增依赖、零新增服务器资源占用，代价是准确率不如专业 OCR 引擎。
 */
async function realOcr(imageDataUrl: string): Promise<string> {
  const data = await authPostJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    '/chat/completions',
    {
      model: 'gemini-3-flash-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: OCR_INSTRUCTION },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    },
    '文字提取失败',
  )
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

export async function extractTextFromImage(authenticated: boolean, imageDataUrl: string): Promise<string> {
  if (authenticated) {
    return realOcr(imageDataUrl)
  }
  return mockOcr()
}
