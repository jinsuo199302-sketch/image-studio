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
const maskCanvasEl = ref<HTMLCanvasElement>()
let displayCtx: CanvasRenderingContext2D | null = null
let maskCtx: CanvasRenderingContext2D | null = null
let naturalWidth = 0
let naturalHeight = 0
let displayScale = 1
let painting = false
const hasPainted = ref(false)

const brushSize = ref(30)
const prompt = ref('')
const processing = ref(false)
const loadError = ref('')

async function loadImage() {
  loadError.value = ''
  hasPainted.value = false
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
    loadError.value = '图片加载失败，无法涂抹蒙版'
    return
  }
  naturalWidth = img.naturalWidth
  naturalHeight = img.naturalHeight

  const maxDisplay = 460
  displayScale = Math.min(maxDisplay / naturalWidth, maxDisplay / naturalHeight, 1)
  const dw = Math.round(naturalWidth * displayScale)
  const dh = Math.round(naturalHeight * displayScale)

  await nextTick()
  if (!displayCanvasEl.value || !maskCanvasEl.value) return
  displayCanvasEl.value.width = dw
  displayCanvasEl.value.height = dh
  maskCanvasEl.value.width = naturalWidth
  maskCanvasEl.value.height = naturalHeight

  displayCtx = displayCanvasEl.value.getContext('2d')
  maskCtx = maskCanvasEl.value.getContext('2d')
  if (!displayCtx || !maskCtx) return

  displayCtx.clearRect(0, 0, dw, dh)
  displayCtx.drawImage(img, 0, 0, dw, dh)

  maskCtx.globalCompositeOperation = 'source-over'
  maskCtx.fillStyle = '#000000'
  maskCtx.fillRect(0, 0, naturalWidth, naturalHeight)
}

watch(
  () => [props.modelValue, props.imageSrc],
  ([open]) => {
    if (open) {
      prompt.value = ''
      loadImage()
    }
  },
)

function pointerPos(e: PointerEvent) {
  const rect = displayCanvasEl.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

/** 显示层画半透明红色笔刷提示涂抹范围；蒙版层用 destination-out 挖空对应区域（alpha=0 代表要重绘的部分） */
function paintAt(x: number, y: number) {
  if (!displayCtx || !maskCtx) return
  displayCtx.save()
  displayCtx.globalAlpha = 0.5
  displayCtx.fillStyle = '#ef4444'
  displayCtx.beginPath()
  displayCtx.arc(x, y, brushSize.value / 2, 0, Math.PI * 2)
  displayCtx.fill()
  displayCtx.restore()

  const mx = x / displayScale
  const my = y / displayScale
  maskCtx.save()
  maskCtx.globalCompositeOperation = 'destination-out'
  maskCtx.beginPath()
  maskCtx.arc(mx, my, brushSize.value / 2 / displayScale, 0, Math.PI * 2)
  maskCtx.fill()
  maskCtx.restore()
  hasPainted.value = true
}

function onPointerDown(e: PointerEvent) {
  painting = true
  const { x, y } = pointerPos(e)
  paintAt(x, y)
}
function onPointerMove(e: PointerEvent) {
  if (!painting) return
  const { x, y } = pointerPos(e)
  paintAt(x, y)
}
function onPointerUp() {
  painting = false
}

function clearMask() {
  loadImage()
}

async function submit() {
  if (!hasPainted.value) {
    ElMessage.warning('先在图片上涂抹要消除的区域')
    return
  }
  if (!maskCanvasEl.value) return
  processing.value = true
  try {
    const maskDataUrl = maskCanvasEl.value.toDataURL('image/png')
    const finalPrompt =
      prompt.value.trim() || '自然地用周围背景填充涂抹区域，不要出现新增物体，保持光影和纹理一致'
    const result = await eraseObject(authStore.isAuthenticated, props.imageSrc, maskDataUrl, finalPrompt)
    emit('result', result)
    emit('update:modelValue', false)
    ElMessage.success('处理完成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '消除失败，请重试')
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="AI 消除 / 去水印"
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
    <p class="mb-2 text-xs text-gray-500">
      用鼠标在图片上涂抹想去掉的物体或水印，可以涂多处，涂完点"开始处理"
    </p>

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
    <canvas ref="maskCanvasEl" class="hidden" />

    <div class="mt-3 flex items-center gap-2">
      <span class="text-xs text-gray-500">笔刷大小</span>
      <el-slider v-model="brushSize" :min="10" :max="80" class="!w-40" />
      <el-button size="small" @click="clearMask">清除涂抹</el-button>
    </div>

    <el-input
      v-model="prompt"
      class="mt-3"
      placeholder="可选：描述涂抹区域要变成什么，留空则自动用背景自然填充"
      size="small"
    />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="processing" @click="submit">
        {{ processing ? '处理中…' : '开始处理' }}
      </el-button>
    </template>
  </el-dialog>
</template>
