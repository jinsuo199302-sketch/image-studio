<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { removeBackground } from '../../../../services/backgroundRemovalApi'
import { detectFace, type FaceBox } from '../../../../services/faceDetectApi'

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
const rawFile = ref<File | null>(null)
const rawImage = ref<string | null>(null)
const cutoutImage = ref<string | null>(null)
const faceBox = ref<FaceBox | null>(null)
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

async function runCutout() {
  if (!rawImage.value) return
  processing.value = true
  try {
    // 抠图 + 人脸检测并行发起——两个都要基于原图，互不依赖，没必要串行等
    const [cutout, face] = await Promise.all([
      removeBackground(authStore.isAuthenticated, rawImage.value),
      rawFile.value ? detectFace(rawFile.value).catch(() => null) : Promise.resolve(null),
    ])
    cutoutImage.value = cutout
    faceBox.value = face
    zoom.value = 1
    offsetX.value = 0
    offsetY.value = 0
    ElMessage.success(face ? '抠图完成，已自动按人脸定位' : '抠图完成，可以调整位置/大小了')
  } catch {
    ElMessage.error('抠图失败，请重试')
  } finally {
    processing.value = false
  }
}

/**
 * 人脸检测框（Haar 级联）框住的大致是眉毛到下巴这一段，要往上/下/两侧扩一圈才是
 * "发际线到下巴+两耳"这个证件照真正要框的"头部"范围——这几个扩展系数是参考真实证件照
 * 头部占比标准估的，不是精确算出来的，但比"整张图占92%高度"这种完全不看人脸位置的
 * 粗暴做法准得多（原来的做法在半身/全身照上会把头部挤得很小，这正是用户反馈的问题）。
 */
function computeHeadFrame(imgW: number, imgH: number) {
  if (faceBox.value) {
    const fx = faceBox.value.x * imgW
    const fy = faceBox.value.y * imgH
    const fw = faceBox.value.width * imgW
    const fh = faceBox.value.height * imgH
    const headTop = fy - fh * 0.65
    const headBottom = fy + fh * 1.15
    return {
      headHeight: headBottom - headTop,
      headCenterX: fx + fw / 2,
      headCenterY: (headTop + headBottom) / 2,
      hasFace: true,
    }
  }
  return { headHeight: imgH, headCenterX: imgW / 2, headCenterY: imgH / 2, hasFace: false }
}

/**
 * 预览和导出共用同一套定位计算，避免两处各写一遍导致数值不一致。offsetScale 是因为
 * offsetX/offsetY 这两个拖拽量是在预览画布（低倍缩放）上量出来的像素值，导出画布是
 * 300dpi 高分辨率、跟预览不是同一把尺子，要按两个画布的倍数换算过去才能对上同一个位置
 */
function computeDrawRect(canvasW: number, canvasH: number, offsetScale = 1) {
  if (!cutoutImg) return null
  const frame = computeHeadFrame(cutoutImg.naturalWidth, cutoutImg.naturalHeight)
  // 有人脸检测时，头部占画布高度的 65%、垂直中心落在画布 40% 高度处（上留白略少，
  // 符合常见证件照"头顶留白小、下巴以下留肩部空间"的构图）；没检测到人脸时退回
  // 整图居中占 92% 高度的粗略估算
  const desiredHeadFrac = frame.hasFace ? 0.65 : 0.92
  const targetCenterYFrac = frame.hasFace ? 0.4 : 0.5
  const baseScale = (canvasH * desiredHeadFrac) / frame.headHeight
  const drawW = cutoutImg.naturalWidth * baseScale * zoom.value
  const drawH = cutoutImg.naturalHeight * baseScale * zoom.value
  const headCenterXScaled = frame.headCenterX * baseScale * zoom.value
  const headCenterYScaled = frame.headCenterY * baseScale * zoom.value
  const drawX = canvasW / 2 - headCenterXScaled + offsetX.value * offsetScale
  const drawY = canvasH * targetCenterYFrac - headCenterYScaled + offsetY.value * offsetScale
  return { drawX, drawY, drawW, drawH }
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

  const rect = computeDrawRect(w, h)
  if (!rect) return
  ctx.drawImage(cutoutImg, rect.drawX, rect.drawY, rect.drawW, rect.drawH)
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
  const scaleFactor = w / (sizePreset.value.mmW * PREVIEW_SCALE)
  const rect = computeDrawRect(w, h, scaleFactor)
  if (rect) ctx.drawImage(cutoutImg!, rect.drawX, rect.drawY, rect.drawW, rect.drawH)
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
