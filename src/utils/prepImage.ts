/**
 * 上传前预处理：图片超过 maxSide 或 maxBytes 就在浏览器里缩成 JPEG，
 * 减小上传体积、避免碰到大小限制。后端做识别/OCR/去水印用不到超大分辨率，
 * 3000px 足够。HEIC 等浏览器解不了的格式原样返回（交给后端处理）。
 */
export async function prepareUpload(
  file: File,
  opts: { maxSide?: number; maxBytes?: number; quality?: number } = {},
): Promise<File> {
  const { maxSide = 3000, maxBytes = 6 * 1024 * 1024, quality = 0.9 } = opts
  const isImage = file.type.startsWith('image/')
  const isHeic = /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  if (!isImage || isHeic) return file

  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    return file
  }
  const longest = Math.max(bmp.width, bmp.height)
  if (longest <= maxSide && file.size <= maxBytes) {
    bmp.close()
    return file
  }
  const scale = Math.min(1, maxSide / longest)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const blob: Blob = await new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('图片压缩失败'))), 'image/jpeg', quality),
  )
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}
