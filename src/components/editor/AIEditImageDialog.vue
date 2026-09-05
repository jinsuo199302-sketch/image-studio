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

/** whole = 整张图都送去改（蒙版全透明），region = 只涂抹的区域改（跟「消除」同一套画法） */
const mode = ref<'whole' | 'region'>('region')
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
    loadError.value = '图片加载失败，无法涂抹区域'
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

  // 蒙版层：黑色不透明 = 保留原样，涂抹挖出透明的地方才是要重绘的区域
  maskCtx.globalCompositeOperation = 'source-over'
  maskCtx.fillStyle = '#000000'
  maskCtx.fillRect(0, 0, naturalWidth, naturalHeight)
}

watch(
  () => [props.modelValue, props.imageSrc],
  ([open]) => {
    if (open) {
      prompt.value = ''
      mode.value = 'region'
      loadImage()
    }
  },
)

function pointerPos(e: PointerEvent) {
  const rect = displayCanvasEl.value!.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function paintAt(x: number, y: number) {
  if (!displayCtx || !maskCtx) return
  displayCtx.save()
  displayCtx.globalAlpha = 0.5
  displayCtx.fillStyle = '#8b5cf6'
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
  if (mode.value !== 'region') return
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
  if (!prompt.value.trim()) {
    ElMessage.warning('先描述一下想怎么改')
    return
  }
  if (mode.value === 'region' && !hasPainted.value) {
    ElMessage.warning('先在图片上涂抹要修改的区域，或者切换到「整张图」模式')
    return
  }
  if (!maskCanvasEl.value) return
  processing.value = true
  try {
    let maskDataUrl: string
    if (mode.value === 'whole') {
      // 整张图模式：蒙版全透明，代表整张图都交给 AI 按 prompt 重绘
      const c = document.createElement('canvas')
      c.width = naturalWidth
      c.height = naturalHeight
      maskDataUrl = c.toDataURL('image/png')
    } else {
      maskDataUrl = maskCanvasEl.value.toDataURL('image/png')
    }
    const result = await eraseObject(authStore.isAuthenticated, props.imageSrc, maskDataUrl, prompt.value.trim())
    emit('result', result)
    emit('update:modelValue', false)
    ElMessage.success('处理完成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '处理失败，请重试')
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="AI 改图"
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

    <div class="mb-2 flex gap-1.5">
      <button
        class="flex-1 rounded-md border px-2 py-1.5 text-xs transition"
        :class="mode === 'region' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = 'region'"
      >
        涂抹区域改
      </button>
      <button
        class="flex-1 rounded-md border px-2 py-1.5 text-xs transition"
        :class="mode === 'whole' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = 'whole'"
      >
        整张图都改
      </button>
    </div>
    <p class="mb-2 text-xs text-gray-500">
      {{ mode === 'region' ? '用鼠标在图片上涂抹想改的区域，可以涂多处，再描述想改成什么' : '不用涂抹，直接描述想把整张图改成什么样子' }}
    </p>

    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon class="mb-3" />

    <div class="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2">
      <canvas
        ref="displayCanvasEl"
        :class="mode === 'region' ? 'cursor-crosshair' : ''"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
      />
    </div>
    <canvas ref="maskCanvasEl" class="hidden" />

    <div v-if="mode === 'region'" class="mt-3 flex items-center gap-2">
      <span class="text-xs text-gray-500">笔刷大小</span>
      <el-slider v-model="brushSize" :min="10" :max="80" class="!w-40" />
      <el-button size="small" @click="clearMask">清除涂抹</el-button>
    </div>

    <el-input
      v-model="prompt"
      type="textarea"
      :rows="2"
      class="mt-3"
      :placeholder="
        mode === 'region'
          ? '描述涂抹区域要变成什么，比如“把背包换成红色”“加一顶圣诞帽”'
          : '描述整张图要改成什么样，比如“把天空换成日落”“变成水彩画风格”'
      "
    />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="processing" @click="submit">
        {{ processing ? '处理中…' : '开始处理' }}
      </el-button>
    </template>
  </el-dialog>
</template>
