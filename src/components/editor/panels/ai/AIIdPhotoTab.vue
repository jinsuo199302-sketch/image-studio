<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { removeBackground } from '../../../../services/backgroundRemovalApi'

const authStore = useAuthStore()

interface SizePreset {
  key: string
  label: string
  mmW: number
  mmH: number
}
const SIZE_PRESETS: SizePreset[] = [
  { key: '1inch', label: '一寸 (25×35mm)', mmW: 25, mmH: 35 },
  { key: '2inch', label: '二寸 (35×49mm)', mmW: 35, mmH: 49 },
  { key: 'small2inch', label: '小二寸 (35×45mm)', mmW: 35, mmH: 45 },
  { key: 'big2inch', label: '大二寸 (35×53mm)', mmW: 35, mmH: 53 },
]
const sizePreset = ref(SIZE_PRESETS[0])

const BG_COLORS = [
  { label: '白色', value: '#ffffff' },
  { label: '红色', value: '#ff0000' },
  { label: '蓝色', value: '#438edb' },
  { label: '灰色', value: '#acacac' },
]
const bgColor = ref(BG_COLORS[0].value)

const fileInput = ref<HTMLInputElement>()
const rawImage = ref<string | null>(null)
const cutoutImage = ref<string | null>(null)
const processing = ref(false)

const previewEl = ref<HTMLCanvasElement>()
const PREVIEW_SCALE = 6 // 预览画布放大倍数（mm 太小直接当 px 用不方便拖拽/看清）
let cutoutImg: HTMLImageElement | null = null
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
let dragging = false
let dragStartX = 0
let dragStartY = 0
let dragOrigX = 0
let dragOrigY = 0

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    rawImage.value = reader.result as string
    cutoutImage.value = null
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function runCutout() {
  if (!rawImage.value) return
  processing.value = true
  try {
    cutoutImage.value = await removeBackground(authStore.isAuthenticated, rawImage.value)
    zoom.value = 1
    offsetX.value = 0
    offsetY.value = 0
    ElMessage.success('抠图完成，可以调整位置/大小了')
  } catch {
    ElMessage.error('抠图失败，请重试')
  } finally {
    processing.value = false
  }
}

function drawPreview() {
  const canvas = previewEl.value
  if (!canvas || !cutoutImg) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = sizePreset.value.mmW * PREVIEW_SCALE
  const h = sizePreset.value.mmH * PREVIEW_SCALE
  canvas.width = w
  canvas.height = h
  ctx.fillStyle = bgColor.value
  ctx.fillRect(0, 0, w, h)

  // 默认把人像的高度铺满画布的 92%，居中——没有人脸检测，先给个通常好用的默认框，
  // 用户自己再拖/缩放微调
  const baseScale = (h * 0.92) / cutoutImg.naturalHeight
  const drawW = cutoutImg.naturalWidth * baseScale * zoom.value
  const drawH = cutoutImg.naturalHeight * baseScale * zoom.value
  const drawX = (w - drawW) / 2 + offsetX.value
  const drawY = (h - drawH) / 2 + offsetY.value
  ctx.drawImage(cutoutImg, drawX, drawY, drawW, drawH)
}

watch([cutoutImage, sizePreset, bgColor, zoom, offsetX, offsetY], async () => {
  if (!cutoutImage.value) return
  if (!cutoutImg || cutoutImg.src !== cutoutImage.value) {
    cutoutImg = new Image()
    cutoutImg.src = cutoutImage.value
    await new Promise((resolve) => {
      cutoutImg!.onload = resolve
    })
  }
  await nextTick()
  drawPreview()
})

function onPointerDown(e: PointerEvent) {
  dragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragOrigX = offsetX.value
  dragOrigY = offsetY.value
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  offsetX.value = dragOrigX + (e.clientX - dragStartX)
  offsetY.value = dragOrigY + (e.clientY - dragStartY)
}
function onPointerUp() {
  dragging = false
}

function download() {
  if (!previewEl.value) return
  // 导出按 300dpi 印刷精度重新画一遍，不是直接截预览画布——预览画布是给拖拽用的低倍缩放，
  // 直接导出会糊
  const dpi = 300
  const w = Math.round((sizePreset.value.mmW / 25.4) * dpi)
  const h = Math.round((sizePreset.value.mmH / 25.4) * dpi)
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = w
  exportCanvas.height = h
  const ctx = exportCanvas.getContext('2d')!
  ctx.fillStyle = bgColor.value
  ctx.fillRect(0, 0, w, h)
  if (cutoutImg) {
    const scaleFactor = w / (sizePreset.value.mmW * PREVIEW_SCALE)
    const baseScale = (h * 0.92) / cutoutImg.naturalHeight
    const drawW = cutoutImg.naturalWidth * baseScale * zoom.value
    const drawH = cutoutImg.naturalHeight * baseScale * zoom.value
    const drawX = (w - drawW) / 2 + offsetX.value * scaleFactor
    const drawY = (h - drawH) / 2 + offsetY.value * scaleFactor
    ctx.drawImage(cutoutImg, drawX, drawY, drawW, drawH)
  }
  const a = document.createElement('a')
  a.href = exportCanvas.toDataURL('image/png')
  a.download = `证件照-${sizePreset.value.key}.png`
  a.click()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，使用真实抠图接口' : '演示模式：抠图结果为原图占位，登录后自动切换'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!rawImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传一张正面照片，自动抠图换底色</span>
      </div>

      <template v-else-if="!cutoutImage">
        <img :src="rawImage" class="max-h-48 w-full rounded-lg border border-gray-200 object-contain" />
        <el-button type="primary" class="!w-full !bg-violet-500 !border-none" :loading="processing" @click="runCutout">
          抠图并生成证件照
        </el-button>
      </template>

      <template v-else>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">尺寸</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in SIZE_PRESETS"
              :key="p.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="sizePreset.key === p.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="sizePreset = p"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">背景色</label>
          <div class="flex gap-2">
            <button
              v-for="c in BG_COLORS"
              :key="c.value"
              class="h-7 w-7 rounded-full border-2 transition"
              :class="bgColor === c.value ? 'border-violet-500' : 'border-gray-200'"
              :style="{ backgroundColor: c.value }"
              :title="c.label"
              @click="bgColor = c.value"
            />
          </div>
        </div>

        <p class="text-[11px] text-gray-400">拖动照片调整位置，用下面的滑块调整大小</p>
        <div class="flex justify-center rounded-lg border border-gray-200 bg-gray-50 p-2">
          <canvas
            ref="previewEl"
            class="cursor-move"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
          />
        </div>
        <el-slider v-model="zoom" :min="0.5" :max="2" :step="0.05" />

        <el-button class="!w-full" :loading="processing" @click="runCutout">重新抠图</el-button>
        <el-button type="primary" class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none" @click="download">
          下载证件照
        </el-button>
      </template>
    </div>
  </div>
</template>
