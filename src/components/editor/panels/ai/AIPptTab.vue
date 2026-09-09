<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { textToPptx, imagesToPptx } from '../../../../services/pdfApi'
import { generateDeck, deckToPptx, type DeckResult } from '../../../../services/designApi'
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
  { key: 'red', label: '党政红金' },
  { key: 'blue', label: '商务蓝' },
  { key: 'green', label: '清新绿' },
]
const topic = ref('')
const sections = ref(4)
const theme = ref('red')
const extra = ref('')
const aiBg = ref(false)
const deck = ref<DeckResult | null>(null)
const generating = ref(false)

async function genDeck() {
  const t = topic.value.trim()
  if (!t) {
    ElMessage.warning('先填 PPT 主题')
    return
  }
  generating.value = true
  deck.value = null
  try {
    const r = await generateDeck(t, sections.value, theme.value, extra.value.trim(), aiBg.value)
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
          :title="authStore.isAuthenticated ? '填主题 → AI 排一套幻灯片，可下载 PPTX 在 PowerPoint 里改' : '演示模式：登录后使用'"
          :type="authStore.isAuthenticated ? 'success' : 'info'"
          :closable="false"
          show-icon
        />
        <el-input v-model="topic" size="small" placeholder="PPT 主题，例：中小学消防安全教育" maxlength="40" />
        <div class="flex items-center gap-3">
          <span class="shrink-0 text-xs text-gray-500">章节数</span>
          <el-slider v-model="sections" :min="2" :max="6" :step="1" show-stops :show-tooltip="false" class="!flex-1" />
          <span class="w-4 text-xs text-gray-400">{{ sections }}</span>
        </div>
        <div>
          <p class="mb-1 text-xs text-gray-500">主题风格</p>
          <div class="flex gap-1.5">
            <button
              v-for="th in THEMES"
              :key="th.key"
              class="flex-1 rounded-md border px-2 py-1 text-[11px] transition"
              :class="theme === th.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="theme = th.key"
            >
              {{ th.label }}
            </button>
          </div>
        </div>
        <el-input
          v-model="extra"
          type="textarea"
          :rows="2"
          size="small"
          maxlength="200"
          placeholder="补充要求（可选）：例 面向小学生、突出案例、语气正式"
        />
        <label class="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 p-2 text-xs">
          <el-checkbox v-model="aiBg" class="!h-4" />
          <span class="text-gray-600">
            AI 生成整页背景（配色 + 3 张背景图，更精美）<br />
            <span class="text-[11px] text-gray-400">多花 2~4 分钟；不勾选是代码画的简版，几十秒</span>
          </span>
        </label>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="generating"
          :disabled="!topic.trim()"
          @click="genDeck"
        >
          {{ generating ? (aiBg ? 'AI 生成中…（约 2~4 分钟）' : 'AI 排版中…（约 20~40 秒）') : '生成 PPT' }}
        </el-button>

        <template v-if="deck">
          <div class="flex items-center justify-between pt-1">
            <span class="text-xs font-medium text-gray-600">{{ deck.title }} · {{ deck.slides.length }} 页</span>
            <el-button size="small" type="primary" plain :loading="busy" @click="downloadDeck">下载 PPTX</el-button>
          </div>
          <div class="space-y-2">
            <div v-for="(s, i) in deck.slides" :key="i" class="relative">
              <span class="absolute left-1 top-1 z-10 rounded bg-black/45 px-1 text-[10px] text-white">{{ i + 1 }}</span>
              <SlidePreview :slide="s as unknown as SlideData" :width="360" />
            </div>
          </div>
          <p class="text-[11px] text-gray-400">
            装饰目前是代码画的简版；下载的 PPTX 是原生形状，文字/配色/排版都能在 PowerPoint 里改。
          </p>

          <div v-if="deck.outline" class="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-2">
            <p class="mb-1 text-[11px] font-medium text-violet-700">HTML 版（实验）：CSS 排版 → 浏览器转可编辑 PPTX</p>
            <DeckHtmlPreview :outline="deck.outline" :theme-key="deck.theme" :bg="deck.bg" />
          </div>
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
