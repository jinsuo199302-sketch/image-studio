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

/**
 * TODO: 接入第三方中转接口后在此实现。视频生成通常是异步任务：
 * 先提交任务拿到 task_id，再轮询任务状态直到拿到最终视频 url。
 *
 * const submit = await fetch(`${config.baseUrl}/v1/videos/generations`, {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
 *   body: JSON.stringify({ prompt: params.prompt, duration: params.duration, ratio: params.ratio }),
 * })
 * const { task_id } = await submit.json()
 * // 轮询 GET `${config.baseUrl}/v1/videos/generations/${task_id}` 直到 status === 'succeeded'
 */
async function realGenerate(_config: ApiConfig, _params: VideoParams): Promise<string> {
  throw new Error('尚未接入真实视频生成接口')
}

export async function generateVideo(config: ApiConfig | null, params: VideoParams): Promise<string> {
  if (config && config.baseUrl && config.apiKey) {
    return realGenerate(config, params)
  }
  return mockGenerate(params)
}
