/**
 * 纸张尺寸预设（竖版基准，像素 ≈ 125 DPI）。
 * 数值跟 services/designApi.ts 的 HANDOUT_SIZES 对齐（那边是横版，这里转成竖版），
 * 手抄报/上传图编辑/新建设计三处共用同一套，避免各写一份对不上。
 */
export interface PaperSize {
  key: string
  label: string
  /** 竖版宽高（横版时交换） */
  w: number
  h: number
}

export const PAPER_SIZES: PaperSize[] = [
  { key: 'a5', label: 'A5', w: 740, h: 1050 },
  { key: '16k', label: '16 开', w: 920, h: 1300 },
  { key: 'b5', label: 'B5', w: 880, h: 1250 },
  { key: 'a4', label: 'A4', w: 1050, h: 1480 },
  { key: 'b4', label: 'B4', w: 1250, h: 1770 },
  { key: '8k', label: '8 开', w: 1340, h: 1900 },
  { key: 'a3', label: 'A3', w: 1480, h: 2100 },
  { key: '4k', label: '4 开', w: 1840, h: 2600 },
]

export type Orientation = 'portrait' | 'landscape'

/** 按方向返回实际宽高 */
export function paperDims(p: PaperSize, orientation: Orientation): { width: number; height: number } {
  return orientation === 'portrait' ? { width: p.w, height: p.h } : { width: p.h, height: p.w }
}
