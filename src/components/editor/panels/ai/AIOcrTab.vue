<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { extractTextFromImage } from '../../../../services/ocrApi'
import { prepareUpload } from '../../../../utils/prepImage'
import { cropDataUrl, type NormRect } from '../../../../utils/cropRegion'

const authStore = useAuthStore()

const fileInput = ref<HTMLInputElement>()
const imgWrap = ref<HTMLElement>()
const workingImage = ref<string | null>(null)
const extracting = ref(false)
const resultText = ref('')
const error = ref('')

// 框选区域（归一化 0~1）；null = 整图
const region = ref<NormRect | null>(null)
const drag = reactive({ active: false, x0: 0, y0: 0, x1: 0, y1: 0 })

const boxStyle = computed(() => {
  const r = drag.active
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0),
      }
    : region.value
  if (!r) return { display: 'none' }
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  }
})

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  const prepped = await prepareUpload(file)
  const reader = new FileReader()
  reader.onload = () => {
    workingImage.value = reader.result as string
    resultText.value = ''
    error.value = ''
    region.value = null
  }
  reader.readAsDataURL(prepped)
}

function reset() {
  workingImage.value = null
  resultText.value = ''
  region.value = null
}

function relPos(e: PointerEvent) {
  const box = imgWrap.value!.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
    y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
  }
}
function onDown(e: PointerEvent) {
  const p = relPos(e)
  drag.active = true
  drag.x0 = drag.x1 = p.x
  drag.y0 = drag.y1 = p.y
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!drag.active) return
  const p = relPos(e)
  drag.x1 = p.x
  drag.y1 = p.y
}
function onUp() {
  if (!drag.active) return
  drag.active = false
  const w = Math.abs(drag.x1 - drag.x0)
  const h = Math.abs(drag.y1 - drag.y0)
  region.value = w > 0.02 && h > 0.02
    ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w, h }
    : null
}

async function runExtract() {
  if (!workingImage.value) return
  extracting.value = true
  error.value = ''
  try {
    const src = region.value ? await cropDataUrl(workingImage.value, region.value) : workingImage.value
    resultText.value = await extractTextFromImage(authStore.isAuthenticated, src)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '提取失败，请重试'
  } finally {
    extracting.value = false
  }
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(resultText.value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选中文字复制')
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，使用真实文字提取接口' : '演示模式：提取结果为示例文字，登录后自动切换'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
      <p class="mt-2 text-[11px] text-gray-400">
        截图/名片/文档拍照快速提取文字。在图上拖一个框，只识别框内那一段
      </p>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!workingImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传图片，提取图中的文字</span>
      </div>

      <template v-else>
        <div
          ref="imgWrap"
          class="relative select-none overflow-hidden rounded-lg border border-gray-200 touch-none"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
        >
          <img :src="workingImage" class="pointer-events-none block max-h-48 w-full object-contain" draggable="false" />
          <div class="pointer-events-none absolute border-2 border-violet-500 bg-violet-500/10" :style="boxStyle" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click.stop="reset"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>

        <div class="flex items-center justify-between text-[11px] text-gray-400">
          <span>{{ region ? '将只识别框选区域' : '未框选，识别整张图' }}</span>
          <button v-if="region" class="text-violet-500 hover:underline" @click="region = null">清除框选</button>
        </div>

        <el-button class="!w-full" :loading="extracting" @click="runExtract"> 提取文字 </el-button>

        <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

        <template v-if="resultText">
          <el-input v-model="resultText" type="textarea" :rows="6" />
          <el-button class="!w-full" @click="copyResult">复制文字</el-button>
        </template>
      </template>
    </div>
  </div>
</template>
