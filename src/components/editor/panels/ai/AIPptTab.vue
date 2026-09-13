<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { textToPptx, imagesToPptx } from '../../../../services/pdfApi'
import {
  generateDeck,
  generateDeckFromMaterial,
  uploadDeckPhotos,
  analyzeDeckReference,
  deckToPptx,
  convertImagePptx,
  type DeckResult,
  type DeckPhoto,
  type DeckRefStyle,
  type DeckBgDetail,
} from '../../../../services/designApi'
import { preloadSlideImages, type SlideData } from '../../../../utils/slideRender'
import { DECK_INDUSTRIES, findDeckIndustry } from '../../../../data/deckIndustries'
import { prepareUpload } from '../../../../utils/prepImage'
import { saveFile } from '../../../../utils/saveFile'
import { useAuthStore } from '../../../../stores/auth'
import SlidePreview from '../../SlidePreview.vue'
import DeckHtmlPreview from '../../DeckHtmlPreview.vue'
import { composeDeck, type DeckTheme } from '../../../../deck/templates'
import { THEME_FALLBACK_PALETTES, STYLE_BY_THEME_KEY } from '../../../../deck/themePalettes'

type Mode = 'ai' | 'text' | 'image' | 'convert'
const mode = ref<Mode>('ai')
const busy = ref(false)
const authStore = useAuthStore()

function saveBlob(blob: Blob, name: string) {
  return saveFile(name, blob)
}
async function run(fn: () => Promise<Blob>, name: string) {
  busy.value = true
  try {
    await saveBlob(await fn(), name)
    ElMessage.success('PPT 已生成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '生成失败，请重试')
  } finally {
    busy.value = false
  }
}

// ── AI 生成 ──────────────────────────────────────────────
const THEMES = [
  { key: 'auto', label: 'AI 智能配色' },
  { key: 'red', label: '党政红金' },
  { key: 'blue', label: '商务蓝' },
  { key: 'green', label: '清新绿' },
  { key: 'techblue', label: '科技蓝' },
  { key: 'geoblue', label: '几何蓝' },
  { key: 'liti', label: '极简微立体' },
  { key: 'purple', label: '典雅紫' },
  { key: 'slate', label: '沉稳蓝灰' },
  { key: 'teal', label: '青碧' },
]
// "先看图再选"而不是"先读文字标签再脑补"——每个主题现场渲染一张真实封面缩略图，
// 不是随手画几个色块示意；'auto' 没有固定色板，用一套代表性蓝色只是给个大致质感参考，
// 真实生成时 AI 会自己配色，跟这张预览图不会完全一样。
const THEME_PREVIEWS = computed(() =>
  THEMES.map((th) => {
    const p = THEME_FALLBACK_PALETTES[th.key] || THEME_FALLBACK_PALETTES.blue
    const style = (STYLE_BY_THEME_KEY[th.key] as DeckTheme['style']) || 'plain'
    const d = composeDeck({
      title: '示例标题文案',
      subtitle: '一句副标题占位文字',
      theme: { primary: p[0], accent: p[1], primaryDk: p[2], paper: p[3], ink: p[4], style },
      sections: [],
    })
    return { ...th, html: d.styleTag + d.slides[0] }
  }),
)
// composeDeck 每个主题输出的 <style> 都用同一套不带命名空间的类名（.s-cover/.cn1 这些），
// 9 张预览要是直接拼进同一个页面（哪怕分开塞进 9 个 v-html），这些 <style> 标签全部会落进
// 同一份文档的全局样式表——同名选择器打架，最后渲染出来的颜色只会是"最后一个主题"那一份，
// 9 张卡片看起来一模一样，"看图选主题"就名存实亡了。用 Shadow DOM 给每张卡片单独隔一个
// 样式作用域，同名类名互不干扰，这个坑是真实渲染测试时肉眼发现的，不是纸上谈兵想到的。
const previewHosts = ref<(HTMLElement | null)[]>([])
function mountPreviews() {
  THEME_PREVIEWS.value.forEach((th, i) => {
    const el = previewHosts.value[i]
    if (!el) return
    const root = el.shadowRoot || el.attachShadow({ mode: 'open' })
    root.innerHTML = th.html
  })
}
onMounted(mountPreviews)
watch(THEME_PREVIEWS, () => nextTick(mountPreviews))
const aiSource = ref<'topic' | 'material' | 'courseware'>('topic')

// ── 教学课件（第一步：通用教学流程，复用现有引擎，不做卡通视觉/精确数学图形）──
// 教材版本/学科/年级/学期/课题拼成一句 topic，外加一段固定的"教学环节"要求塞进 extra，
// 复用 generateDeck 同一条链路，不需要新接口、新组件。
const CW_EDITIONS = ['人教版', '北师大版', '苏教版', '西师大版', '青岛版', '冀教版', '通用']
const CW_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '道德与法治', '科学', '通用']
const CW_GRADES = [
  '一年级', '二年级', '三年级', '四年级', '五年级', '六年级',
  '七年级', '八年级', '九年级', '高一', '高二', '高三',
]
const cwEdition = ref('人教版')
const cwSubject = ref('数学')
const cwGrade = ref('三年级')
const cwSemester = ref<'上册' | '下册'>('上册')
const cwLesson = ref('')
// 课件内容来源：填课题（AI 自己出内容）或传资料（老师已经整理好的图片/文字/文档，
// AI 只重新组织结构、不能编内容）——跟顶层"填主题/传资料"是同一个思路，复用同一套
// matFile/matText 状态和上传逻辑，不用再声明一套
const cwSource = ref<'topic' | 'material'>('topic')
/** 资料模式下追加的一句提醒——防止 AI 把"按教学环节组织"理解成"可以为了凑环节编内容"，
 * 资料里没有的例题/练习题不能瞎编，只能整理老师已经给的内容。 */
const CW_EXTRA_MATERIAL_NOTE =
  '这次是老师上传的现成资料（教案/讲义/图片扫描件等），把资料内容分配进上面这几个教学' +
  '环节时只做结构整理，不能编造资料里没有的例题、数据或练习题；资料本来没有的环节（比如' +
  '没给课堂练习题）可以由你酌情补充，但补充的内容要明显标注是补充、不是资料原文。'
/** 固定的教学环节指导，塞进 extra 最前面（用户自己写的补充要求接在后面，不覆盖）。
 * v2（第一版实测反馈"知识点太少、孩子看不懂"之后重写）：光给环节顺序不够，AI 会把每个
 * 环节压成两三行干巴巴的结论——真实教辅课件的信息密度和讲解深度比企业汇报高得多，
 * 必须把"每个环节大概要多少内容、讲到什么细致程度"明确写出来，不能指望它自己拿捏。 */
const CW_EXTRA_TEMPLATE =
  '这是一份中小学课堂教学课件（不是企业商务汇报，不能走"背景/优势/规划"那种空泛路子），' +
  '要写得像真正有教学经验的老师备的课——内容密度和讲解深度要接近教辅材料的水准，' +
  '不能每个环节只放两三行结论就完事，宁可多分几页也不能把内容压得太薄。' +
  '按下面 7 个教学环节组织（sections 依次是这 7 个，每个环节按说明控制篇幅，' +
  '内容多的环节允许拆成 2~3 页 slides，不要硬塞进一页）：\n' +
  '1）复习导入：简要回顾 1~2 个旧知识点作为铺垫，引出本课课题。\n' +
  '2）新课讲解：不能只甩结论——要把"为什么"讲清楚（这个规则/原理成立的道理是什么），' +
  '再给出结论性的规则表述；概念讲解要拆解到位，不要一句话带过。\n' +
  '3）例题精讲：给 2 道典型例题（难度递进或覆盖不同情况，比如加法和减法各一道），' +
  '每道都要写出完整的分步解题过程（观察题目→分析方法→动手计算→得出结果，' +
  '每一步都写清楚在做什么、为什么这么做），例题讲完之后必须专门加一条"发现规律"的总结——' +
  '明确点出这几道例题共同体现的规律是什么，这是帮学生从个例上升到方法的关键一步，不能省略。\n' +
  '4）课堂练习：至少 5~6 道供学生当堂做的题，覆盖纯计算题和至少一道生活情境应用题' +
  '（比如分蛋糕、读书进度这类学生熟悉的场景），每道题都要给参考答案（答案单独标注，' +
  '别跟题干混在一起，方便老师直接核对，不用等学生做完才揭晓）。\n' +
  '5）拓展变式：在课堂练习基础上再进一步——出 1~2 道变换了呈现形式或难度更高的题' +
  '（比如把文字题换成图示型、或者反过来考"给定结果倒推条件"这类思维拓展题），' +
  '同样给参考答案；如果这节内容有便于记忆的规律，可以在这里或课堂小结给一句朗朗上口的' +
  '顺口溜/口诀帮学生记忆。\n' +
  '6）课堂小结：提炼本课 2~4 条要点，语言精炼、便于学生课后回顾记忆。\n' +
  '7）作业布置：2~3 条课后作业，可以是课本习题+一条联系生活实际的实践性作业。\n' +
  '整体语言要有课堂讲解的语气（多用"我们来看看""想一想""你能自己试试吗"这类引导性表达），' +
  '不要写成书面说明文；例题和练习题的学科内容必须准确无误、数字必须算对，不能出现知识性错误。'
const topic = ref('')
const sections = ref(4)
const theme = ref('auto')
const extra = ref('')
const aiBg = ref(false)
const isGeoTheme = computed(() => theme.value === 'geoblue')
// 正文底图详细度：只有非几何风 + 勾了 AI 生成整套背景 才有意义（几何风的 aiBg 是配图，不是整页背景）
const bgDetail = ref<DeckBgDetail>('shared')
const BG_DETAIL_OPTS: { value: DeckBgDetail; label: string; hint: string }[] = [
  { value: 'shared', label: '全篇复用（快，约 2~4 分钟）', hint: '封面/章节/正文各一张，正文页背景都一样' },
  { value: 'section', label: '每章节一张（中等，约 4~7 分钟）', hint: '每个章节的正文页换一张贴合该章节的图' },
  { value: 'slide', label: '每页独立配图（最丰富，约 8~15 分钟）', hint: '每一页正文都单独配一张贴合这页内容的图，风格可能不如前两档统一' },
]
const deck = ref<DeckResult | null>(null)
const generating = ref(false)

// 所属行业（可选）：选了自动带出配色主题建议 + 版式偏好倾向 + 一句内容方向提示，
// 三者用户随时能自己改（再点别的颜色块 / 参考图分析结果优先 / 补充要求照常自己写）
const industry = ref('')
function pickIndustry(key: string) {
  industry.value = industry.value === key ? '' : key
  if (industry.value) theme.value = findDeckIndustry(industry.value)?.theme || theme.value
}

// 参考风格图：上传一张喜欢的模板 → 判断风格 + 提取配色
const refInput = ref<HTMLInputElement>()
const refStyle = ref<DeckRefStyle | null>(null)
const refBusy = ref(false)
const REF_LABEL: Record<string, string> = { geoblue: '几何图形风', techblue: '照片背景风', auto: '简约风' }
const LAYOUT_LABEL: Record<string, string> = {
  cards: '卡片', list: '清单', timeline: '时间轴', spoke: '辐射', hive: '蜂窝', cycle: '循环',
  matrix: '四象限', swot: 'SWOT', gallery: '图墙', stats: '指标', bar: '条形图', big_number: '大数字', quote: '金句',
  radar: '雷达图', waterfall: '瀑布图', gauge: '仪表盘',
}
const DENSITY_LABEL: Record<string, string> = { airy: '留白', balanced: '适中', packed: '饱满' }
async function pickRef(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  refBusy.value = true
  try {
    const p = await prepareUpload(f)
    const r = await analyzeDeckReference(p)
    refStyle.value = r
    theme.value = r.theme
    aiBg.value = r.ai_bg
    const lay = r.layouts?.length ? ` · 偏好版式 ${r.layouts.map((k) => LAYOUT_LABEL[k] || k).join('/')}` : ''
    ElMessage.success(`已识别：${REF_LABEL[r.theme] || r.theme}${r.mood ? ' · ' + r.mood : ''}${lay}`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '参考图分析失败')
  } finally {
    refBusy.value = false
  }
}

// 传资料生成
const matFile = ref<File | null>(null)
const matFileInput = ref<HTMLInputElement>()
const matText = ref('')
function pickMatFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  if (f.size > 20 * 1024 * 1024) {
    ElMessage.warning('文件最大 20MB')
    return
  }
  matFile.value = f
}

// AI 配图：上传真实照片，AI 自动分到合适的页
const deckPhotos = ref<{ file: File; url: string }[]>([])
const photoInput = ref<HTMLInputElement>()
async function pickPhotos(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  for (const f of picked) {
    if (deckPhotos.value.length >= 12) {
      ElMessage.warning('最多 12 张配图')
      break
    }
    const p = await prepareUpload(f)
    deckPhotos.value.push({ file: p, url: URL.createObjectURL(p) })
  }
}
function rmPhoto(i: number) {
  URL.revokeObjectURL(deckPhotos.value[i].url)
  deckPhotos.value.splice(i, 1)
}

async function genDeck() {
  const useCourseware = aiSource.value === 'courseware'
  // 课件模式下"传资料"跟顶层"传资料"是同一件事（老师上传的现成材料），走的是
  // generateDeckFromMaterial 那条链路；课件+填课题 / 顶层填主题 都走 generateDeck
  const useMaterial = aiSource.value === 'material' || (useCourseware && cwSource.value === 'material')
  if (useMaterial) {
    if (!matFile.value && matText.value.trim().length < 20) {
      ElMessage.warning('上传资料文件，或粘贴至少几句文字')
      return
    }
  } else if (useCourseware) {
    if (!cwLesson.value.trim()) {
      ElMessage.warning('先填课题（比如：分数的简单计算）')
      return
    }
  } else if (!topic.value.trim()) {
    ElMessage.warning('先填 PPT 主题')
    return
  }
  generating.value = true
  deck.value = null
  try {
    let photos: DeckPhoto[] = []
    if (deckPhotos.value.length) {
      photos = await uploadDeckPhotos(deckPhotos.value.map((p) => p.file))
    }
    const refPal = refStyle.value?.palette ?? []
    // 参考图里原样抠出来的通用符号角标（换个话题也不违和的那种），有就直接复用这张真实元素，
    // 不再现生成一张 AI 重新演绎的角标插画
    const refHero = refStyle.value?.elements?.[0]?.url ?? ''
    // 课件模式没有单独的行业预设，直接固定用"教育培训"那套（清新绿+书本/灯泡剪影），
    // 用户选了别的配色主题（theme.value）时以用户选的为准，这里只提供版式/氛围倾向
    const industryPreset = useCourseware
      ? findDeckIndustry('education')
      : industry.value
        ? findDeckIndustry(industry.value)
        : undefined
    // 参考图是直接分析上传图得出的，比行业预设这种通用兜底更具体——同时有的话参考图优先
    const refHints = refStyle.value
      ? {
          layouts: refStyle.value.layouts ?? [],
          density: refStyle.value.density ?? '',
          motif: refStyle.value.motif ?? '',
        }
      : industryPreset
        ? { layouts: industryPreset.layouts, density: industryPreset.density, motif: industryPreset.motif }
        : {}
    // 课件模式：固定的教学环节要求放最前面（传资料时额外加一句"不能编内容"提醒），
    // 行业氛围提示+用户自己写的补充要求接在后面
    const cwSourceNote = useMaterial ? CW_EXTRA_MATERIAL_NOTE : ''
    // 课件+传资料时资料本身没有"课题"这个概念，把教材版本/学科/年级信息塞进 extra
    // 当背景提示（不强制，帮 AI 判断难度和措辞），而不是拼进不存在的 topic 字段
    const cwContextNote = useCourseware
      ? `资料背景：${cwEdition.value}${cwSubject.value}${cwGrade.value}${cwSemester.value}${cwSource.value === 'topic' ? `《${cwLesson.value.trim()}》` : ''}。`
      : ''
    const effExtra = useCourseware
      ? [cwContextNote, CW_EXTRA_TEMPLATE, cwSourceNote, extra.value.trim()].filter(Boolean).join('；')
      : [industryPreset?.hint, extra.value.trim()].filter(Boolean).join('；')
    const effTopic = useCourseware
      ? `${cwEdition.value}${cwSubject.value}${cwGrade.value}${cwSemester.value}《${cwLesson.value.trim()}》教学课件`
      : topic.value.trim()
    // 教学环节固定 7 个（复习导入/新课讲解/例题精讲/课堂练习/拓展变式/课堂小结/作业布置），
    // 不用用户在"填主题"模式下调的章节数滑块
    const effSections = useCourseware ? 7 : sections.value
    const effBgDetail = isGeoTheme.value ? 'shared' : bgDetail.value
    const r = useMaterial
      ? await generateDeckFromMaterial(
          { file: matFile.value ?? undefined, pastedText: matText.value.trim() || undefined },
          effSections,
          theme.value,
          effExtra,
          aiBg.value,
          photos,
          refPal,
          refHints,
          effBgDetail,
          refHero,
        )
      : await generateDeck(
          effTopic,
          effSections,
          theme.value,
          effExtra,
          aiBg.value,
          photos,
          refPal,
          refHints,
          effBgDetail,
          refHero,
        )
    await preloadSlideImages(r.slides as unknown as SlideData[])
    deck.value = r
    await nextTick()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '生成失败，请重试')
  } finally {
    generating.value = false
  }
}

async function downloadDeck() {
  if (!deck.value) return
  busy.value = true
  try {
    const blob = await deckToPptx(deck.value.slides, deck.value.theme, deck.value.title)
    await saveFile(`${deck.value.title || '演示文稿'}.pptx`, blob)
    ElMessage.success('PPTX 已导出')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '导出失败')
  } finally {
    busy.value = false
  }
}

// ── 文字/图片转 PPT（原有）───────────────────────────────
const text = ref('')
const title = ref('')
const imgs = ref<{ file: File; url: string }[]>([])
const imgInput = ref<HTMLInputElement>()
async function pickImgs(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  for (const f of picked) {
    if (imgs.value.length >= 60) {
      ElMessage.warning('最多 60 张')
      break
    }
    const prepped = await prepareUpload(f)
    imgs.value.push({ file: prepped, url: URL.createObjectURL(prepped) })
  }
}
function moveImg(i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= imgs.value.length) return
  ;[imgs.value[i], imgs.value[j]] = [imgs.value[j], imgs.value[i]]
}
function rmImg(i: number) {
  URL.revokeObjectURL(imgs.value[i].url)
  imgs.value.splice(i, 1)
}

// ── 截图型 PPT 转可编辑（新）─────────────────────────────
const convertFile = ref<File | null>(null)
const convertFileInput = ref<HTMLInputElement>()
function pickConvertFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  if (f.size > 40 * 1024 * 1024) {
    ElMessage.warning('文件最大 40MB')
    return
  }
  convertFile.value = f
}
async function runConvert() {
  if (!convertFile.value) return
  generating.value = true
  deck.value = null
  try {
    const r = await convertImagePptx(convertFile.value)
    await preloadSlideImages(r.slides as unknown as SlideData[])
    deck.value = r
    await nextTick()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '转换失败，请重试')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex gap-1.5 px-3 pt-3">
      <button
        v-for="m in (['ai', 'text', 'image', 'convert'] as const)"
        :key="m"
        class="flex-1 rounded-full border px-2 py-1 text-[11px] transition"
        :class="mode === m ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m"
      >
        {{ m === 'ai' ? 'AI 生成' : m === 'text' ? '文字转PPT' : m === 'image' ? '图片转PPT' : '截图转可编辑' }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <!-- ============ AI 生成 ============ -->
      <template v-if="mode === 'ai'">
        <el-alert
          :title="
            !authStore.isAuthenticated
              ? '演示模式：登录后使用'
              : aiSource === 'material'
                ? '传资料 / 粘长文 / 上传现成 PPT → AI 提炼内容并按新主题重新设计，内容来自你的资料'
                : aiSource === 'courseware'
                  ? cwSource === 'material'
                    ? '传教案/图片/文档 → AI 按课堂教学环节重新整理，不编造资料没有的内容'
                    : '填教材版本+课题 → AI 按课堂教学环节（导入/新课/例题/练习/小结/作业）排一套课件'
                  : '填主题 → AI 排一套幻灯片，可下载 PPTX 在 PowerPoint 里改'
          "
          :type="authStore.isAuthenticated ? 'success' : 'info'"
          :closable="false"
          show-icon
        />

        <div class="flex gap-1.5">
          <button
            v-for="s in (['topic', 'material', 'courseware'] as const)"
            :key="s"
            class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
            :class="aiSource === s ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="aiSource = s"
          >
            {{ s === 'topic' ? '填主题' : s === 'material' ? '传资料 / 粘长文' : '教学课件' }}
          </button>
        </div>

        <template v-if="aiSource === 'courseware'">
          <div>
            <p class="mb-1 text-xs text-gray-500">教材版本</p>
            <div class="grid grid-cols-4 gap-1.5">
              <button
                v-for="ed in CW_EDITIONS"
                :key="ed"
                class="rounded-md border px-1.5 py-1 text-[11px] transition"
                :class="cwEdition === ed ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
                @click="cwEdition = ed"
              >
                {{ ed }}
              </button>
            </div>
          </div>
          <div>
            <p class="mb-1 text-xs text-gray-500">学科</p>
            <div class="grid grid-cols-4 gap-1.5">
              <button
                v-for="sub in CW_SUBJECTS"
                :key="sub"
                class="rounded-md border px-1.5 py-1 text-[11px] transition"
                :class="cwSubject === sub ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
                @click="cwSubject = sub"
              >
                {{ sub }}
              </button>
            </div>
          </div>
          <div class="flex gap-1.5">
            <el-select v-model="cwGrade" size="small" class="!flex-1">
              <el-option v-for="g in CW_GRADES" :key="g" :label="g" :value="g" />
            </el-select>
            <div class="flex flex-1 gap-1.5">
              <button
                v-for="sm in (['上册', '下册'] as const)"
                :key="sm"
                class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
                :class="cwSemester === sm ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
                @click="cwSemester = sm"
              >
                {{ sm }}
              </button>
            </div>
          </div>
          <div class="flex gap-1.5">
            <button
              v-for="s in (['topic', 'material'] as const)"
              :key="s"
              class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
              :class="cwSource === s ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="cwSource = s"
            >
              {{ s === 'topic' ? '填课题' : '传资料（教案/图片/文档）' }}
            </button>
          </div>
          <el-input
            v-if="cwSource === 'topic'"
            v-model="cwLesson"
            size="small"
            placeholder="课题，例：分数的简单计算"
            maxlength="30"
          />
          <template v-else>
            <input
              ref="matFileInput"
              type="file"
              accept=".docx,.pdf,.pptx,.txt,.md,image/*"
              class="hidden"
              @change="pickMatFile"
            />
            <div
              v-if="!matFile"
              class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
              @click="matFileInput?.click()"
            >
              <el-icon :size="20"><UploadFilled /></el-icon>
              <span class="text-[11px]">上传教案 / 讲义 / 图片扫描件（拍照或截图也行）</span>
            </div>
            <div
              v-else
              class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs"
            >
              <span class="truncate text-gray-600">{{ matFile.name }}</span>
              <button class="ml-2 shrink-0 text-gray-400 hover:text-red-400" @click="matFile = null">
                <el-icon :size="13"><Close /></el-icon>
              </button>
            </div>
            <el-input
              v-model="matText"
              type="textarea"
              :rows="4"
              size="small"
              maxlength="24000"
              :placeholder="matFile ? '（已选文件，这里可留空）也可以直接粘贴补充文字' : '或直接把教案 / 讲稿文字粘贴进来'"
            />
            <el-input v-model="cwLesson" size="small" placeholder="课题（可选，帮 AI 更好理解资料）" maxlength="30" />
          </template>
        </template>

        <el-input
          v-if="aiSource === 'topic'"
          v-model="topic"
          size="small"
          placeholder="PPT 主题，例：中小学消防安全教育"
          maxlength="40"
        />

        <template v-else-if="aiSource === 'material'">
          <input
            ref="matFileInput"
            type="file"
            accept=".docx,.pdf,.pptx,.txt,.md,image/*"
            class="hidden"
            @change="pickMatFile"
          />
          <div
            v-if="!matFile"
            class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
            @click="matFileInput?.click()"
          >
            <el-icon :size="20"><UploadFilled /></el-icon>
            <span class="text-[11px]">上传 Word / PDF / 现成 PPT / txt / 图片（拍照或截图）</span>
          </div>
          <div
            v-else
            class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs"
          >
            <span class="truncate text-gray-600">{{ matFile.name }}</span>
            <button class="ml-2 shrink-0 text-gray-400 hover:text-red-400" @click="matFile = null">
              <el-icon :size="13"><Close /></el-icon>
            </button>
          </div>
          <el-input
            v-model="matText"
            type="textarea"
            :rows="4"
            size="small"
            maxlength="24000"
            :placeholder="matFile ? '（已选文件，这里可留空）也可以直接粘贴补充文字' : '或直接把备课稿 / 讲话稿 / 材料粘贴进来'"
          />
        </template>

        <div>
          <p class="mb-1 text-xs text-gray-500">配图（可选）· AI 自动放到合适的页</p>
          <input ref="photoInput" type="file" accept="image/*" multiple class="hidden" @change="pickPhotos" />
          <div v-if="deckPhotos.length" class="mb-1.5 grid grid-cols-4 gap-1.5">
            <div
              v-for="(p, i) in deckPhotos"
              :key="p.url"
              class="group relative overflow-hidden rounded-md border border-gray-200"
            >
              <img :src="p.url" class="h-14 w-full object-cover" />
              <button
                class="absolute right-0.5 top-0.5 rounded bg-black/45 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                @click="rmPhoto(i)"
              >
                <el-icon :size="10"><Close /></el-icon>
              </button>
            </div>
          </div>
          <button
            v-if="deckPhotos.length < 12"
            class="w-full rounded-md border border-dashed border-gray-300 py-1.5 text-[11px] text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
            @click="photoInput?.click()"
          >
            + 选择照片（活动照 / 现场图 / 作品图，最多 12 张）
          </button>
        </div>

        <div v-if="aiSource !== 'courseware'" class="flex items-center gap-3">
          <span class="shrink-0 text-xs text-gray-500">章节数</span>
          <el-slider v-model="sections" :min="2" :max="6" :step="1" show-stops :show-tooltip="false" class="!flex-1" />
          <span class="w-4 text-xs text-gray-400">{{ sections }}</span>
        </div>
        <p v-else class="text-[11px] text-gray-400">
          教学环节固定 7 步：复习导入 · 新课讲解 · 例题精讲 · 课堂练习 · 拓展变式 · 课堂小结 · 作业布置
        </p>
        <div v-if="aiSource !== 'courseware'">
          <p class="mb-1 text-xs text-gray-500">
            所属行业（可选）
            <span class="text-gray-300">· 只是带个默认配色/版式偏好，下面还能自己改</span>
          </p>
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="ind in DECK_INDUSTRIES"
              :key="ind.key"
              class="rounded-md border px-1.5 py-1 text-[11px] transition"
              :class="industry === ind.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="pickIndustry(ind.key)"
            >
              {{ ind.label }}
            </button>
          </div>
        </div>
        <div>
          <p class="mb-1 text-xs text-gray-500">配色主题（点缩略图直接看效果，不用靠猜）</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="(th, previewIdx) in THEME_PREVIEWS"
              :key="th.key"
              class="w-[104px] overflow-hidden rounded-md border text-left transition"
              :class="theme === th.key ? 'border-violet-500 ring-1 ring-violet-500' : 'border-gray-200'"
              @click="theme = th.key"
            >
              <div class="pointer-events-none overflow-hidden" style="width:104px;height:58.5px">
                <div
                  :ref="(el) => { previewHosts[previewIdx] = el as HTMLElement | null }"
                  style="width:1280px;height:720px;transform:scale(0.08125);transform-origin:top left"
                />
              </div>
              <div
                class="truncate px-1.5 py-1 text-[11px]"
                :class="theme === th.key ? 'bg-violet-50 text-violet-600' : 'text-gray-500'"
              >
                {{ th.label }}
              </div>
            </button>
          </div>
          <input ref="refInput" type="file" accept="image/*" class="hidden" @change="pickRef" />
          <button
            class="mt-1.5 w-full rounded-md border border-dashed border-gray-300 py-1.5 text-[11px] text-gray-400 transition hover:border-violet-400 hover:text-violet-500 disabled:opacity-50"
            :disabled="refBusy"
            @click="refInput?.click()"
          >
            {{ refBusy ? '识别中…' : '↑ 上传一张喜欢的模板图，按它的风格生成' }}
          </button>
          <div v-if="refStyle" class="mt-1 space-y-1 text-[11px] text-gray-500">
            <div class="flex items-center gap-1.5">
              <span class="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600">{{ REF_LABEL[refStyle.theme] || refStyle.theme }}</span>
              <span
                v-for="c in refStyle.palette.slice(0, 5)"
                :key="c"
                class="h-3 w-3 shrink-0 rounded-sm border border-gray-200"
                :style="{ background: c }"
              />
              <span class="ml-auto cursor-pointer text-gray-400 hover:text-red-400" @click="refStyle = null">清除</span>
            </div>
            <div v-if="refStyle.layouts?.length" class="text-gray-400">
              偏好版式：{{ refStyle.layouts.map((k) => LAYOUT_LABEL[k] || k).join(' / ')
              }}<template v-if="refStyle.density"> · 排版{{ DENSITY_LABEL[refStyle.density] || refStyle.density }}</template>
              <span class="text-gray-300">（引导 AI 选版式，版面由我们自己排）</span>
            </div>
          </div>
        </div>
        <el-input
          v-model="extra"
          type="textarea"
          :rows="2"
          size="small"
          maxlength="200"
          :placeholder="
            aiSource === 'material'
              ? '补充要求（可选）：例 面向家长、控制在 10 页内、语气正式'
              : aiSource === 'courseware'
                ? '补充要求（可选）：例 多配练习题、突出实际生活应用'
                : '补充要求（可选）：例 面向小学生、突出案例、语气正式'
          "
        />
        <label class="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-2 text-xs">
          <el-checkbox v-model="aiBg" class="!h-4" />
          <span v-if="isGeoTheme" class="text-gray-600">
            AI 按主题生成配图（嵌进六边形 / 三角形图框）<br />
            <span class="text-[11px] text-gray-400">几何风：AI 生成 4~6 张相关照片自动排进图文页；多花 2~4 分钟</span>
          </span>
          <span v-else class="text-gray-600">
            AI 生成整套背景（封面 + 章节页设计图 + 正文页底图）<br />
            <span class="text-[11px] text-gray-400">AI 按主题画好背景，我们叠文字和图标；多花 2~4 分钟</span>
          </span>
        </label>
        <div v-if="aiBg && !isGeoTheme" class="rounded-md border border-gray-200 p-2 text-xs">
          <div class="mb-1.5 text-gray-600">正文底图详细度</div>
          <el-radio-group v-model="bgDetail" class="!flex !flex-col !gap-1.5">
            <el-radio v-for="opt in BG_DETAIL_OPTS" :key="opt.value" :value="opt.value" class="!m-0 !h-auto !items-start !py-0.5">
              <div class="whitespace-normal text-left leading-tight">
                <div class="text-gray-700">{{ opt.label }}</div>
                <div class="text-[11px] text-gray-400">{{ opt.hint }}</div>
              </div>
            </el-radio>
          </el-radio-group>
        </div>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="generating"
          :disabled="
            aiSource === 'topic'
              ? !topic.trim()
              : aiSource === 'courseware'
                ? cwSource === 'topic'
                  ? !cwLesson.trim()
                  : !matFile && matText.trim().length < 20
                : !matFile && matText.trim().length < 20
          "
          @click="genDeck"
        >
          {{
            generating
              ? aiBg
                ? !isGeoTheme && bgDetail === 'slide'
                  ? 'AI 逐页画背景 + 排版中…（约 8~15 分钟）'
                  : !isGeoTheme && bgDetail === 'section'
                    ? 'AI 画背景 + 排版中…（约 4~7 分钟）'
                    : 'AI 画背景 + 排版中…（约 2~4 分钟）'
                : aiSource === 'material'
                  ? 'AI 提炼重组中…（约 1~3 分钟）'
                  : 'AI 排版中…（约 20~40 秒）'
              : '生成 PPT'
          }}
        </el-button>
      </template>

      <!-- ============ 文字转 PPT ============ -->
      <template v-else-if="mode === 'text'">
        <el-alert title="把大纲文字做成 PPT。本地生成，不调模型。" type="info" :closable="false" show-icon />
        <el-input v-model="title" size="small" placeholder="演示标题（可选）" />
        <el-input
          v-model="text"
          type="textarea"
          :rows="12"
          resize="none"
          placeholder="# 演示标题&#10;&#10;## 第一部分&#10;- 要点一&#10;- 要点二&#10;&#10;## 第二部分&#10;..."
        />
        <p class="text-[11px] text-gray-400">一级标题（# 或「一、」）= 一页，其下的段落/条目 = 该页要点</p>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!text.trim()"
          @click="run(() => textToPptx(text, title.trim()), 'outline.pptx')"
        >
          生成 PPT
        </el-button>
      </template>

      <!-- ============ 图片转 PPT ============ -->
      <template v-else-if="mode === 'image'">
        <el-alert title="每张图片一页。本地生成。" type="info" :closable="false" show-icon />
        <input ref="imgInput" type="file" accept="image/*" multiple class="hidden" @change="pickImgs" />
        <div
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="imgInput?.click()"
        >
          <el-icon :size="22"><UploadFilled /></el-icon>
          <span class="text-xs">选择图片，每张一页（可多选，最多 60 张）</span>
        </div>
        <div v-if="imgs.length" class="grid grid-cols-3 gap-2">
          <div v-for="(p, i) in imgs" :key="p.url" class="group relative overflow-hidden rounded-md border border-gray-200">
            <img :src="p.url" class="h-24 w-full object-cover" />
            <div class="absolute inset-x-0 top-0 flex justify-between bg-black/40 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
              <span class="text-[11px] text-white">{{ i + 1 }}</span>
              <div class="flex gap-1">
                <button class="text-white disabled:opacity-30" :disabled="i === 0" @click="moveImg(i, -1)">
                  <el-icon :size="12"><ArrowUp /></el-icon>
                </button>
                <button class="text-white disabled:opacity-30" :disabled="i === imgs.length - 1" @click="moveImg(i, 1)">
                  <el-icon :size="12"><ArrowDown /></el-icon>
                </button>
                <button class="text-white hover:text-red-300" @click="rmImg(i)">
                  <el-icon :size="12"><Close /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!imgs.length"
          @click="run(() => imagesToPptx(imgs.map((x) => x.file)), 'slides.pptx')"
        >
          生成 PPT
        </el-button>
      </template>

      <!-- ============ 截图型 PPT 转可编辑 ============ -->
      <template v-else-if="mode === 'convert'">
        <el-alert
          title="给「每页都是一张整图，PowerPoint 里选不中文字」的截图型 PPT 用：AI 逐页拆出文字和插画，重排成原生可编辑形状。最多 12 页，比例差异大的可能会拉伸。"
          type="info"
          :closable="false"
          show-icon
        />
        <input ref="convertFileInput" type="file" accept=".pptx" class="hidden" @change="pickConvertFile" />
        <div
          v-if="!convertFile"
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="convertFileInput?.click()"
        >
          <el-icon :size="22"><UploadFilled /></el-icon>
          <span class="text-xs">上传截图型 PPT（.pptx）</span>
        </div>
        <div v-else class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs">
          <span class="truncate text-gray-600">{{ convertFile.name }}</span>
          <button class="ml-2 shrink-0 text-gray-400 hover:text-red-400" @click="convertFile = null">
            <el-icon :size="13"><Close /></el-icon>
          </button>
        </div>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="generating"
          :disabled="!convertFile"
          @click="runConvert"
        >
          {{ generating ? 'AI 拆图层中…（每页约需十几秒）' : '开始转换' }}
        </el-button>
      </template>

      <!-- ============ 生成结果（AI 生成 / 截图转可编辑 共用）============ -->
      <template v-if="deck && (mode === 'ai' || mode === 'convert')">
        <div class="pt-1 text-xs font-medium text-gray-600">{{ deck.title }}</div>

        <!-- 主：CSS 模板排版 → 浏览器转可编辑 PPTX -->
        <DeckHtmlPreview v-if="deck.outline" :outline="deck.outline" :theme-key="deck.theme" :bg="deck.bg" />
        <p v-if="deck.outline" class="text-[11px] text-gray-400">
          下载的 PPTX 是原生形状/文本框，文字、配色、排版都能在 PowerPoint 里改。
        </p>

        <!-- 备用：纯代码排版版（形状更简，个别环境兼容性更好） -->
        <details v-if="deck.outline" class="rounded-lg border border-gray-200 bg-gray-50/60 p-2">
          <summary class="cursor-pointer text-[11px] text-gray-500">备用：代码排版版（{{ deck.slides.length }} 页）</summary>
          <div class="mt-2 flex justify-end">
            <el-button size="small" plain :loading="busy" @click="downloadDeck">下载这一版</el-button>
          </div>
          <div class="mt-2 space-y-2">
            <div v-for="(s, i) in deck.slides" :key="i" class="relative">
              <span class="absolute left-1 top-1 z-10 rounded bg-black/45 px-1 text-[10px] text-white">{{ i + 1 }}</span>
              <SlidePreview :slide="s as unknown as SlideData" :width="360" />
            </div>
          </div>
        </details>

        <!-- 兜底：老数据没有 outline 时退回代码版为主（截图转可编辑走的就是这条） -->
        <template v-if="!deck.outline">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500">{{ deck.slides.length }} 页</span>
            <el-button size="small" type="primary" plain :loading="busy" @click="downloadDeck">下载 PPTX</el-button>
          </div>
          <div class="space-y-2">
            <div v-for="(s, i) in deck.slides" :key="i" class="relative">
              <span class="absolute left-1 top-1 z-10 rounded bg-black/45 px-1 text-[10px] text-white">{{ i + 1 }}</span>
              <SlidePreview :slide="s as unknown as SlideData" :width="360" />
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
