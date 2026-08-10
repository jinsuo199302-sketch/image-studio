import { authGetJson, authPostJson } from './httpClient'

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

/**
 * 走后端代理 /api/ai/video/generate（创建任务）+ /api/ai/video/tasks/{id}（轮询），真实 key 只在服务器上。
 * 后端按 openlux 文档「Vidu 文生视频」转发：创建 POST /ent/v2/text2video（模型 viduq3-turbo，bgm:true 自动配背景音乐），
 * 查询 GET /ent/v2/tasks/{id}/creations。未经真实联调验证——如果调用报错，把报错信息发给我按实际接口调整。
 */
async function realGenerate(params: VideoParams): Promise<string> {
  const submitData = await authPostJson<{ task_id?: string }>(
    '/video/generate',
    {
      model: 'viduq3-turbo',
      prompt: params.prompt,
      duration: params.duration,
      aspect_ratio: params.ratio,
      bgm: true,
    },
    '视频生成接口请求失败',
  )
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
    const statusData = await authGetJson<any>(`/video/tasks/${taskId}`, '视频任务状态查询失败')
    lastStatusData = statusData
    const response = statusData.Response ?? statusData
    /** 实测 Vidu 查询接口不返回 status/Status 字段，视频地址出现就代表完成，优先按这个判断 */
    const videoUrl = findVideoUrl(response)
    if (videoUrl) {
      return videoUrl
    }
    const status = response.Status ?? response.status ?? response.state
    if (status === 'FAILED' || status === 'failed' || status === 'ERROR' || status === 'error') {
      throw new Error(`视频生成失败：${JSON.stringify(response)}`)
    }
  }
  throw new Error(`视频生成超时，请重试。最后一次查询到的状态：${JSON.stringify(lastStatusData)}`)
}

export async function generateVideo(authenticated: boolean, params: VideoParams): Promise<string> {
  if (authenticated) {
    return realGenerate(params)
  }
  return mockGenerate(params)
}
