<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../stores/auth'
import { removeRepeatedWatermark } from '../../services/imageEditApi'

const props = defineProps<{ modelValue: boolean; imageSrc: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'result', dataUrl: string): void
}>()

const authStore = useAuthStore()

const canvasEl = ref<HTMLCanvasElement>()
let ctx: CanvasRenderingContext2D | null = null
let img: HTMLImageElement | null = null
let dw = 0
let dh = 0

const threshold = ref(0.45)
const note = ref('')
const processing = ref(false)
const loadError = ref('')

// 框选：起点/终点（显示坐标）
let dragging = false
let sx = 0
let sy = 0
const box = ref<{ x: number; y: number; w: number; h: number } | null>(null)

async function load() {
  loadError.value = ''
  box.value = null
  note.value = ''
  if (!props.imageSrc) return
  const im = new Image()
  im.crossOrigin = 'anonymous'
  try {
    await new Promise<void>((res, rej) => {
      im.onload = () => res()
      im.onerror = () => rej(new Error())
      im.src = props.imageSrc
    })
  } catch {
    loadError.value = '图片加载失败'
    return
  }
  img = im
  const max = 460
  const s = Math.min(max / im.naturalWidth, max / im.naturalHeight, 1)
  dw = Math.round(im.naturalWidth * s)
  dh = Math.round(im.naturalHeight * s)
  await nextTick()
  if (!canvasEl.value) return
  canvasEl.value.width = dw
  canvasEl.value.height = dh
  ctx = canvasEl.value.getContext('2d')
  redraw()
}

function redraw() {
  if (!ctx || !img) return
  ctx.clearRect(0, 0, dw, dh)
  ctx.drawImage(img, 0, 0, dw, dh)
  if (box.value) {
    ctx.save()
    ctx.strokeStyle = '#7c3aed'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(124,58,237,0.15)'
    ctx.fillRect(box.value.x, box.value.y, box.value.w, box.value.h)
    ctx.strokeRect(box.value.x, box.value.y, box.value.w, box.value.h)
    ctx.restore()
  }
}

function pos(e: PointerEvent) {
  const r = canvasEl.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function onDown(e: PointerEvent) {
  dragging = true
  const p = pos(e)
  sx = p.x
  sy = p.y
  box.value = { x: sx, y: sy, w: 0, h: 0 }
}
function onMove(e: PointerEvent) {
  if (!dragging) return
  const p = pos(e)
  box.value = {
    x: Math.min(sx, p.x),
    y: Math.min(sy, p.y),
    w: Math.abs(p.x - sx),
    h: Math.abs(p.y - sy),
  }
  redraw()
}
function onUp() {
  dragging = false
}

watch(
  () => [props.modelValue, props.imageSrc],
  ([open]) => {
    if (open) load()
  },
)

async function submit() {
  if (!box.value || box.value.w < 6 || box.value.h < 6) {
    ElMessage.warning('先框选一个水印（拉一个矩形框住其中一处）')
    return
  }
  processing.value = true
  try {
    const b: [number, number, number, number] = [
      box.value.x / dw,
      box.value.y / dh,
      box.value.w / dw,
      box.value.h / dh,
    ]
    const { url, count } = await removeRepeatedWatermark(authStore.isAuthenticated, props.imageSrc, b, threshold.value)
    emit('result', url)
    emit('update:modelValue', false)
    ElMessage.success(count > 0 ? `已去除 ${count} 处水印` : '未匹配到重复水印，可调低灵敏度或框选更清晰的一处')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '去水印失败，请重试')
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="批量去水印（框一处，去全部相同的）"
    width="560px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-alert
      :title="authStore.isAuthenticated ? '已登录，使用真实处理' : '演示模式：结果为原图，登录后生效'"
      :type="authStore.isAuthenticated ? 'success' : 'info'"
      :closable="false"
      show-icon
      class="mb-3"
    />
    <p class="mb-2 text-xs text-gray-500">
      拉一个矩形框住<b>一处完整的</b>水印，找出所有相同的一次性去掉。best-effort：边缘残缺的、
      特别淡的可能去不干净，剩下的少量再用「涂抹消除」补。灵敏度调低能多匹配、但可能误伤。
    </p>

    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon class="mb-3" />

    <div class="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2">
      <canvas
        ref="canvasEl"
        class="cursor-crosshair"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointerleave="onUp"
      />
    </div>

    <div class="mt-3 flex items-center gap-2">
      <span class="shrink-0 text-xs text-gray-500">匹配灵敏度</span>
      <el-slider v-model="threshold" :min="0.35" :max="0.85" :step="0.02" class="!w-40" />
      <span class="text-[11px] text-gray-400">低=多匹配（可能误伤），高=只匹配很像的</span>
    </div>

    <el-input v-model="note" class="mt-3" size="small" placeholder="水印文字 / 说明（选填，仅备注）" maxlength="40" />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="processing" @click="submit">
        {{ processing ? '处理中…' : '去除全部' }}
      </el-button>
    </template>
  </el-dialog>
</template>
