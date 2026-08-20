/**
 * 设计 token——图表/图例/图示/表格等 16 个可编辑组件共用的颜色、间距、字号、结构尺寸。
 * 迁移原则：结构尺寸（COMPONENT_SIZE）的数值必须跟迁移前逐一对应，不能顺带"顺便统一"，
 * 否则会改变已保存模板（seed.py / 用户自建模板）里现有实例的渲染高度/宽度。
 * 颜色类常量（NEUTRAL/STATUS/CHART_PALETTE/CIVIC_THEME）只影响"以后新建的实例"，
 * 因为每个组件实例的颜色一旦创建就以字面量存进 componentData，不会反向读取这里的值。
 */

/** 中性色——正文/次要文字、边框，所有组件共用同一套，不再各自散落十六进制 */
export const NEUTRAL = {
  textPrimary: '#374151',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  white: '#ffffff',
  black: '#000000',
} as const

/** 语义色——表达"好/坏/警示/信息"，SWOT 四象限这类语义组件用 */
export const STATUS = {
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
} as const

/** 分类色板——图表类组件按 index 取色，柱状/折线/横向柱/漏斗/金字塔/时间轴/色块图例/步骤流程共用同一份，
 * 不再各自维护一份相近但不同的紫粉色数组 */
export const CHART_PALETTE = ['#8b5cf6', '#ec4899', '#38bdf8', '#22c55e', '#f59e0b', '#6366f1'] as const

/** "展板/宣传栏"主题——政务/campaign 风格内容专属色板，跟上面的图表色板是两个不同语域，不强行合并。
 * 数值取自 2026 年安全生产月展板（tpl-board-safety-month-grid）已经实际验证过效果的配色。 */
export const CIVIC_THEME = {
  red: '#c8161d',
  redDark: '#a10f16',
  blue: '#1c6fb0',
  blueDark: '#0f5488',
  gold: '#f6c92e',
} as const

/** 间距台阶——组件内部/组件之间的通用留白 */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

/** 字号台阶——组件文字统一从这几档里选，不再随手写数字 */
export const FONT_SIZE = { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, xxl: 20, display: 52 } as const

/** 圆角台阶 */
export const RADIUS = { sm: 3, md: 6, lg: 10 } as const

/** 组件专属结构尺寸——同一视觉图案（"一行内容"的高度、徽标直径……）跨组件放在一处方便对比，
 * 但值先照抄各组件现状，不在这一步强行拉齐（拉齐要单独验证是否影响已有模板，留到下一阶段） */
export const COMPONENT_SIZE = {
  iconList: { badge: 22, rowH: 34, labelW: 180 },
  ribbon: { height: 32, tailW: 9, defaultW: 220 },
  table: { cellW: 90, cellH: 36 },
} as const
