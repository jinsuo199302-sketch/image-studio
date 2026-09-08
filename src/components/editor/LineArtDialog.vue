<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { imageToLineArt } from '../../utils/lineArt'

const props = defineProps<{ modelValue: boolean; imageSrc: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'result', dataUrl: string): void
}>()

const thickness = ref(2)
const depth = ref(2)
const color = ref('#6b7280')
const previewUrl = ref('')
const busy = ref(false)
const loadError = ref('')

let sourceImg: HTMLImageElement | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null

const COLORS = ['#6b7280', '#94a3b8', '#78716c', '#1f2937', '#3b82f6', '#166534']

async function loadSource() {
  loadError.value = ''
  previewUrl.value = ''
  sourceImg = null
  if (!props.imageSrc) return
  const img = new Image()
  img.crossOrigin = 'anonymous'
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('load'))
      img.src = props.imageSrc
    })
  } catch {
    loadError.value = '图片加载失败'
    return
  }
  sourceImg = img
  render()
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 180)
}

function render() {
  if (!sourceImg) return
  busy.value = true
  // 让 loading 态先渲染出来再算（大图 Sobel 有几十~几百 ms）。
  // 用 setTimeout 不用 rAF——页面在后台标签/隐藏时 rAF 会被暂停。
  setTimeout(() => {
    try {
      previewUrl.value = imageToLineArt(sourceImg!, {
        thickness: thickness.value,
        depth: depth.value,
        color: color.value,
      })
    } catch {
      loadError.value = '转换失败，换张图试试'
    } finally {
      busy.value = false
    }
  }, 0)
}

watch(() => props.modelValue, (open) => { if (open) loadSource() })
watch([thickness, depth, color], scheduleRender)

function apply() {
  if (!previewUrl.value) {
    ElMessage.warning('还没有生成结果')
    return
  }
  emit('result', previewUrl.value)
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="转线稿（极淡）"
    width="560px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p v-if="loadError" class="text-sm text-red-500">{{ loadError }}</p>
    <template v-else>
      <div
        class="mb-3 flex min-h-[220px] items-center justify-center rounded-lg border border-gray-200 bg-[repeating-conic-gradient(#f3f4f6_0_25%,#fff_0_50%)] [background-size:16px_16px] p-2"
      >
        <img v-if="previewUrl" :src="previewUrl" class="max-h-[300px] max-w-full object-contain" />
        <span v-else class="text-xs text-gray-400">{{ busy ? '生成中…' : '准备中…' }}</span>
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
          输出是透明底的浅色线稿，默认很淡（像轻轻描过一遍）。想更明显就调高「深浅」；线太碎就调高「粗细」。
        </p>
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!previewUrl || busy" @click="apply">替换为线稿</el-button>
    </template>
  </el-dialog>
</template>
