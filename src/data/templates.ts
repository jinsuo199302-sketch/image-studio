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
      fontFamily?: string
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
  scene: string
  industry: string
  canvasWidth: number
  canvasHeight: number
  background: string
  thumbnail: string
  elements: CanvasElement[]
  createdAt?: string
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

export const SCENES = [
  '全部场景',
  '促销活动',
  '开业宣传',
  '门店物料',
  '内容封面',
  '感恩贺卡',
  '校园手抄报',
  '简历文档',
  '通知公文',
  '邀请函卡',
  '宣传展板',
]

export const INDUSTRIES = [
  '全部行业',
  '餐饮美食',
  '教育培训',
  '电商零售',
  '家居地产',
  '企业办公',
  '通用场景',
]

export const SORT_OPTIONS: { value: 'hot' | 'new'; label: string }[] = [
  { value: 'hot', label: '热门优先' },
  { value: 'new', label: '最新优先' },
]
