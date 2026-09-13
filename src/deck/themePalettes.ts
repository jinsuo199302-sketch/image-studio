/** AI PPT 主题配色的兜底色板——大纲没给 palette（或用户没上传参考图）时用这套固定值。
 * 单独抽出来是因为 DeckHtmlPreview.vue（实际渲染）和 AIPptTab.vue（生成前的主题选择器
 * 预览）两处都要用同一份数据，之前各写一份很容易改一处忘了改另一处。 */
export const THEME_FALLBACK_PALETTES: Record<string, string[]> = {
  red: ['#b01f24', '#d99b2b', '#8c1519', '#f6f3ee', '#2b2b2b'],
  blue: ['#1f5fa8', '#e0a52b', '#123c6b', '#f5f7fa', '#2b2b2b'],
  green: ['#2f7d55', '#e0a52b', '#1f5c3d', '#f4f7f5', '#2b2b2b'],
  purple: ['#6b4ea8', '#e0a52b', '#463079', '#f6f4fa', '#2b2b2b'],
  slate: ['#37506b', '#c98a3c', '#243447', '#f4f6f8', '#2b2b2b'],
  teal: ['#1f7a72', '#e0a52b', '#134b46', '#f2f7f6', '#2b2b2b'],
  techblue: ['#1a3f7a', '#2f7de0', '#0d2951', '#f3f6fb', '#232a33'],
  geoblue: ['#12579e', '#3aa0e0', '#0c3b6b', '#f4f8fc', '#233240'],
}
/** 纯几何图形装饰风的主题 key（geoDeco 那套白底几何色块，不用 AI 大图） */
export const GEO_THEME_KEYS = new Set(['geoblue'])
