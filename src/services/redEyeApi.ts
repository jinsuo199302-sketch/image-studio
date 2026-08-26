import { authPostForm } from './httpClient'

/**
 * 证件照制作专用——本地跑 OpenCV 人脸+眼部检测，纠正闪光灯红眼，零 AI 成本。
 * 传入的是当前 data URL（比如已经抠好图的照片），转成 File 再上传。
 */
export async function fixRedEye(imageDataUrl: string): Promise<{ image: string; eyesFixed: number }> {
  const res = await fetch(imageDataUrl)
  const blob = await res.blob()
  const form = new FormData()
  form.append('image', blob, 'photo.png')
  const result = await authPostForm<{ data: Array<{ b64_json?: string }>; eyesFixed: number }>(
    '/fix-red-eye',
    form,
    '去红眼失败',
  )
  const b64 = result.data?.[0]?.b64_json
  if (!b64) throw new Error('去红眼接口返回结果为空')
  return { image: `data:image/png;base64,${b64}`, eyesFixed: result.eyesFixed }
}
