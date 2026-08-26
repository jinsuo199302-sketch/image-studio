<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Minus } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../stores/auth'
import { useDesignStore } from '../../../stores/design'
import AssetGeneratorPanel from './AssetGeneratorPanel.vue'
import {
  generateBackgroundFromReference,
  generateLayoutPreset,
  type GeneratedDesign,
  type LayoutPresetSection,
  type TitleStyleHint,
} from '../../../services/designApi'

const props = defineProps<{ canvasWidth: number; canvasHeight: number }>()
const emit = defineEmits<{ (e: 'apply-design', design: GeneratedDesign): void; (e: 'insert-image', url: string): void }>()

const authStore = useAuthStore()
const store = useDesignStore()

const activeTab = ref<'brief' | 'preset' | 'reference' | 'asset'>('brief')

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
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex border-b border-gray-100 px-3 pt-2">
      <button
        class="border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'brief' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'brief'"
      >
        创意简报
      </button>
      <button
        class="border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'preset' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'preset'"
      >
        参数化排版
      </button>
      <button
        class="border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'reference' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'reference'"
      >
        参考图生成
      </button>
      <button
        class="border-b-2 px-3 py-2 text-xs font-medium transition"
        :class="activeTab === 'asset' ? 'border-violet-500 text-violet-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'asset'"
      >
        素材/文字生成
      </button>
    </div>

    <!-- ============ 创意简报：一句话描述，AI 自己编内容+挑组件+排版 ============ -->
    <template v-if="activeTab === 'brief'">
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
