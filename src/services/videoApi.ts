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
 * kling-3.0-turbo 是可灵专属模型，openlux 要求走 /kling-compat/v1/videos/*
 * 这个独立路径（不能走通用的 /v1/videos），所以这里用 origin 重新拼接，
 * 不能直接在 config.baseUrl 后面追加。
 */
function klingCompatBase(baseUrl: string): string {
  try {
    return `${new URL(baseUrl).origin}/kling-compat/v1`
  } catch {
    return baseUrl.replace(/\/v1\/?$/, '') + '/kling-compat/v1'
  }
}

/** 安全解析响应体：不是合法 JSON 时把状态码 + 原始内容片段带进报错里，方便定位问题 */
async function parseJsonOrThrow(res: Response, label: string): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label}：${res.status} 返回内容不是 JSON，前 200 字符：${text.slice(0, 200)}`)
  }
}

/**
 * 按异步任务模式实现（提交任务 -> 轮询状态 -> 取回内容），字段名是按常见
 * 视频生成接口格式的推测，未经真实联调验证——如果调用报错，把报错信息
 * 发给我，按实际接口调整。
 */
async function realGenerate(config: ApiConfig, params: VideoParams): Promise<string> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
  const base = klingCompatBase(config.baseUrl)

  const submitRes = await fetch(`${base}/videos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'kling-3.0-turbo',
      prompt: params.prompt,
      seconds: String(params.duration),
      size: ratioToSize(params.ratio),
    }),
  })
  const task = await parseJsonOrThrow(submitRes, '视频生成接口请求失败')
  if (!submitRes.ok) {
    throw new Error(`视频生成接口请求失败：${submitRes.status} ${JSON.stringify(task)}`)
  }
  const taskId = task.id

  for (let i = 0; i < 60; i++) {
    await delay(3000)
    const statusRes = await fetch(`${base}/videos/${taskId}`, { headers })
    const statusData = await parseJsonOrThrow(statusRes, '视频任务状态查询失败')
    if (!statusRes.ok) {
      throw new Error(`视频任务状态查询失败：${statusRes.status} ${JSON.stringify(statusData)}`)
    }
    if (statusData.status === 'completed') {
      const contentRes = await fetch(`${base}/videos/${taskId}/content`, { headers })
      if (!contentRes.ok) {
        throw new Error(`视频内容下载失败：${contentRes.status} ${await contentRes.text()}`)
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
