<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { removeBackground } from '../../../../services/backgroundRemovalApi'
import { detectFace, type FaceBox } from '../../../../services/faceDetectApi'
import { computeDrawRect, packGrid, PRINT_SHEETS } from '../../../../services/idPhotoLayout'
import { embedPngDpi } from '../../../../services/pngDpi'
import { fixRedEye } from '../../../../services/redEyeApi'
import { convertToCmyk } from '../../../../services/cmykApi'

const authStore = useAuthStore()
const fixingRedEye = ref(false)

async function runFixRedEye() {
  if (!cutoutImage.value) return
  fixingRedEye.value = true
  try {
    const result = await fixRedEye(cutoutImage.value)
    cutoutImage.value = result.image
    ElMessage.success(result.eyesFixed > 0 ? `已修复 ${result.eyesFixed} 只红眼` : '没有检测到需要修复的红眼')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '去红眼失败，请重试')
  } finally {
    fixingRedEye.value = false
  }
}

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

// 美白——纯 canvas 滤镜（提亮+轻微降对比，模拟"磨皮变白"的直观效果），不调用任何 AI，
// 零额外成本。100 是不调整，往上调才会变亮
const whiten = ref(100)

const printSheet = ref(PRINT_SHEETS[1])
const printLayout = ref(packGrid(printSheet.value.mmW, printSheet.value.mmH, sizePreset.value.mmW, sizePreset.value.mmH))
watch([printSheet, sizePreset], () => {
  printLayout.value = packGrid(printSheet.value.mmW, printSheet.value.mmH, sizePreset.value.mmW, sizePreset.value.mmH)
})

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
      // 证件照要贴纯色底，用 hard 档：硬边 + 收边 + 边缘去色，避免"发虚 / 脏描边"
      removeBackground(authStore.isAuthenticated, rawImage.value, 'hard'),
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

  const rect = computeDrawRect({
    canvasW: w,
    canvasH: h,
    imgW: cutoutImg.naturalWidth,
    imgH: cutoutImg.naturalHeight,
    faceBox: faceBox.value,
    zoom: zoom.value,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  })
  ctx.filter = `brightness(${whiten.value}%) contrast(${Math.max(80, 200 - whiten.value)}%)`
  ctx.drawImage(cutoutImg, rect.drawX, rect.drawY, rect.drawW, rect.drawH)
  ctx.filter = 'none'
}

watch([cutoutImage, faceBox, sizePreset, bgColor, zoom, offsetX, offsetY, whiten], async () => {
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

/** 单张证件照按 300dpi 印刷精度画到指定尺寸的画布上，预览和排版打印图共用这一个函数 */
function renderSinglePhoto(w: number, h: number, offsetScale: number): HTMLCanvasElement {
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
    ctx.filter = `brightness(${whiten.value}%) contrast(${Math.max(80, 200 - whiten.value)}%)`
    ctx.drawImage(cutoutImg, rect.drawX, rect.drawY, rect.drawW, rect.drawH)
    ctx.filter = 'none'
  }
  return c
}

function download() {
  if (!previewEl.value) return
  // 导出按 300dpi 印刷精度重新画一遍，不是直接截预览画布——预览画布是给拖拽用的低倍缩放，
  // 直接导出会糊
  const dpi = 300
  const w = Math.round((sizePreset.value.mmW / 25.4) * dpi)
  const h = Math.round((sizePreset.value.mmH / 25.4) * dpi)
  const scaleFactor = w / (sizePreset.value.mmW * PREVIEW_SCALE)
  const photoCanvas = renderSinglePhoto(w, h, scaleFactor)
  const a = document.createElement('a')
  a.href = embedPngDpi(photoCanvas.toDataURL('image/png'), dpi)
  a.download = `证件照-${sizePreset.value.key}.png`
  a.click()
}

const convertingCmyk = ref(false)

async function downloadCmyk() {
  if (!previewEl.value) return
  convertingCmyk.value = true
  try {
    const dpi = 300
    const w = Math.round((sizePreset.value.mmW / 25.4) * dpi)
    const h = Math.round((sizePreset.value.mmH / 25.4) * dpi)
    const scaleFactor = w / (sizePreset.value.mmW * PREVIEW_SCALE)
    const photoCanvas = renderSinglePhoto(w, h, scaleFactor)
    const cmykDataUrl = await convertToCmyk(photoCanvas.toDataURL('image/png'))
    const a = document.createElement('a')
    a.href = cmykDataUrl
    a.download = `证件照-${sizePreset.value.key}-CMYK.jpg`
    a.click()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'CMYK 转换失败，请重试')
  } finally {
    convertingCmyk.value = false
  }
}

/**
 * 排版打印图——把同一张证件照按相纸尺寸重复铺好几份，用户下载这一张直接拿去冲印店
 * 或家用打印机打印，不用自己再排版。张数是按相纸/照片实际尺寸现算的（见 packGrid），
 * 不是照抄某家冲印店的固定数字。
 */
function downloadPrintSheet() {
  if (!cutoutImg) return
  const dpi = 300
  const sheetW = Math.round((printSheet.value.mmW / 25.4) * dpi)
  const sheetH = Math.round((printSheet.value.mmH / 25.4) * dpi)
  const photoW = Math.round((sizePreset.value.mmW / 25.4) * dpi)
  const photoH = Math.round((sizePreset.value.mmH / 25.4) * dpi)
  const { cols, rows, marginMm, gapMm } = printLayout.value
  const marginPx = Math.round((marginMm / 25.4) * dpi)
  const gapPx = Math.round((gapMm / 25.4) * dpi)

  const scaleFactor = photoW / (sizePreset.value.mmW * PREVIEW_SCALE)
  const photoCanvas = renderSinglePhoto(photoW, photoH, scaleFactor)

  const sheetCanvas = document.createElement('canvas')
  sheetCanvas.width = sheetW
  sheetCanvas.height = sheetH
  const ctx = sheetCanvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sheetW, sheetH)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = marginPx + c * (photoW + gapPx)
      const y = marginPx + r * (photoH + gapPx)
      ctx.drawImage(photoCanvas, x, y)
    }
  }
  const a = document.createElement('a')
  a.href = embedPngDpi(sheetCanvas.toDataURL('image/png'), dpi)
  a.download = `证件照排版-${printSheet.value.key}-${sizePreset.value.key}.png`
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

        <label class="mb-1 block text-xs font-medium text-gray-600">美白</label>
        <el-slider v-model="whiten" :min="100" :max="140" :step="2" />

        <el-button class="!w-full" :loading="fixingRedEye" @click="runFixRedEye">一键去红眼</el-button>
        <el-button class="!w-full" :loading="processing" @click="runCutout">重新抠图</el-button>
        <el-button type="primary" class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none" @click="download">
          下载单张证件照（RGB，已含300dpi分辨率信息）
        </el-button>
        <el-button class="!w-full" :loading="convertingCmyk" @click="downloadCmyk">
          下载 CMYK 格式（仅商业印刷厂需要）
        </el-button>
        <p class="text-[11px] text-gray-400">
          普通冲印店/家用打印机用上面的 RGB 就够；CMYK 只有真的要送胶印/丝网印这类商业印刷厂时才需要，且色彩转换不带专业色彩管理，可能偏灰
        </p>

        <div class="border-t border-gray-100 pt-3">
          <label class="mb-1 block text-xs font-medium text-gray-600">排版打印（一张相纸铺多份，直接拿去冲印）</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="s in PRINT_SHEETS"
              :key="s.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="printSheet.key === s.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="printSheet = s"
            >
              {{ s.label }}
            </button>
          </div>
          <p class="mt-1.5 text-[11px] text-gray-400">当前排版：{{ printLayout.cols }}×{{ printLayout.rows }}，共 {{ printLayout.count }} 张</p>
          <el-button class="!mt-2 !w-full" @click="downloadPrintSheet">下载排版打印图</el-button>
        </div>
      </template>
    </div>
  </div>
</template>
