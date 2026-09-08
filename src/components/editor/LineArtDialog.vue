<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { imageToLineArt, styleLineArt } from '../../utils/lineArt'
import { aiLineArt } from '../../services/designApi'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{ modelValue: boolean; imageSrc: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'result', dataUrl: string): void
}>()

const authStore = useAuthStore()

const mode = ref<'ai' | 'local'>('ai')
const thickness = ref(2)
const depth = ref(3)
const color = ref('#4b5563')
const lineStyle = ref<'solid' | 'dashed'>('solid')
const previewUrl = ref('')
const busy = ref(false)
const aiGenerating = ref(false)
const loadError = ref('')

let sourceImg: HTMLImageElement | null = null
let aiRawImg: HTMLImageElement | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null

const COLORS = ['#4b5563', '#9ca3af', '#78716c', '#1f2937', '#3b82f6', '#166534']

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load'))
    img.src = src
  })
}

async function loadSource() {
  loadError.value = ''
  previewUrl.value = ''
  sourceImg = null
  aiRawImg = null
  if (!props.imageSrc) return
  if (mode.value === 'ai' && !authStore.isAuthenticated) mode.value = 'local'
  try {
    sourceImg = await loadImg(props.imageSrc)
  } catch {
    loadError.value = '图片加载失败'
    return
  }
  if (mode.value === 'ai') generateAi()
  else render()
}

async function generateAi() {
  if (!props.imageSrc || aiGenerating.value) return
  aiGenerating.value = true
  previewUrl.value = ''
  try {
    const { src } = await aiLineArt(props.imageSrc)
    aiRawImg = await loadImg(src)
    render()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '线稿生成失败')
    mode.value = 'local'
    render()
  } finally {
    aiGenerating.value = false
  }
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 180)
}

function render() {
  const opts = {
    thickness: thickness.value,
    depth: depth.value,
    color: color.value,
    lineStyle: lineStyle.value,
  }
  if (mode.value === 'ai') {
    if (!aiRawImg) return
    busy.value = true
    setTimeout(() => {
      try {
        previewUrl.value = styleLineArt(aiRawImg!, opts)
      } catch {
        loadError.value = '处理失败'
      } finally {
        busy.value = false
      }
    }, 0)
    return
  }
  if (!sourceImg) return
  busy.value = true
  setTimeout(() => {
    try {
      previewUrl.value = imageToLineArt(sourceImg!, opts)
    } catch {
      loadError.value = '转换失败，换张图试试'
    } finally {
      busy.value = false
    }
  }, 0)
}

function switchMode(m: 'ai' | 'local') {
  if (mode.value === m) return
  if (m === 'ai' && !authStore.isAuthenticated) {
    ElMessage.warning('AI 精细线稿需要登录')
    return
  }
  mode.value = m
  if (m === 'ai' && !aiRawImg) generateAi()
  else render()
}

watch(() => props.modelValue, (open) => { if (open) loadSource() })
watch([thickness, depth, color, lineStyle], scheduleRender)

function apply() {
  if (!previewUrl.value) {
    ElMessage.warning('还没有生成结果')
    return
  }
  const url = previewUrl.value
  emit('update:modelValue', false)
  emit('result', url)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="转线稿"
    width="560px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <template v-else>
      <div class="mb-3 flex items-center gap-2">
        <button
          class="rounded-md border px-3 py-1 text-xs transition"
          :class="mode === 'ai' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="switchMode('ai')"
        >
          AI 精细（清晰，1 次）
        </button>
        <button
          class="rounded-md border px-3 py-1 text-xs transition"
          :class="mode === 'local' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="switchMode('local')"
        >
          本地快速（免费）
        </button>
        <span v-if="!authStore.isAuthenticated" class="text-[11px] text-gray-400">AI 版需登录</span>
      </div>

      <div
        class="mb-3 flex min-h-[220px] items-center justify-center rounded-lg border border-gray-200 bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] [background-size:16px_16px] p-2"
      >
        <img v-if="previewUrl" :src="previewUrl" class="max-h-[300px] max-w-full object-contain" />
        <span v-else class="text-xs text-gray-400">
          {{ aiGenerating ? 'AI 生成中…（约 20 秒）' : busy ? '处理中…' : '准备中…' }}
        </span>
      </div>

      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <span class="w-12 shrink-0 text-xs text-gray-500">粗细</span>
          <el-slider v-model="thickness" :min="1" :max="5" :step="1" show-stops :show-tooltip="false" class="!flex-1" />
          <span class="w-4 text-xs text-gray-400">{{ thickness }}</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-12 shrink-0 text-xs text-gray-500">深浅</span>
          <el-slider v-model="depth" :min="1" :max="5" :step="1" show-stops :show-tooltip="false" class="!flex-1" />
          <span class="w-4 text-xs text-gray-400">{{ depth }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-12 shrink-0 text-xs text-gray-500">线型</span>
          <button
            class="rounded-md border px-3 py-1 text-[11px] transition"
            :class="lineStyle === 'solid' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="lineStyle = 'solid'"
          >
            实线
          </button>
          <button
            class="rounded-md border px-3 py-1 text-[11px] transition"
            :class="lineStyle === 'dashed' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="lineStyle = 'dashed'"
          >
            虚线
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-12 shrink-0 text-xs text-gray-500">颜色</span>
          <button
            v-for="c in COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border-2"
            :style="{ background: c }"
            :class="color === c ? 'border-violet-500' : 'border-gray-200'"
            @click="color = c"
          />
          <el-color-picker v-model="color" size="small" />
        </div>
        <p class="text-[11px] text-gray-400">
          <template v-if="mode === 'ai'">
            AI 重画成干净黑白线稿（文字也清晰），再按「深浅」压成想要的浅度。换算滑块不重新扣次数。
          </template>
          <template v-else>
            本地即时、免费，用局部对比提轮廓；对蜡笔/水彩纹理和文字不如 AI 版干净。
          </template>
        </p>
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!previewUrl || busy || aiGenerating" @click="apply">替换为线稿</el-button>
    </template>
  </el-dialog>
</template>
