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
  /** 极简微立体：近乎无色相，全靠柔光内凹外凸投影撑明暗层次，primary/accent 只做小面积点缀 */
  liti: ['#5b6b7a', '#8a94a3', '#333a45', '#f4f5f7', '#2b2f36'],
  /** 党政红金：跟 'red' 的区别不是颜色（两个都是红金），是 templates.ts 里专属的
   * 金色五角星+金线装饰——paper 用暖米色而不是冷灰，配合星纹更像官方文件质感 */
  dangzheng: ['#9c1d22', '#c9a227', '#5c0e12', '#faf4e8', '#2b1f1a'],
}
/** 主题 key → DeckTheme.style 的映射：命中的 key 会走各自专属的背景/卡片/封面装饰
 * （不用 AI 整页大图），没命中的一律是 'plain'（AI 图或代码淡纹通用底）。
 * key 和 style 值不一定同名（比如 'geoblue' 这个 key 对应的 style 是 'geo'，历史命名
 * 遗留），所以用映射表而不是简单判断"在不在某个集合里就用 key 本身当 style"。
 * 以后再加党政红金/水墨中国风时，这张表和 DeckTheme.style 的联合类型一起加一行。 */
export const STYLE_BY_THEME_KEY: Record<string, string> = {
  geoblue: 'geo',
  liti: 'liti',
  dangzheng: 'dangzheng',
}
/** @deprecated 只保留给还没来得及切换到 STYLE_BY_THEME_KEY 的旧引用用，新代码别用这个 */
export const GEO_THEME_KEYS = new Set(['geoblue'])
