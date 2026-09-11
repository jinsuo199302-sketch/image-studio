<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { textToPptx, imagesToPptx } from '../../../../services/pdfApi'
import {
  generateDeck,
  generateDeckFromMaterial,
  uploadDeckPhotos,
  analyzeDeckReference,
  deckToPptx,
  type DeckResult,
  type DeckPhoto,
  type DeckRefStyle,
} from '../../../../services/designApi'
import { preloadSlideImages, type SlideData } from '../../../../utils/slideRender'
import { prepareUpload } from '../../../../utils/prepImage'
import { saveFile } from '../../../../utils/saveFile'
import { useAuthStore } from '../../../../stores/auth'
import SlidePreview from '../../SlidePreview.vue'
import DeckHtmlPreview from '../../DeckHtmlPreview.vue'

type Mode = 'ai' | 'text' | 'image'
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
  { key: 'purple', label: '典雅紫' },
  { key: 'slate', label: '沉稳蓝灰' },
  { key: 'teal', label: '青碧' },
]
const aiSource = ref<'topic' | 'material'>('topic')
const topic = ref('')
const sections = ref(4)
const theme = ref('auto')
const extra = ref('')
const aiBg = ref(false)
const isGeoTheme = computed(() => theme.value === 'geoblue')
const deck = ref<DeckResult | null>(null)
const generating = ref(false)

// 参考风格图：上传一张喜欢的模板 → 判断风格 + 提取配色
const refInput = ref<HTMLInputElement>()
const refStyle = ref<DeckRefStyle | null>(null)
const refBusy = ref(false)
const REF_LABEL: Record<string, string> = { geoblue: '几何图形风', techblue: '照片背景风', auto: '简约风' }
const LAYOUT_LABEL: Record<string, string> = {
  cards: '卡片', list: '清单', timeline: '时间轴', spoke: '辐射', hive: '蜂窝', cycle: '循环',
  matrix: '四象限', swot: 'SWOT', gallery: '图墙', stats: '指标', bar: '条形图', big_number: '大数字', quote: '金句',
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
  const useMaterial = aiSource.value === 'material'
  if (useMaterial) {
    if (!matFile.value && matText.value.trim().length < 20) {
      ElMessage.warning('上传资料文件，或粘贴至少几句文字')
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
    const refHints = refStyle.value
      ? {
          layouts: refStyle.value.layouts ?? [],
          density: refStyle.value.density ?? '',
          motif: refStyle.value.motif ?? '',
        }
      : {}
    const r = useMaterial
      ? await generateDeckFromMaterial(
          { file: matFile.value ?? undefined, pastedText: matText.value.trim() || undefined },
          sections.value,
          theme.value,
          extra.value.trim(),
          aiBg.value,
          photos,
          refPal,
          refHints,
        )
      : await generateDeck(
          topic.value.trim(),
          sections.value,
          theme.value,
          extra.value.trim(),
          aiBg.value,
          photos,
          refPal,
          refHints,
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
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex gap-1.5 px-3 pt-3">
      <button
        v-for="m in (['ai', 'text', 'image'] as const)"
        :key="m"
        class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
        :class="mode === m ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m"
      >
        {{ m === 'ai' ? 'AI 生成' : m === 'text' ? '文字转PPT' : '图片转PPT' }}
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
                ? '传资料 / 粘长文 → AI 提炼主题并重组成幻灯片，内容来自你的资料'
                : '填主题 → AI 排一套幻灯片，可下载 PPTX 在 PowerPoint 里改'
          "
          :type="authStore.isAuthenticated ? 'success' : 'info'"
          :closable="false"
          show-icon
        />

        <div class="flex gap-1.5">
          <button
            v-for="s in (['topic', 'material'] as const)"
            :key="s"
            class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
            :class="aiSource === s ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="aiSource = s"
          >
            {{ s === 'topic' ? '填主题' : '传资料 / 粘长文' }}
          </button>
        </div>

        <el-input
          v-if="aiSource === 'topic'"
          v-model="topic"
          size="small"
          placeholder="PPT 主题，例：中小学消防安全教育"
          maxlength="40"
        />

        <template v-else>
          <input
            ref="matFileInput"
            type="file"
            accept=".docx,.pdf,.txt,.md,image/*"
            class="hidden"
            @change="pickMatFile"
          />
          <div
            v-if="!matFile"
            class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
            @click="matFileInput?.click()"
          >
            <el-icon :size="20"><UploadFilled /></el-icon>
            <span class="text-[11px]">上传 Word / PDF / txt / 图片（拍照或截图）</span>
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
            maxlength="12000"
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

        <div class="flex items-center gap-3">
          <span class="shrink-0 text-xs text-gray-500">章节数</span>
          <el-slider v-model="sections" :min="2" :max="6" :step="1" show-stops :show-tooltip="false" class="!flex-1" />
          <span class="w-4 text-xs text-gray-400">{{ sections }}</span>
        </div>
        <div>
          <p class="mb-1 text-xs text-gray-500">配色主题</p>
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="th in THEMES"
              :key="th.key"
              class="rounded-md border px-1.5 py-1 text-[11px] transition"
              :class="theme === th.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="theme = th.key"
            >
              {{ th.label }}
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
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="generating"
          :disabled="aiSource === 'topic' ? !topic.trim() : !matFile && matText.trim().length < 20"
          @click="genDeck"
        >
          {{
            generating
              ? aiBg
                ? 'AI 画背景 + 排版中…（约 2~4 分钟）'
                : aiSource === 'material'
                  ? 'AI 提炼重组中…（约 1~3 分钟）'
                  : 'AI 排版中…（约 20~40 秒）'
              : '生成 PPT'
          }}
        </el-button>

        <template v-if="deck">
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

          <!-- 兜底：老数据没有 outline 时退回代码版为主 -->
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
      <template v-else>
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
    </div>
  </div>
</template>
