import { authPostForm } from './httpClient'

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 证件照制作专用——本地跑 OpenCV Haar 级联检测人脸位置，零 AI 成本。
 * 返回坐标是相对图片宽高的 0~1 比例。检测不到人脸时 face 为 null，调用方要有兜底逻辑。
 */
export async function detectFace(imageFile: File): Promise<FaceBox | null> {
  const form = new FormData()
  form.append('image', imageFile, imageFile.name || 'photo.jpg')
  const result = await authPostForm<{ face: FaceBox | null }>('/detect-face', form, '人脸检测失败')
  return result.face
}
