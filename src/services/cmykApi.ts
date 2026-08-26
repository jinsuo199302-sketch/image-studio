import { authPostForm } from './httpClient'

/**
 * 只给要送商业印刷厂（胶印/丝网印）用的场景——Pillow 的直接数学换算，不带 ICC 色彩管理，
 * 转出来的颜色不如专业软件准。普通冲印店/家用打印机认 RGB 就够，不需要这个。
 * 转出来的 CMYK JPEG 不能用 <img> 站内预览（大多数浏览器解码器不认），只用于直接下载。
 */
export async function convertToCmyk(pngDataUrl: string): Promise<string> {
  const res = await fetch(pngDataUrl)
  const blob = await res.blob()
  const form = new FormData()
  form.append('image', blob, 'photo.png')
  const result = await authPostForm<{ image: string }>('/convert-cmyk', form, 'CMYK 转换失败')
  return result.image
}
