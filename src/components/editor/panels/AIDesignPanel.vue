<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Minus } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../stores/auth'
import { useDesignStore } from '../../../stores/design'
import AssetGeneratorPanel from './AssetGeneratorPanel.vue'
import { saveFile } from '../../../utils/saveFile'
import {
  generateBackgroundFromReference,
  generateHandout,
  generateLayoutPreset,
  HANDOUT_BORDERS,
  HANDOUT_CATEGORIES,
  HANDOUT_SIZES,
  HANDOUT_STYLES,
  type GeneratedDesign,
  type HandoutResult,
  type LayoutPresetSection,
  type TitleStyleHint,
} from '../../../services/designApi'

const props = defineProps<{ canvasWidth: number; canvasHeight: number }>()
const emit = defineEmits<{ (e: 'apply-design', design: GeneratedDesign): void; (e: 'insert-image', url: string): void }>()

const authStore = useAuthStore()
const store = useDesignStore()

const activeTab = ref<'handout' | 'brief' | 'preset' | 'reference' | 'asset'>('handout')

// ---------------- 创意简报模式（原有功能，AI 自己编内容+排版） ----------------
const prompt = ref('')
const EXAMPLES = ['儿童绘画班招生海报', '奶茶店周年庆促销海报', '公司年会邀请函', '读书分享会活动预告']

async function generate() {
  await store.generate(prompt.value, props.canvasWidth, props.canvasHeight)
}

function useExample(example: string) {
  prompt.value = example
}

function apply() {
  if (store.lastResult) emit('apply-design', store.lastResult)
}

// ---------------- 参数化排版模式（用户已经写好内容，纯代码排版，不调用 AI） ----------------
type PresetStructure = 'bullet-list' | 'dense-board'
const presetStructure = ref<PresetStructure>('bullet-list')

const blTitle = ref('')
const blIntro = ref('')
const blItems = ref<string[]>([''])

const dbTitle = ref('')
const dbSections = ref<{ heading: string; items: string[] }[]>([{ heading: '', items: [''] }])

const presetGenerating = ref(false)
const presetError = ref('')
const presetResult = ref<GeneratedDesign | null>(null)

function addBlItem() {
  blItems.value.push('')
}
function removeBlItem(i: number) {
  blItems.value.splice(i, 1)
}
function addSection() {
  dbSections.value.push({ heading: '', items: [''] })
}
function removeSection(i: number) {
  dbSections.value.splice(i, 1)
}
function addSectionItem(si: number) {
  dbSections.value[si].items.push('')
}
function removeSectionItem(si: number, ii: number) {
  dbSections.value[si].items.splice(ii, 1)
}

function bulletListValid() {
  return blTitle.value.trim() && blItems.value.some((s) => s.trim())
}
function denseBoardValid() {
  return dbTitle.value.trim() && dbSections.value.some((s) => s.heading.trim() && s.items.some((i) => i.trim()))
}
function presetValid() {
  return presetStructure.value === 'bullet-list' ? bulletListValid() : denseBoardValid()
}

async function generatePreset() {
  if (!presetValid()) return
  presetError.value = ''
  presetGenerating.value = true
  presetResult.value = null
  try {
    if (presetStructure.value === 'bullet-list') {
      const items = blItems.value.map((s) => s.trim()).filter(Boolean)
      presetResult.value = await generateLayoutPreset('bullet-list', props.canvasWidth, props.canvasHeight, {
        title: blTitle.value.trim(),
        intro: blIntro.value.trim(),
        items,
      })
    } else {
      const sections: LayoutPresetSection[] = dbSections.value
        .map((s) => ({ heading: s.heading.trim(), items: s.items.map((i) => i.trim()).filter(Boolean) }))
        .filter((s) => s.heading && s.items.length > 0)
      presetResult.value = await generateLayoutPreset('dense-board', props.canvasWidth, props.canvasHeight, {
        title: dbTitle.value.trim(),
        sections,
      })
    }
  } catch (e) {
    presetError.value = e instanceof Error ? e.message : '生成失败'
  } finally {
    presetGenerating.value = false
  }
}

function applyPreset() {
  if (presetResult.value) emit('apply-design', presetResult.value)
}

// ---------------- 参考图生成模式（上传参考图 → 风格描述 → 整图背景生成，不改画面具体内容） ----------------
const refFile = ref<File | null>(null)
const refPreviewUrl = ref('')
const refTitle = ref('')
const refSubtitle = ref('')
const refGenerating = ref(false)
const refError = ref('')
const refBackgroundSrc = ref('')
const refStyleDescription = ref('')
const refTitleStyle = ref<TitleStyleHint>({ effect: 'none', warp: 'none' })
const refApplying = ref(false)

/** 可选的信息卡片区块——复用"参数化排版"dense-board 那套分区栏格算法（ribbon-title + icon-list），
 * 铺在标题下方，让参考图生成也能做出"标题+多信息卡片"这种排版，不是只有背景+一行标题。 */
const refSections = ref<{ heading: string; items: string[] }[]>([])
function addRefSection() {
  refSections.value.push({ heading: '', items: [''] })
}
function removeRefSection(i: number) {
  refSections.value.splice(i, 1)
}
function addRefSectionItem(si: number) {
  refSections.value[si].items.push('')
}
function removeRefSectionItem(si: number, ii: number) {
  refSections.value[si].items.splice(ii, 1)
}

function onRefFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  refFile.value = file
  refPreviewUrl.value = URL.createObjectURL(file)
  refBackgroundSrc.value = ''
  refStyleDescription.value = ''
  refError.value = ''
  refSections.value = []
}

async function generateFromReference() {
  if (!refFile.value) return
  refError.value = ''
  refGenerating.value = true
  refBackgroundSrc.value = ''
  try {
    const result = await generateBackgroundFromReference(refFile.value)
    refBackgroundSrc.value = result.backgroundSrc
    refStyleDescription.value = result.styleDescription
    refTitleStyle.value = result.titleStyle
  } catch (e) {
    refError.value = e instanceof Error ? e.message : '生成失败'
  } finally {
    refGenerating.value = false
  }
}

/**
 * 基础文字样式（颜色/描边色/投影）照抄 tpl-board-party-building 那次验证过的默认处理，
 * 不按参考图类型区分字体/配色；但描边/浮雕/霓虹特效 + 拱形/波浪/旗帜/圆环变形这层"手法"，
 * 按后端从参考图标题识别出的 titleStyle 类别套用编辑器已有预设（见 EditorView.onApplyDesign）——
 * 只学手法类别，不抄具体字形，用户还是可以在文字编辑面板里再自己调整。
 *
 * 信息卡片区块（可选）复用"参数化排版"dense-board 的分区栏格算法，从标题/副标题下方的
 * topOffset 开始铺 ribbon-title+icon-list——同一套构图逻辑可以既服务"用户自己写内容"
 * 也服务"参考图生成"，不用另写一套栏格计算。
 */
async function applyReferenceBackground() {
  if (!refBackgroundSrc.value) return
  const w = props.canvasWidth
  const h = props.canvasHeight
  const elements: GeneratedDesign['elements'] = [
    { type: 'image', x: 0, y: 0, width: w, height: h, src: refBackgroundSrc.value },
  ]
  let contentBottom = Math.round(h * 0.1)
  if (refTitle.value.trim()) {
    elements.push({
      type: 'text',
      x: Math.round(w * 0.1),
      y: Math.round(h * 0.42),
      width: Math.round(w * 0.8),
      text: refTitle.value.trim(),
      fontSize: Math.round(w * 0.07),
      fontWeight: 'bold',
      color: '#fde047',
      align: 'center',
      stroke: '#7c2d12',
      strokeWidth: 2,
      shadowColor: 'rgba(0,0,0,0.35)',
      shadowBlur: 8,
      shadowOffsetX: 2,
      shadowOffsetY: 3,
    })
    contentBottom = Math.round(h * 0.42) + Math.round(w * 0.07) + 20
  }
  if (refSubtitle.value.trim()) {
    elements.push({
      type: 'text',
      x: Math.round(w * 0.1),
      y: contentBottom,
      width: Math.round(w * 0.8),
      text: refSubtitle.value.trim(),
      fontSize: Math.round(w * 0.026),
      color: '#fef3c7',
      align: 'center',
    })
    contentBottom += Math.round(w * 0.026 * 1.3) + 20
  }

  const validSections = refSections.value
    .map((s) => ({ heading: s.heading.trim(), items: s.items.map((i) => i.trim()).filter(Boolean) }))
    .filter((s) => s.heading && s.items.length > 0)
  if (validSections.length > 0) {
    try {
      refApplying.value = true
      const boardResult = await generateLayoutPreset(
        'dense-board',
        w,
        h,
        { title: '', sections: validSections },
        { includeTitle: false, topOffset: contentBottom + 40 },
      )
      elements.push(...boardResult.elements)
    } catch (e) {
      refError.value = e instanceof Error ? e.message : '信息卡片排版失败'
      refApplying.value = false
      return
    }
    refApplying.value = false
  }

  emit('apply-design', {
    background: '#ffffff',
    elements,
    titleStyle: refTitle.value.trim() ? refTitleStyle.value : undefined,
  })
}

// ---------------- 手抄报一键生成（选分类/尺寸/画风 + 可选主题 → AI 填内容 + 画装饰背景 → 自动组装） ----------------
const hoCategory = ref(HANDOUT_CATEGORIES[0].key)
const hoSize = ref(HANDOUT_SIZES[1].key)       // 默认 A4
const hoLandscape = ref(true)                  // 手抄报默认横版
const hoStyle = ref(HANDOUT_STYLES[0].key)
const hoBorder = ref(HANDOUT_BORDERS[0].key)   // 花边边框，默认「跟随主题」
const hoTopic = ref('')
const hoWithContent = ref(true)                // 带文字内容 / 只要画和标题（纯涂色）
const hoLayered = ref(false)                   // 可拆分元素版（AI 出整图 → 框选 → 拆成一堆可拖动小图）
const hoApplyMode = ref<'colored' | 'lineart'>('colored')  // 应用到画布用哪张
const hoGenerating = ref(false)
const hoError = ref('')
const hoResult = ref<(HandoutResult & { w: number; h: number }) | null>(null)

function hoDims() {
  const s = HANDOUT_SIZES.find((x) => x.key === hoSize.value) ?? HANDOUT_SIZES[1]
  return hoLandscape.value ? { w: s.w, h: s.h } : { w: s.h, h: s.w }
}

async function generateHo() {
  hoError.value = ''
  hoGenerating.value = true
  hoResult.value = null
  hoApplyMode.value = 'colored'
  const { w, h } = hoDims()
  try {
    const r = await generateHandout(
      hoCategory.value, hoTopic.value.trim(), hoStyle.value, hoBorder.value,
      w, h, hoWithContent.value, hoLayered.value,
    )
    hoResult.value = { ...r, w, h }
  } catch (e) {
    hoError.value = e instanceof Error ? e.message : '生成失败'
  } finally {
    hoGenerating.value = false
  }
}

async function downloadHo(kind: 'colored' | 'lineart') {
  const r = hoResult.value
  if (!r) return
  const src = kind === 'lineart' ? r.lineartSrc : r.coloredSrc
  if (!src) return
  const name = `手抄报_${r.title}_${kind === 'lineart' ? '线稿版' : '彩色版'}.png`
  try {
    await saveFile(name, src)
  } catch (e) {
    hoError.value = e instanceof Error ? e.message : '下载失败'
  }
}

/** colors[0] 兑成一层很淡的底色，背景图没生成出来时用它兜底，不至于纯白 */
function tintBg(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#fdfbf7'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mix = (c: number) => Math.round(c + (255 - c) * 0.92)
  return `#${((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)).toString(16).slice(1)}`
}

function applyHo() {
  const r = hoResult.value
  if (!r) return
  // 版面后端已按 r.w × r.h 排好；应用时让画布也调成这个尺寸（EditorView.onApplyDesign 处理）
  // 可拆分版：elements 里已经是「底图 + 一堆元素图 + 文字层」，直接用
  if (r.elementCount !== undefined) {
    emit('apply-design', {
      background: r.background || '#ffffff',
      elements: [...r.elements],
      canvasSize: { width: r.w, height: r.h },
    })
    return
  }
  const bgSrc = hoApplyMode.value === 'lineart' ? r.lineartSrc : r.coloredSrc
  const elements: GeneratedDesign['elements'] = []
  if (bgSrc) {
    elements.push({ type: 'image', x: 0, y: 0, width: r.w, height: r.h, src: bgSrc })
  }
  elements.push(...r.elements)
  emit('apply-design', {
    background: bgSrc ? '#ffffff' : tintBg(r.colors[0]),
    elements,
    canvasSize: { width: r.w, height: r.h },
  })
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex overflow-x-auto border-b border-gray-100 px-3 pt-2">
      <button
        class="shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'handout' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'handout'"
      >
        手抄报
      </button>
      <button
        class="shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'brief' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'brief'"
      >
        创意简报
      </button>
      <button
        class="shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'preset' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'preset'"
      >
        参数化排版
      </button>
      <button
        class="shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'reference' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'reference'"
      >
        参考图生成
      </button>
      <button
        class="shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'asset' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'asset'"
      >
        素材/文字生成
      </button>
    </div>

    <!-- ============ 手抄报：选分类 +（可选）主题，AI 填内容 + 画装饰背景，一键组装 ============ -->
    <template v-if="activeTab === 'handout'">
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <el-alert
          :title="authStore.isAuthenticated ? '选个分类就能生成，正文是独立文字层、随时能改' : '演示模式：登录后使用真实生成'"
          :type="authStore.isAuthenticated ? 'success' : 'info'"
          :closable="false"
          show-icon
        />

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">选一个主题分类</label>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="c in HANDOUT_CATEGORIES"
              :key="c.key"
              class="rounded-md border px-2 py-1.5 text-left text-xs transition"
              :class="hoCategory === c.key ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-300'"
              @click="hoCategory = c.key"
            >
              <div class="font-medium" :class="hoCategory === c.key ? 'text-violet-600' : 'text-gray-700'">{{ c.label }}</div>
              <div class="mt-0.5 text-[10px] text-gray-400">{{ c.hint }}</div>
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">纸张尺寸</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="s in HANDOUT_SIZES"
              :key="s.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="hoSize === s.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="hoSize = s.key"
            >
              {{ s.label }}
            </button>
            <button
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="'border-gray-200 text-gray-500'"
              @click="hoLandscape = !hoLandscape"
            >
              {{ hoLandscape ? '横版' : '竖版' }}
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">画风</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="st in HANDOUT_STYLES"
              :key="st.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="hoStyle === st.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="hoStyle = st.key"
            >
              {{ st.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">花边边框（AI 在画面四周画一圈装饰）</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="b in HANDOUT_BORDERS"
              :key="b.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="hoBorder === b.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="hoBorder = b.key"
            >
              {{ b.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">具体主题（可选，不填就出这个分类的通用版）</label>
          <el-input v-model="hoTopic" size="small" placeholder="例：防溺水、垃圾分类、我的中秋节…" maxlength="20" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">内容</label>
          <div class="flex gap-1.5">
            <button
              class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
              :class="hoWithContent ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="hoWithContent = true"
            >
              带文字内容
            </button>
            <button
              class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
              :class="!hoWithContent ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="hoWithContent = false"
            >
              只要画和标题（纯涂色）
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">版式</label>
          <div class="flex gap-1.5">
            <button
              class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
              :class="!hoLayered ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="hoLayered = false"
            >
              左图右文
            </button>
            <button
              class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
              :class="hoLayered ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="hoLayered = true"
            >
              可拆分元素
            </button>
          </div>
          <p v-if="hoLayered" class="mt-1 text-[10px] leading-relaxed text-gray-400">
            AI 出整图后照着画风把每个元素单独重画成透明贴纸（不是裁切，所以每个都干净），
            每个能单独拖、缩、删；选中某个元素还能输提示词让 AI 换一个。生成慢一些、按 3 次计费。
          </p>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          :loading="hoGenerating"
          @click="generateHo"
        >
          {{ hoGenerating ? (hoLayered ? '生成中…（拆元素约 2 分钟）' : '生成中…（约 20 秒）') : '一键生成手抄报' }}
        </el-button>

        <p v-if="hoError" class="text-xs text-red-500">{{ hoError }}</p>

        <div v-if="hoResult" class="space-y-2 rounded-lg border border-gray-200 p-2">
          <!-- 可拆分版：整图预览 + 元素数 -->
          <template v-if="hoResult.elementCount !== undefined">
            <img v-if="hoResult.fullSrc" :src="hoResult.fullSrc" class="w-full rounded object-contain" />
            <p class="text-xs text-gray-500">
              <span class="font-medium text-gray-700">{{ hoResult.title }}</span> ·
              拆出 {{ hoResult.elementCount }} 个可拖动元素<template v-if="hoResult.sections.length"> + {{ hoResult.sections.length }} 个文字板块</template>
            </p>
            <p v-if="hoResult.elementCount === 0" class="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              这次没框出元素，整图作底图应用了，可以点下面重试
            </p>
            <el-button type="primary" class="!w-full" :loading="hoGenerating" @click="applyHo">应用到画布</el-button>
            <el-button class="!w-full" text @click="generateHo">换一张重新生成</el-button>
          </template>

          <template v-else>
            <div v-if="hoResult.coloredSrc" class="grid grid-cols-2 gap-1.5">
              <button
                class="overflow-hidden rounded border-2 transition"
                :class="hoApplyMode === 'colored' ? 'border-violet-500' : 'border-transparent'"
                @click="hoApplyMode = 'colored'"
              >
                <img :src="hoResult.coloredSrc" class="w-full object-contain" />
                <span class="block bg-gray-50 py-0.5 text-center text-[10px] text-gray-500">彩色版</span>
              </button>
              <button
                v-if="hoResult.lineartSrc"
                class="overflow-hidden rounded border-2 transition"
                :class="hoApplyMode === 'lineart' ? 'border-violet-500' : 'border-transparent'"
                @click="hoApplyMode = 'lineart'"
              >
                <img :src="hoResult.lineartSrc" class="w-full bg-white object-contain" />
                <span class="block bg-gray-50 py-0.5 text-center text-[10px] text-gray-500">线稿版（可涂色）</span>
              </button>
            </div>
            <p v-else class="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              插画这次没画出来（生成慢/超时），标题和文字已排好，可以先应用、再点下面重试
            </p>

            <div class="text-xs text-gray-500">
              <span class="font-medium text-gray-700">{{ hoResult.title }}</span>
              <template v-if="hoResult.sections.length">
                · 共 {{ hoResult.sections.length }} 个板块：{{ hoResult.sections.map((s) => s.heading).join(' / ') }}
              </template>
              <template v-else> · 纯涂色版</template>
            </div>

            <div v-if="hoResult.coloredSrc" class="flex gap-1.5">
              <el-button class="!flex-1" size="small" @click="downloadHo('colored')">下载彩色版</el-button>
              <el-button v-if="hoResult.lineartSrc" class="!flex-1" size="small" @click="downloadHo('lineart')">下载线稿版</el-button>
            </div>

            <el-button type="primary" class="!w-full" :loading="hoGenerating" @click="applyHo">
              应用到画布（{{ hoApplyMode === 'lineart' ? '线稿版' : '彩色版' }}，正文可编辑）
            </el-button>
            <el-button class="!w-full" text @click="generateHo">{{ hoResult.coloredSrc ? '换一张重新生成' : '重试生成插画' }}</el-button>
          </template>
        </div>
      </div>
    </template>

    <!-- ============ 创意简报：一句话描述，AI 自己编内容+挑组件+排版 ============ -->
    <template v-else-if="activeTab === 'brief'">
      <div class="space-y-3 p-3">
        <el-alert
          :title="authStore.isAuthenticated ? '已登录，使用真实设计生成接口' : '演示模式：生成示例版式，登录后自动切换'"
          :type="authStore.isAuthenticated ? 'success' : 'info'"
          :closable="false"
          show-icon
        />

        <p class="text-xs font-medium text-gray-600">描述你想要的设计</p>
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="4"
          placeholder="例如：儿童绘画班招生海报，风格活泼可爱"
          @keyup.enter.ctrl="generate"
        />

        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="example in EXAMPLES"
            :key="example"
            class="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 transition hover:border-violet-300 hover:text-violet-600"
            @click="useExample(example)"
          >
            {{ example }}
          </button>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          :loading="store.isGenerating"
          @click="generate"
        >
          生成设计
        </el-button>

        <p v-if="store.error" class="text-xs text-red-500">{{ store.error }}</p>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto border-t border-gray-100 p-3">
        <div v-if="store.isGenerating" class="space-y-2">
          <div v-for="n in 4" :key="n" class="h-6 animate-pulse rounded bg-gray-100" />
        </div>

        <div v-else-if="store.lastResult" class="space-y-3">
          <p class="text-xs font-medium text-gray-600">
            已生成 {{ store.lastResult.elements.length }} 个元素，应用后会替换当前画布内容
          </p>
          <div class="flex gap-2">
            <el-button class="!flex-1" :loading="store.isGenerating" @click="generate">重新生成</el-button>
            <el-button type="primary" class="!flex-1 !bg-violet-500 !border-none" @click="apply"> 应用到画布 </el-button>
          </div>
        </div>

        <div v-else class="flex h-full items-center justify-center text-center text-xs text-gray-400">
          输入一句描述，AI 会自动安排图片、字体和版式
        </div>
      </div>
    </template>

    <!-- ============ 参数化排版：内容你已经写好，系统按选定结构自动排版，不调用 AI ============ -->
    <template v-else-if="activeTab === 'preset'">
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <el-alert
          title="纯代码排版，不调用 AI——不会改写你的文字，秒级出结果"
          type="success"
          :closable="false"
          show-icon
        />

        <p class="text-xs font-medium text-gray-600">选择结构</p>
        <div class="flex gap-2">
          <button
            class="flex-1 rounded-lg border px-2 py-2 text-xs transition"
            :class="presetStructure === 'bullet-list' ? 'border-violet-400 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'"
            @click="presetStructure = 'bullet-list'"
          >
            要点罗列式
          </button>
          <button
            class="flex-1 rounded-lg border px-2 py-2 text-xs transition"
            :class="presetStructure === 'dense-board' ? 'border-violet-400 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'"
            @click="presetStructure = 'dense-board'"
          >
            多栏密排信息板
          </button>
        </div>

        <!-- 要点罗列式表单 -->
        <div v-if="presetStructure === 'bullet-list'" class="space-y-2">
          <p class="text-xs font-medium text-gray-600">标题</p>
          <el-input v-model="blTitle" placeholder="例如：社区读书会第12期招募" />

          <p class="text-xs font-medium text-gray-600">引言（可选）</p>
          <el-input v-model="blIntro" type="textarea" :rows="2" placeholder="一段简短的背景说明" />

          <p class="text-xs font-medium text-gray-600">要点</p>
          <div v-for="(_, i) in blItems" :key="i" class="flex gap-1.5">
            <el-input v-model="blItems[i]" :placeholder="`要点 ${i + 1}`" />
            <button
              v-if="blItems.length > 1"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500"
              @click="removeBlItem(i)"
            >
              <el-icon :size="14"><Minus /></el-icon>
            </button>
          </div>
          <button
            class="flex w-full items-center justify-center gap-1 rounded border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:border-violet-300 hover:text-violet-600"
            @click="addBlItem"
          >
            <el-icon :size="12"><Plus /></el-icon>
            加一条要点
          </button>
        </div>

        <!-- 多栏密排信息板表单 -->
        <div v-else class="space-y-3">
          <p class="text-xs font-medium text-gray-600">标题</p>
          <el-input v-model="dbTitle" placeholder="例如：2026年新员工入职指南" />

          <div v-for="(section, si) in dbSections" :key="si" class="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
            <div class="flex gap-1.5">
              <el-input v-model="section.heading" :placeholder="`分区 ${si + 1} 标题`" />
              <button
                v-if="dbSections.length > 1"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500"
                @click="removeSection(si)"
              >
                <el-icon :size="14"><Minus /></el-icon>
              </button>
            </div>
            <div v-for="(_, ii) in section.items" :key="ii" class="flex gap-1.5 pl-3">
              <el-input v-model="section.items[ii]" size="small" :placeholder="`条目 ${ii + 1}`" />
              <button
                v-if="section.items.length > 1"
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500"
                @click="removeSectionItem(si, ii)"
              >
                <el-icon :size="12"><Minus /></el-icon>
              </button>
            </div>
            <button
              class="ml-3 flex items-center gap-1 text-[11px] text-gray-500 hover:text-violet-600"
              @click="addSectionItem(si)"
            >
              <el-icon :size="11"><Plus /></el-icon>
              加一条
            </button>
          </div>
          <button
            class="flex w-full items-center justify-center gap-1 rounded border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:border-violet-300 hover:text-violet-600"
            @click="addSection"
          >
            <el-icon :size="12"><Plus /></el-icon>
            加一个分区
          </button>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          :loading="presetGenerating"
          :disabled="!presetValid()"
          @click="generatePreset"
        >
          生成排版
        </el-button>

        <p v-if="presetError" class="text-xs text-red-500">{{ presetError }}</p>

        <div v-if="presetResult" class="space-y-2 border-t border-gray-100 pt-3">
          <p class="text-xs font-medium text-gray-600">
            已生成 {{ presetResult.elements.length }} 个元素，应用后会替换当前画布内容
          </p>
          <div class="flex gap-2">
            <el-button class="!flex-1" :loading="presetGenerating" @click="generatePreset">重新生成</el-button>
            <el-button type="primary" class="!flex-1 !bg-violet-500 !border-none" @click="applyPreset"> 应用到画布 </el-button>
          </div>
        </div>
      </div>
    </template>

    <!-- ============ 参考图生成：上传参考图，AI 提炼风格生成新背景，文字自己调 ============ -->
    <template v-else-if="activeTab === 'reference'">
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <el-alert
          title="只提炼氛围/元素类别/构图，不复刻参考图具体内容——生成结果是全新的独立画面"
          type="success"
          :closable="false"
          show-icon
        />

        <p class="text-xs font-medium text-gray-600">上传参考图</p>
        <label
          class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 p-4 text-xs text-gray-500 hover:border-violet-300 hover:text-violet-600"
        >
          <img v-if="refPreviewUrl" :src="refPreviewUrl" class="max-h-32 rounded object-contain" />
          <span>{{ refFile ? refFile.name : '点击选择一张参考图（jpg/png）' }}</span>
          <input type="file" accept="image/*" class="hidden" @change="onRefFileChange" />
        </label>

        <el-button
          type="primary"
          class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          :loading="refGenerating"
          :disabled="!refFile"
          @click="generateFromReference"
        >
          生成背景
        </el-button>

        <p v-if="refError" class="text-xs text-red-500">{{ refError }}</p>

        <template v-if="refBackgroundSrc">
          <div class="space-y-2 border-t border-gray-100 pt-3">
            <img :src="refBackgroundSrc" class="w-full rounded-lg border border-gray-100" />
            <p class="text-[11px] leading-relaxed text-gray-400">{{ refStyleDescription }}</p>

            <p class="text-xs font-medium text-gray-600">主标题</p>
            <el-input v-model="refTitle" placeholder="例如：喜迎华诞 礼赞盛世" />

            <p class="text-xs font-medium text-gray-600">副标题（可选）</p>
            <el-input v-model="refSubtitle" placeholder="一句简短的副标题" />

            <p class="text-xs font-medium text-gray-600">信息卡片区块（可选）</p>
            <div v-for="(section, si) in refSections" :key="si" class="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
              <div class="flex gap-1.5">
                <el-input v-model="section.heading" :placeholder="`分区 ${si + 1} 标题`" />
                <button
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  @click="removeRefSection(si)"
                >
                  <el-icon :size="14"><Minus /></el-icon>
                </button>
              </div>
              <div v-for="(_, ii) in section.items" :key="ii" class="flex gap-1.5 pl-3">
                <el-input v-model="section.items[ii]" size="small" :placeholder="`条目 ${ii + 1}`" />
                <button
                  v-if="section.items.length > 1"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  @click="removeRefSectionItem(si, ii)"
                >
                  <el-icon :size="12"><Minus /></el-icon>
                </button>
              </div>
              <button
                class="ml-3 flex items-center gap-1 text-[11px] text-gray-500 hover:text-violet-600"
                @click="addRefSectionItem(si)"
              >
                <el-icon :size="11"><Plus /></el-icon>
                加一条
              </button>
            </div>
            <button
              class="flex w-full items-center justify-center gap-1 rounded border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:border-violet-300 hover:text-violet-600"
              @click="addRefSection"
            >
              <el-icon :size="12"><Plus /></el-icon>
              加一个信息卡片分区
            </button>

            <div class="flex gap-2">
              <el-button class="!flex-1" :loading="refGenerating" @click="generateFromReference">重新生成</el-button>
              <el-button
                type="primary"
                class="!flex-1 !bg-violet-500 !border-none"
                :loading="refApplying"
                @click="applyReferenceBackground"
              >
                应用到画布
              </el-button>
            </div>
            <p class="text-[11px] text-gray-400">文字先用默认样式叠加，应用后可以在画布里自由调整字体/颜色/位置</p>
          </div>
        </template>
      </div>
    </template>

    <!-- ============ 素材/文字生成：框选参考图一小块区域，独立生成透明PNG插画或造型文字 ============ -->
    <template v-else>
      <AssetGeneratorPanel @insert="(url) => emit('insert-image', url)" />
    </template>
  </div>
</template>
