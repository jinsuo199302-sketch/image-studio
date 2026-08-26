<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../stores/auth'
import { eraseObject } from '../../services/imageEditApi'

const props = defineProps<{ modelValue: boolean; imageSrc: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'result', dataUrl: string): void
}>()

const authStore = useAuthStore()

const displayCanvasEl = ref<HTMLCanvasElement>()
let naturalWidth = 0
let naturalHeight = 0
let displayScale = 1
let loadedImg: HTMLImageElement | null = null

const newText = ref('')
const processing = ref(false)
const loadError = ref('')

const dragging = ref(false)
const startX = ref(0)
const startY = ref(0)
/** 框选矩形，单位是显示画布上的像素——跟涂抹蒙版不同，文字替换的目标区域天然是矩形，
 * 直接拉框比手绘蒙版更好对齐文字行，也更符合用户对"选中这行字"的直觉 */
const rect = ref<{ x: number; y: number; w: number; h: number } | null>(null)

async function loadImage() {
  loadError.value = ''
  rect.value = null
  if (!props.imageSrc) return
  const img = new Image()
  img.crossOrigin = 'anonymous'
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = props.imageSrc
    })
  } catch {
    loadError.value = '图片加载失败，无法框选'
    return
  }
  loadedImg = img
  naturalWidth = img.naturalWidth
  naturalHeight = img.naturalHeight

  const maxDisplay = 460
  displayScale = Math.min(maxDisplay / naturalWidth, maxDisplay / naturalHeight, 1)
  const dw = Math.round(naturalWidth * displayScale)
  const dh = Math.round(naturalHeight * displayScale)

  await nextTick()
  if (!displayCanvasEl.value) return
  displayCanvasEl.value.width = dw
  displayCanvasEl.value.height = dh
  const ctx = displayCanvasEl.value.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, dw, dh)
  ctx.drawImage(img, 0, 0, dw, dh)
}

watch(
  () => [props.modelValue, props.imageSrc],
  ([open]) => {
    if (open) {
      newText.value = ''
      loadImage()
    }
  },
)

function redraw() {
  if (!displayCanvasEl.value || !loadedImg) return
  const ctx = displayCanvasEl.value.getContext('2d')
  if (!ctx) return
  const dw = displayCanvasEl.value.width
  const dh = displayCanvasEl.value.height
  ctx.clearRect(0, 0, dw, dh)
  ctx.drawImage(loadedImg, 0, 0, dw, dh)
  if (rect.value) {
    ctx.save()
    ctx.strokeStyle = '#8b5cf6'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(139, 92, 246, 0.2)'
    ctx.fillRect(rect.value.x, rect.value.y, rect.value.w, rect.value.h)
    ctx.strokeRect(rect.value.x, rect.value.y, rect.value.w, rect.value.h)
    ctx.restore()
  }
}

function pointerPos(e: PointerEvent) {
  const r = displayCanvasEl.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function onPointerDown(e: PointerEvent) {
  const { x, y } = pointerPos(e)
  dragging.value = true
  startX.value = x
  startY.value = y
  rect.value = { x, y, w: 0, h: 0 }
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const { x, y } = pointerPos(e)
  rect.value = {
    x: Math.min(startX.value, x),
    y: Math.min(startY.value, y),
    w: Math.abs(x - startX.value),
    h: Math.abs(y - startY.value),
  }
  redraw()
}
function onPointerUp() {
  dragging.value = false
}

function clearSelection() {
  rect.value = null
  redraw()
}

async function submit() {
  if (!rect.value || rect.value.w < 4 || rect.value.h < 4) {
    ElMessage.warning('先在图片上框选要替换文字的区域')
    return
  }
  if (!newText.value.trim()) {
    ElMessage.warning('填一下要替换成的文字内容')
    return
  }
  processing.value = true
  try {
    // 蒙版语义跟 AI 消除一样：alpha=0（挖空）的区域会被重绘，其余保持原样——
    // 只是这里挖空的是一个规整矩形，不是手绘形状
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = naturalWidth
    maskCanvas.height = naturalHeight
    const maskCtx = maskCanvas.getContext('2d')!
    maskCtx.fillStyle = '#000000'
    maskCtx.fillRect(0, 0, naturalWidth, naturalHeight)
    maskCtx.globalCompositeOperation = 'destination-out'
    maskCtx.fillRect(
      rect.value.x / displayScale,
      rect.value.y / displayScale,
      rect.value.w / displayScale,
      rect.value.h / displayScale,
    )
    const maskDataUrl = maskCanvas.toDataURL('image/png')

    const prompt = `在选中的矩形区域内，用与原图统一的字体风格、颜色、大小渲染文字"${newText.value.trim()}"，替换掉该区域原有的文字内容，其余画面保持不变，背景和光影纹理保持一致`
    const result = await eraseObject(authStore.isAuthenticated, props.imageSrc, maskDataUrl, prompt)
    emit('result', result)
    emit('update:modelValue', false)
    ElMessage.success('处理完成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '替换失败，请重试')
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="文字替换"
    width="560px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-alert
      :title="authStore.isAuthenticated ? '已登录，使用真实 AI 处理' : '演示模式：处理结果为原图，登录后自动切换'"
      :type="authStore.isAuthenticated ? 'success' : 'info'"
      :closable="false"
      show-icon
      class="mb-3"
    />
    <p class="mb-2 text-xs text-gray-500">在图片上框选要改的那段文字（比如日期/价格/品牌名），再填新内容，AI 会照着原来的字体风格重新画上去</p>

    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon class="mb-3" />

    <div class="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2">
      <canvas
        ref="displayCanvasEl"
        class="cursor-crosshair"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
      />
    </div>

    <div class="mt-3 flex justify-end">
      <el-button size="small" @click="clearSelection">清除选区</el-button>
    </div>

    <el-input v-model="newText" class="mt-3" placeholder="替换成的新文字，例如：限时3折" />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="processing" @click="submit">
        {{ processing ? '处理中…' : '开始替换' }}
      </el-button>
    </template>
  </el-dialog>
</template>
