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

/** kling 文生视频专属路径，跟 config.baseUrl 不在同一层级，需要用 origin 重新拼接 */
function klingBase(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin
  } catch {
    return baseUrl.replace(/\/v1\/?$/, '')
  }
}

/** 安全解析响应体：不是合法 JSON 时把状态码 + 原始内容片段带进报错里 */
async function parseJsonOrThrow(res: Response, label: string): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label}：${res.status} 返回内容不是 JSON，前 200 字符：${text.slice(0, 200)}`)
  }
}

/**
 * 按 openlux 文档「文生视频」POST /kling/v1/videos/text2video 实现，
 * 查询任务状态的 GET 接口路径是参照 Kling 官方 API 惯例推测的
 * （官方文档：https://app.klingai.com/cn/dev/document-api），未经真实联调验证——
 * 如果查询这步报错，把报错信息发给我，按实际接口调整。
 */
async function realGenerate(config: ApiConfig, params: VideoParams): Promise<string> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
  const base = klingBase(config.baseUrl)
  const createUrl = `${base}/kling/v1/videos/text2video`

  const submitRes = await fetch(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model_name: 'kling-3.0-turbo',
      prompt: params.prompt,
      negative_prompt: '',
      cfg_scale: 0.5,
      mode: 'std',
      aspect_ratio: params.ratio,
      duration: params.duration,
    }),
  })
  const submitData = await parseJsonOrThrow(submitRes, '视频生成接口请求失败')
  if (!submitRes.ok || submitData.code !== 0) {
    throw new Error(`视频生成接口请求失败：${submitRes.status} ${JSON.stringify(submitData)}`)
  }
  const taskId = submitData.data.task_id

  for (let i = 0; i < 60; i++) {
    await delay(3000)
    const statusRes = await fetch(`${createUrl}/${taskId}`, { headers })
    const statusData = await parseJsonOrThrow(statusRes, '视频任务状态查询失败')
    if (!statusRes.ok || statusData.code !== 0) {
      throw new Error(`视频任务状态查询失败：${statusRes.status} ${JSON.stringify(statusData)}`)
    }
    const taskStatus = statusData.data.task_status
    if (taskStatus === 'succeed' || taskStatus === 'success' || taskStatus === 'completed') {
      const videoUrl = statusData.data.task_result?.videos?.[0]?.url
      if (!videoUrl) {
        throw new Error(`视频生成完成但取不到视频地址：${JSON.stringify(statusData.data)}`)
      }
      return videoUrl
    }
    if (taskStatus === 'failed') {
      throw new Error(`视频生成失败：${statusData.data.task_status_msg ?? statusData.message ?? '未知错误'}`)
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
