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

export type ScanMode = 'bw' | 'gray' | 'color'

/** 多张照片 → 一个"扫描件"PDF。后端纯本地 OpenCV 处理（透视校正 + 背景拉白 + 按模式增强）。 */
export async function scanToPdf(files: File[], mode: ScanMode, autoCrop: boolean): Promise<Blob> {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  form.append('mode', mode)
  form.append('auto_crop', String(autoCrop))
  try {
    const res = await http.post('/scan', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '扫描失败，请重试'))
  }
}

/** 多张图片打包成一个 PDF（不做任何处理，原样打包）。auto=每页贴合图片比例，a4=统一放进 A4 白底 */
export async function imagesToPdf(files: File[], pageSize: 'auto' | 'a4'): Promise<Blob> {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  form.append('page_size', pageSize)
  try {
    const res = await http.post('/images-to-pdf', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '转换失败，请重试'))
  }
}

/** PDF 每页导出成图片，返回 ZIP。dpi 72~300 */
export async function pdfToImages(file: File, fmt: 'png' | 'jpg', dpi: number): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  form.append('fmt', fmt)
  form.append('dpi', String(dpi))
  try {
    const res = await http.post('/to-images', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '转换失败，请重试'))
  }
}

/** 给 PDF 加打开密码 / 已知密码去掉密码 */
export async function securePdf(file: File, mode: 'encrypt' | 'decrypt', password: string): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  form.append('password', password)
  try {
    const res = await http.post(`/${mode}`, form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, mode === 'encrypt' ? '加密失败，请重试' : '解密失败，请重试'))
  }
}

/** 页面管理：删除 / 只保留 / 旋转 指定页。pages 用「1,3,5-8」格式 */
export async function editPdfPages(
  file: File,
  op: 'delete' | 'extract' | 'rotate',
  pages: string,
  angle: 90 | 180 | 270 = 90,
): Promise<Blob> {
  const form = new FormData()
  form.append('file', file)
  form.append('op', op)
  form.append('pages', pages)
  form.append('angle', String(angle))
  try {
    const res = await http.post('/pages', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '处理失败，请重试'))
  }
}

export interface DocTemplate {
  key: string
  label: string
}

export async function getDocTemplates(): Promise<DocTemplate[]> {
  const res = await http.get<{ templates: DocTemplate[] }>('/doc-templates')
  return res.data.templates
}

/** 把 AI 生成的带 markdown 符号、没排版的文本，按中文办公模板重排成 .docx */
export async function formatDoc(text: string, template: string, title: string): Promise<Blob> {
  const form = new FormData()
  form.append('text', text)
  form.append('template', template)
  form.append('title', title)
  try {
    const res = await http.post('/format-doc', form, { responseType: 'blob' })
    return res.data
  } catch (e) {
    throw new Error(await extractErrorMessage(e, '排版失败，请重试'))
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
