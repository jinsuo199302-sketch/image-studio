export type CanvasElement =
  | {
      type: 'text'
      x: number
      y: number
      width: number
      text: string
      fontSize: number
      fontWeight?: string
      color: string
      align?: 'left' | 'center' | 'right'
    }
  | {
      type: 'image'
      x: number
      y: number
      width: number
      height: number
      src: string
    }
  | {
      type: 'rect'
      x: number
      y: number
      width: number
      height: number
      fill: string
      rx?: number
    }

export interface Template {
  id: string
  name: string
  category: string
  canvasWidth: number
  canvasHeight: number
  background: string
  thumbnail: string
  elements: CanvasElement[]
}

export const CATEGORIES = [
  '全部分类',
  '广告设计',
  '宣传海报',
  '印刷制品',
  '电商营销',
  '自媒体配图',
  '创意手作',
  '职场文档',
]
