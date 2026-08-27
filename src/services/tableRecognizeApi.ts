import { authToken } from './httpClient'

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

/**
 * 表格照片 → xlsx。走 /api/ai/table-to-xlsx：后端让视觉模型把表格读成 JSON 二维数组，
 * openpyxl 生成 Excel 返回。跟「提字」同一条链路，一次 API 调用。
 */
export async function imageToXlsx(authenticated: boolean, imageDataUrl: string): Promise<Blob> {
  if (!authenticated) throw new Error('请先登录后再使用')
  const form = new FormData()
  form.append('image', await dataUrlToBlob(imageDataUrl), 'table.png')
  const res = await fetch('/api/ai/table-to-xlsx', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken()}` },
    body: form,
  })
  if (!res.ok) {
    let detail = `表格识别失败：${res.status}`
    try {
      const data = await res.json()
      if (data?.detail) detail = `表格识别失败：${data.detail}`
    } catch {
      /* 非 JSON 响应体 */
    }
    throw new Error(detail)
  }
  return res.blob()
}
