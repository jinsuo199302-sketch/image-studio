<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { removeBackground } from '../../../../services/backgroundRemovalApi'
import { detectFace, type FaceBox } from '../../../../services/faceDetectApi'
import { computeDrawRect } from '../../../../services/idPhotoLayout'
import { embedPngDpi } from '../../../../services/pngDpi'

const authStore = useAuthStore()

interface SizePreset {
  key: string
  label: string
  mmW: number
  mmH: number
}
/** 常见的遗像/框装照片尺寸，5/6/7 寸偏家用摆放，8/10 寸多用于灵堂或公墓展示 */
const SIZE_PRESETS: SizePreset[] = [
  { key: '5inch', label: '5寸 (89×127mm)', mmW: 89, mmH: 127 },
  { key: '6inch', label: '6寸 (102×152mm)', mmW: 102, mmH: 152 },
  { key: '7inch', label: '7寸 (127×178mm)', mmW: 127, mmH: 178 },
  { key: '8inch', label: '8寸 (152×203mm)', mmW: 152, mmH: 203 },
  { key: '10inch', label: '10寸 (203×254mm)', mmW: 203, mmH: 254 },
]
const sizePreset = ref(SIZE_PRESETS[1])

const BG_COLORS = [
  { label: '白色', value: '#ffffff' },
  { label: '浅灰', value: '#d4d4d4' },
  { label: '黑色', value: '#1a1a1a' },
]
const bgColor = ref(BG_COLORS[0].value)

const fileInput = ref<HTMLInputElement>()
const rawFile = ref<File | null>(null)
const rawImage = ref<string | null>(null)
const cutoutImage = ref<string | null>(null)
const faceBox = ref<FaceBox | null>(null)
const processing = ref(false)

const previewEl = ref<HTMLCanvasElement>()
const PREVIEW_SCALE = 3
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
  rawFile.value = file
  const reader = new FileReader()
  reader.onload = () => {
    rawImage.value = reader.result as string
    cutoutImage.value = null
    faceBox.value = null
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function runProcess() {
  if (!rawImage.value) return
  processing.value = true
  try {
    const [cutout, face] = await Promise.all([
      // 遗像要贴纯色底，用 hard 档：硬边 + 收边 + 边缘去色，避免"发虚 / 脏描边"
      removeBackground(authStore.isAuthenticated, rawImage.value, 'hard'),
      rawFile.value ? detectFace(rawFile.value).catch(() => null) : Promise.resolve(null),
    ])
    cutoutImage.value = cutout
    faceBox.value = face
    zoom.value = 1
    offsetX.value = 0
    offsetY.value = 0
  } catch {
    ElMessage.error('处理失败，请重试')
  } finally {
    processing.value = false
  }
}

/** 单张照片渲染到指定尺寸画布——灰度转换用 canvas 的 filter，画完再清掉，不影响背景色本身 */
function renderPhoto(w: number, h: number, offsetScale: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = bgColor.value
  ctx.fillRect(0, 0, w, h)
  if (cutoutImg) {
    const rect = computeDrawRect({
      canvasW: w,
      canvasH: h,
      imgW: cutoutImg.naturalWidth,
      imgH: cutoutImg.naturalHeight,
      faceBox: faceBox.value,
      zoom: zoom.value,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
      offsetScale,
    })
    ctx.filter = 'grayscale(100%)'
    ctx.drawImage(cutoutImg, rect.drawX, rect.drawY, rect.drawW, rect.drawH)
    ctx.filter = 'none'
  }
  return c
}

function drawPreview() {
  const canvas = previewEl.value
  if (!canvas || !cutoutImg) return
  const w = sizePreset.value.mmW * PREVIEW_SCALE
  const h = sizePreset.value.mmH * PREVIEW_SCALE
  const rendered = renderPhoto(w, h, 1)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(rendered, 0, 0)
}

watch([cutoutImage, faceBox, sizePreset, bgColor, zoom, offsetX, offsetY], async () => {
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
  if (!cutoutImg) return
  const dpi = 300
  const w = Math.round((sizePreset.value.mmW / 25.4) * dpi)
  const h = Math.round((sizePreset.value.mmH / 25.4) * dpi)
  const scaleFactor = w / (sizePreset.value.mmW * PREVIEW_SCALE)
  const rendered = renderPhoto(w, h, scaleFactor)
  const a = document.createElement('a')
  a.href = embedPngDpi(rendered.toDataURL('image/png'), dpi)
  a.download = `黑白照片-${sizePreset.value.key}.png`
  a.click()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，使用真实抠图接口' : '演示模式：处理结果为原图占位，登录后自动切换'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
      <p class="mt-2 text-[11px] text-gray-400">用于制作黑白纪念照片，支持常见的相纸/相框尺寸</p>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!rawImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传一张照片</span>
      </div>

      <template v-else-if="!cutoutImage">
        <img :src="rawImage" class="max-h-48 w-full rounded-lg border border-gray-200 object-contain" />
        <el-button type="primary" class="!w-full !bg-violet-500 !border-none" :loading="processing" @click="runProcess">
          生成黑白照片
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
            class="max-h-72 max-w-full cursor-move"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointerleave="onPointerUp"
          />
        </div>
        <el-slider v-model="zoom" :min="0.5" :max="2" :step="0.05" />

        <el-button class="!w-full" :loading="processing" @click="runProcess">重新生成</el-button>
        <el-button type="primary" class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none" @click="download">
          下载
        </el-button>
      </template>
    </div>
  </div>
</template>
