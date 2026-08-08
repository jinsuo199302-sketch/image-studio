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

/** Vidu 接口路径跟 config.baseUrl 不在同一层级，需要用 origin 重新拼接 */
function origin(baseUrl: string): string {
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
 * 按 openlux 文档「Vidu 文生视频」实现：
 * 创建任务 POST /ent/v2/text2video（模型 viduq3-turbo，bgm:true 自动配背景音乐）
 * 查询任务 GET /vidu-native/video/generations/{task_id}
 * 未经真实联调验证——如果调用报错，把报错信息发给我，按实际接口调整。
 */
async function realGenerate(config: ApiConfig, params: VideoParams): Promise<string> {
  const base = origin(config.baseUrl)
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }

  const submitRes = await fetch(`${base}/ent/v2/text2video`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'viduq3-turbo',
      prompt: params.prompt,
      duration: params.duration,
      aspect_ratio: params.ratio,
      bgm: true,
    }),
  })
  const submitData = await parseJsonOrThrow(submitRes, '视频生成接口请求失败')
  if (!submitRes.ok) {
    throw new Error(`视频生成接口请求失败：${submitRes.status} ${JSON.stringify(submitData)}`)
  }
  const taskId = submitData.task_id
  if (!taskId) {
    throw new Error(`视频生成接口未返回 task_id：${JSON.stringify(submitData)}`)
  }

  /** 视频地址可能藏在几种不同字段名下，按可能性依次找 */
  function findVideoUrl(node: any): string | null {
    if (!node || typeof node !== 'object') return null
    for (const key of ['video_url', 'url', 'videoUrl']) {
      if (typeof node[key] === 'string') return node[key]
    }
    for (const key of ['creations', 'Creations', 'videos', 'Videos']) {
      const arr = node[key]
      if (Array.isArray(arr) && arr.length) {
        const found = findVideoUrl(arr[0])
        if (found) return found
      }
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        const found = findVideoUrl(value)
        if (found) return found
      }
    }
    return null
  }

  /** 轮询 8 分钟（160 次 * 3 秒）：视频生成（尤其 10 秒+带配乐）可能比之前预留的 3 分钟慢 */
  let lastStatusData: any = null
  for (let i = 0; i < 160; i++) {
    await delay(3000)
    const statusRes = await fetch(`${base}/ent/v2/tasks/${taskId}/creations`, { headers })
    const statusData = await parseJsonOrThrow(statusRes, '视频任务状态查询失败')
    lastStatusData = statusData
    if (!statusRes.ok) {
      throw new Error(`视频任务状态查询失败：${statusRes.status} ${JSON.stringify(statusData)}`)
    }
    const response = statusData.Response ?? statusData
    const status = response.Status ?? response.status
    if (status === 'FINISH' || status === 'FINISHED' || status === 'SUCCESS' || status === 'success') {
      const videoUrl = findVideoUrl(response)
      if (!videoUrl) {
        throw new Error(`视频生成完成但找不到视频地址字段，完整返回：${JSON.stringify(statusData)}`)
      }
      return videoUrl
    }
    if (status === 'FAILED' || status === 'failed') {
      throw new Error(`视频生成失败：${JSON.stringify(response)}`)
    }
  }
  throw new Error(`视频生成超时，请重试。最后一次查询到的状态：${JSON.stringify(lastStatusData)}`)
}

export async function generateVideo(config: ApiConfig | null, params: VideoParams): Promise<string> {
  if (config && config.baseUrl && config.apiKey) {
    return realGenerate(config, params)
  }
  return mockGenerate(params)
}
