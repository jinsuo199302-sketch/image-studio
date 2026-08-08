import axios from 'axios'

const http = axios.create({ baseURL: '/api/pdf' })

async function extractErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 413) {
      return '文件太大，超过了服务器允许的上传体积上限'
    }
    if (error.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        const parsed = JSON.parse(text)
        if (parsed?.detail) return parsed.detail
      } catch {
        // 返回内容不是 JSON 时用兜底文案
      }
    }
  }
  return fallback
}

export async function mergePdfs(files: File[]): Promise<Blob> {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  try {
    const res = await http.post('/merge', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '合并失败，请重试'))
  }
}

export type SplitMode = 'every_n' | 'ranges'

export async function splitPdf(
  file: File,
  mode: SplitMode,
  params: { pagesPerFile?: number; ranges?: string },
): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  form.append('mode', mode)
  if (params.pagesPerFile) form.append('pages_per_file', String(params.pagesPerFile))
  if (params.ranges) form.append('ranges', params.ranges)
  try {
    const res = await http.post('/split', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '拆分失败，请重试'))
  }
}
