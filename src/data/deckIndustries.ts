/**
 * AI PPT「所属行业」预设——只是给用户一个省心的默认起点：选了之后自动带出常见配色主题 +
 * 版式偏好倾向（复用参考图那套 layouts/density 提示机制，不是新开一条链路）+ 一句内容方向提示
 * （拼进「补充要求」一起发给大纲模型，不占用户自己输入的字数）。
 *
 * 三样东西用户随时可以自己改掉：
 *  - 配色主题：选完行业还能再点别的颜色块，以最后点的为准
 *  - 背景开不开 / 详细度：这个 checkbox 完全不受行业影响，用户自己勾
 *  - 补充要求文本框：这里的内容永远是用户自己写的，行业提示是另外偷偷拼在后面发给模型，不占这 200 字
 *
 * 内容全部是"这个行业惯用什么色系/图标类别/版式偏好"这种行业通用常识（配色趋势、常见图解类型），
 * 不针对任何具体商业模板，参考的是各类行业模板站点的公开风格总结，不是照抄某一份成品设计。
 */
export interface DeckIndustryPreset {
  key: string
  label: string
  /** 配色主题：对应 AIPptTab 里 THEMES 的 key */
  theme: string
  /** 版式偏好（跟参考图分析返回的 layouts 同一个白名单），只是倾向不是强制 */
  layouts: string[]
  density: 'airy' | 'balanced' | 'packed'
  motif: 'hexagon' | 'circle' | 'arrow' | 'wedge' | 'line' | 'mixed'
  /** 拼进大纲生成 prompt 的一句内容方向提示（不算用户"补充要求"的字数） */
  hint: string
}

export const DECK_INDUSTRIES: DeckIndustryPreset[] = [
  {
    key: 'business',
    label: '通用商务',
    theme: 'blue',
    layouts: ['cards', 'stats', 'bar', 'big_number', 'compare', 'matrix'],
    density: 'balanced',
    motif: 'wedge',
    hint: '通用商务汇报风格：克制配色、强对比字号、每页留一个视觉焦点，避免堆砌花哨装饰。',
  },
  {
    key: 'work-report',
    label: '述职/工作总结',
    theme: 'blue',
    layouts: ['stats', 'bar', 'radar', 'waterfall', 'gauge', 'timeline'],
    density: 'balanced',
    motif: 'circle',
    hint: '述职/年终总结风格：多用关键指标、达成率、能力评估这类量化图表页，突出"做了什么、达成多少"。',
  },
  {
    key: 'medical',
    label: '医疗健康',
    theme: 'teal',
    layouts: ['stats', 'matrix', 'compare', 'table', 'radar', 'gauge'],
    density: 'balanced',
    motif: 'circle',
    hint: '医疗健康行业：配色洁净专业（蓝绿白为主），氛围图可含听诊器、十字、DNA双螺旋、分子结构等医学元素剪影，' +
      '绝不出现血腥、尖锐器械特写或恐慌情绪的画面。',
  },
  {
    key: 'education',
    label: '教育培训',
    theme: 'green',
    layouts: ['timeline', 'cards', 'list', 'bulb', 'tree', 'big_number'],
    density: 'airy',
    motif: 'circle',
    hint: '教育培训行业（面向成人学员/说课评审）：配色清新专业（绿蓝为主），氛围图可含书本、笔、灯泡、毕业帽等元素剪影，' +
      '整体简洁不幼稚，留白充足。',
  },
  {
    key: 'finance',
    label: '金融财务',
    theme: 'slate',
    layouts: ['bar', 'line', 'waterfall', 'gauge', 'table', 'stats'],
    density: 'packed',
    motif: 'line',
    hint: '金融财务行业：配色稳重（深蓝/藏青为主，金色点缀），氛围图可含增长曲线、天平、金融图标等元素剪影，' +
      '数据类图表页占比可以高一些，体现严谨专业。',
  },
  {
    key: 'tech',
    label: '科技互联网',
    theme: 'techblue',
    layouts: ['cards', 'stats', 'compare', 'big_number', 'spoke', 'hive'],
    density: 'balanced',
    motif: 'hexagon',
    hint: '科技互联网行业：科技蓝主色调，氛围图可含电路纹理、数据流光效、几何连线等元素，体现创新感和产品力。',
  },
  {
    key: 'gov',
    label: '政务党建',
    theme: 'red',
    layouts: ['timeline', 'matrix', 'big_number', 'quote', 'cards'],
    density: 'packed',
    motif: 'wedge',
    hint: '政务/党建汇报风格：红金庄重基调，版式严谨规整，不用俏皮/创意类装饰，突出权威感。' +
      '注意：不出现国徽/党徽/警徽等国家标志图形。',
  },
  {
    key: 'realestate',
    label: '地产工程',
    theme: 'slate',
    layouts: ['gallery', 'stats', 'matrix', 'table', 'compare'],
    density: 'balanced',
    motif: 'line',
    hint: '地产/工程行业：氛围图可含城市天际线、建筑轮廓、施工线条等元素剪影，配色沉稳（深灰蓝为主）。',
  },
  {
    key: 'legal',
    label: '法律合规',
    theme: 'slate',
    layouts: ['compare', 'matrix', 'table', 'list', 'timeline'],
    density: 'balanced',
    motif: 'line',
    hint: '法律合规行业：配色沉稳保守（深蓝/香槟金），氛围图可含天平、法槌、文书等元素剪影，版式严谨、少装饰花活。',
  },
  {
    key: 'hr',
    label: '人力资源',
    theme: 'purple',
    layouts: ['spoke', 'matrix', 'cards', 'stats', 'compare'],
    density: 'balanced',
    motif: 'circle',
    hint: '人力资源/组织管理行业：配色活力专业（紫蓝为主），氛围图可含人像剪影、团队协作等元素，' +
      '组织架构/岗位对比类内容优先用矩阵或对照版式。',
  },
  {
    key: 'retail',
    label: '零售电商',
    theme: 'red',
    layouts: ['gallery', 'big_number', 'bar', 'cards', 'stats'],
    density: 'packed',
    motif: 'wedge',
    hint: '零售电商行业：配色鲜活有活力（暖橙红为主），氛围图可含购物袋、促销标签、商品陈列等元素剪影，节奏明快。',
  },
  {
    key: 'lifestyle',
    label: '文旅生活',
    theme: 'green',
    layouts: ['timeline', 'gallery', 'cards', 'list'],
    density: 'airy',
    motif: 'circle',
    hint: '文旅/生活方式行业：配色清新自然（绿蓝为主），氛围图可含风景轮廓、路线、生活场景等元素剪影，留白充足、氛围感强。',
  },
]

export function findDeckIndustry(key: string): DeckIndustryPreset | undefined {
  return DECK_INDUSTRIES.find((x) => x.key === key)
}
