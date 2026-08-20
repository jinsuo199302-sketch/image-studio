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
      stroke?: string
      strokeWidth?: number
      shadowColor?: string
      shadowBlur?: number
      shadowOffsetX?: number
      shadowOffsetY?: number
      /** 联网搜索提炼出的内容才有——来源链接 + 校验状态，编辑器选中面板会展示，不影响渲染 */
      source?: {
        url: string
        siteName: string
        confidence: 'verified' | 'extracted_unverified'
      }
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
  | {
      type: 'group'
      x: number
      y: number
      width?: number
      height?: number
      angle?: number
      children: GroupChildElement[]
      /** 图表/图例/表格这类"数据驱动"的组件才有：组件种类标识 + 对应数据，重新加载模板时优先按这个调用对应
       * builder 重新生成（拿到真正语义正确、双击还能继续编辑的组件），没有这两个字段就走 children 通用兜底重建 */
      componentKind?: string
      componentData?: unknown
    }

/** 组件（图表/图例/表格）内部的基础图形，坐标相对组内原点，用于把 Fabric Group 完整存进/读出模板 */
export type GroupChildElement =
  | { type: 'rect'; x: number; y: number; width: number; height: number; fill: string; stroke?: string; strokeWidth?: number; rx?: number }
  | { type: 'text'; x: number; y: number; width?: number; text: string; fontSize: number; fill: string; fontWeight?: string; textAlign?: string }
  | { type: 'circle'; x: number; y: number; radius: number; fill: string; stroke?: string; strokeWidth?: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; strokeLineCap?: string }
  | { type: 'path'; path: unknown; fill?: string; stroke?: string; strokeWidth?: number }

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
