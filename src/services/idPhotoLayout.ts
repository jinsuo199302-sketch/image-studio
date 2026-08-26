/**
 * 证件照/遗像照片共用的排版计算——人脸自动裁剪定位 + 打印排版张数计算。
 * 抽成独立模块是因为"彩色证件照"和"黑白遗像"两个功能要复用同一套算法，
 * 不想维护两份几乎一样又容易走样的坐标计算代码。
 */

export interface FaceBoxLike {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 人脸检测框（Haar 级联）框住的大致是眉毛到下巴这一段，要往上/下/两侧扩一圈才是
 * "发际线到下巴+两耳"这个证件照真正要框的"头部"范围——这几个扩展系数是参考真实证件照
 * 头部占比标准估的，不是精确算出来的。
 */
export function computeHeadFrame(imgW: number, imgH: number, faceBox: FaceBoxLike | null) {
  if (faceBox) {
    const fx = faceBox.x * imgW
    const fy = faceBox.y * imgH
    const fw = faceBox.width * imgW
    const fh = faceBox.height * imgH
    const headTop = fy - fh * 0.65
    const headBottom = fy + fh * 1.15
    return {
      headHeight: headBottom - headTop,
      headCenterX: fx + fw / 2,
      headCenterY: (headTop + headBottom) / 2,
      hasFace: true,
    }
  }
  return { headHeight: imgH, headCenterX: imgW / 2, headCenterY: imgH / 2, hasFace: false }
}

export interface DrawRectParams {
  canvasW: number
  canvasH: number
  imgW: number
  imgH: number
  faceBox: FaceBoxLike | null
  zoom: number
  offsetX: number
  offsetY: number
  /** offsetX/offsetY 是在预览画布（低倍缩放）上量出来的像素值，导出画布分辨率不同时
   * 要按两个画布的倍数换算过去才能对上同一个位置 */
  offsetScale?: number
  /** 有人脸检测时头部占画布高度的比例，默认 0.65（参考真实证件照头部占比） */
  headFrac?: number
  /** 头部中心落在画布高度的比例位置，默认 0.4（上留白略少，下方留肩部空间） */
  centerYFrac?: number
}

export function computeDrawRect(params: DrawRectParams) {
  const { canvasW, canvasH, imgW, imgH, faceBox, zoom, offsetX, offsetY, offsetScale = 1 } = params
  const frame = computeHeadFrame(imgW, imgH, faceBox)
  const desiredHeadFrac = frame.hasFace ? (params.headFrac ?? 0.65) : 0.92
  const targetCenterYFrac = frame.hasFace ? (params.centerYFrac ?? 0.4) : 0.5
  const baseScale = (canvasH * desiredHeadFrac) / frame.headHeight
  const drawW = imgW * baseScale * zoom
  const drawH = imgH * baseScale * zoom
  const headCenterXScaled = frame.headCenterX * baseScale * zoom
  const headCenterYScaled = frame.headCenterY * baseScale * zoom
  const drawX = canvasW / 2 - headCenterXScaled + offsetX * offsetScale
  const drawY = canvasH * targetCenterYFrac - headCenterYScaled + offsetY * offsetScale
  return { drawX, drawY, drawW, drawH }
}

export interface PrintSheet {
  key: string
  label: string
  mmW: number
  mmH: number
}

/** 相纸尺寸——来自实际冲印行业的常见规格 */
export const PRINT_SHEETS: PrintSheet[] = [
  { key: '5inch', label: '5寸相纸 (89×127mm)', mmW: 89, mmH: 127 },
  { key: '6inch', label: '6寸相纸 (102×152mm)', mmW: 102, mmH: 152 },
  { key: '7inch', label: '7寸相纸 (127×178mm)', mmW: 127, mmH: 178 },
]

/**
 * 计算一张相纸上能规整摆下几张证件照——不是照抄某个冲印店"5寸=6张"这种写死的经验值
 * （不同店家边距/间距习惯不一样，数字对不上），是按实际相纸尺寸/照片尺寸/留白间距
 * 现算，photo 尺寸换个预设也自动适配。
 */
export function packGrid(sheetMmW: number, sheetMmH: number, photoMmW: number, photoMmH: number, marginMm = 5, gapMm = 3) {
  const usableW = sheetMmW - marginMm * 2
  const usableH = sheetMmH - marginMm * 2
  const cols = Math.max(1, Math.floor((usableW + gapMm) / (photoMmW + gapMm)))
  const rows = Math.max(1, Math.floor((usableH + gapMm) / (photoMmH + gapMm)))
  return { cols, rows, count: cols * rows, marginMm, gapMm }
}
