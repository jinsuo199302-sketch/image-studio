import type { ApiConfig } from '../types'

export interface VideoParams {
  prompt: string
  duration: 5 | 10
  ratio: '16:9' | '9:16' | '1:1'
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const SAMPLE_VIDEOS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
]

/**
 * 演示模式：未配置真实接口时，用公开示例视频模拟生成结果，
 * 让界面/交互可以完整跑通，不代表真实生成内容。
 */
async function mockGenerate(_params: VideoParams): Promise<string> {
  await delay(2000 + Math.random() * 1500)
  return SAMPLE_VIDEOS[Math.floor(Math.random() * SAMPLE_VIDEOS.length)]
}

function ratioToSize(ratio: VideoParams['ratio']): string {
  if (ratio === '9:16') return '720x1280'
  if (ratio === '1:1') return '720x720'
  return '1280x720'
}

/**
 * 按 OpenAI Sora 风格的异步任务模式实现（提交任务 -> 轮询状态 -> 取回内容），
 * 模型名 'sora-2' 和字段名都是按官方文档格式的推测，未经真实联调验证——
 * 如果调用报错（比如模型名不对/字段名不对），把报错信息发给我，按实际接口调整。
 */
async function realGenerate(config: ApiConfig, params: VideoParams): Promise<string> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }

  const submitRes = await fetch(`${config.baseUrl}/videos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'kling-3.0-turbo',
      prompt: params.prompt,
      seconds: String(params.duration),
      size: ratioToSize(params.ratio),
    }),
  })
  if (!submitRes.ok) {
    throw new Error(`视频生成接口请求失败：${submitRes.status} ${await submitRes.text()}`)
  }
  const task = await submitRes.json()
  const taskId = task.id

  for (let i = 0; i < 60; i++) {
    await delay(3000)
    const statusRes = await fetch(`${config.baseUrl}/videos/${taskId}`, { headers })
    if (!statusRes.ok) {
      throw new Error(`视频任务状态查询失败：${statusRes.status} ${await statusRes.text()}`)
    }
    const statusData = await statusRes.json()
    if (statusData.status === 'completed') {
      const contentRes = await fetch(`${config.baseUrl}/videos/${taskId}/content`, { headers })
      if (!contentRes.ok) {
        throw new Error(`视频内容下载失败：${contentRes.status}`)
      }
      const blob = await contentRes.blob()
      return URL.createObjectURL(blob)
    }
    if (statusData.status === 'failed') {
      throw new Error(`视频生成失败：${statusData.error?.message ?? '未知错误'}`)
    }
  }
  throw new Error('视频生成超时，请重试')
}

export async function generateVideo(config: ApiConfig | null, params: VideoParams): Promise<string> {
  if (config && config.baseUrl && config.apiKey) {
    return realGenerate(config, params)
  }
  return mockGenerate(params)
}
