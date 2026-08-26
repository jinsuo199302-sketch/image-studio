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

export async function watermarkPdf(
  file: File,
  text: string,
  params: { opacity?: number; fontSize?: number; rotation?: number } = {},
): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  form.append('text', text)
  if (params.opacity !== undefined) form.append('opacity', String(params.opacity))
  if (params.fontSize !== undefined) form.append('font_size', String(params.fontSize))
  if (params.rotation !== undefined) form.append('rotation', String(params.rotation))
  try {
    const res = await http.post('/watermark', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '加水印失败，请重试'))
  }
}

/** x/y/width 都是相对页面宽高的 0~1 比例（y 从顶部算），不是像素——不用管每页实际尺寸 */
export async function signPdf(
  file: File,
  signature: File,
  params: { pageNumber: number; x: number; y: number; width: number },
): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  form.append('signature', signature)
  form.append('page_number', String(params.pageNumber))
  form.append('x', String(params.x))
  form.append('y', String(params.y))
  form.append('width', String(params.width))
  try {
    const res = await http.post('/signature', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '签名失败，请重试'))
  }
}
