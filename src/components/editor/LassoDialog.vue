<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../stores/auth'
import { eraseObject } from '../../services/imageEditApi'

const props = defineProps<{ modelValue: boolean; imageSrc: string }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** 精确抠出圈中的那块——透明底 PNG，作为新元素加到画布 */
  (e: 'cutout', dataUrl: string): void
  /** 去掉圈中的那块——AI inpaint 后的整图，替换当前图 */
  (e: 'result', dataUrl: string): void
}>()

const authStore = useAuthStore()

const canvasEl = ref<HTMLCanvasElement>()
let ctx: CanvasRenderingContext2D | null = null
let sourceImg: HTMLImageElement | null = null
let naturalW = 0
let naturalH = 0
let displayScale = 1

type Pt = { x: number; y: number }
const points = ref<Pt[]>([])
const closed = ref(false)
let dragIdx = -1

const processing = ref(false)
const loadError = ref('')
const GRAB = 9

async function loadImage() {
  loadError.value = ''
  points.value = []
  closed.value = false
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
  naturalW = img.naturalWidth
  naturalH = img.naturalHeight
  const maxDisplay = 480
  displayScale = Math.min(maxDisplay / naturalW, maxDisplay / naturalH, 1)
  await nextTick()
  if (!canvasEl.value) return
  canvasEl.value.width = Math.round(naturalW * displayScale)
  canvasEl.value.height = Math.round(naturalH * displayScale)
  ctx = canvasEl.value.getContext('2d')
  redraw()
}

watch(() => [props.modelValue, props.imageSrc], ([open]) => { if (open) loadImage() })

function pos(e: PointerEvent): Pt {
  const r = canvasEl.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function nearIdx(p: Pt): number {
  for (let i = 0; i < points.value.length; i++) {
    const q = points.value[i]
    if (Math.hypot(q.x - p.x, q.y - p.y) <= GRAB) return i
  }
  return -1
}

function onDown(e: PointerEvent) {
  const p = pos(e)
  if (closed.value) {
    dragIdx = nearIdx(p)
    return
  }
  // 点回起点 → 闭合
  if (points.value.length >= 3 && Math.hypot(points.value[0].x - p.x, points.value[0].y - p.y) <= GRAB) {
    closed.value = true
    redraw()
    return
  }
  points.value.push(p)
  redraw()
}

function onMove(e: PointerEvent) {
  if (dragIdx < 0) return
  points.value[dragIdx] = pos(e)
  redraw()
}

function onUp() {
  dragIdx = -1
}

function undoPoint() {
  if (closed.value) {
    closed.value = false
    return
  }
  points.value.pop()
  redraw()
}

function reset() {
  points.value = []
  closed.value = false
  redraw()
}

function closePath() {
  if (points.value.length < 3) {
    ElMessage.warning('至少点 3 个点')
    return
  }
  closed.value = true
  redraw()
}

function redraw() {
  if (!ctx || !sourceImg || !canvasEl.value) return
  const w = canvasEl.value.width
  const h = canvasEl.value.height
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(sourceImg, 0, 0, w, h)
  if (!points.value.length) return

  ctx.save()
  ctx.beginPath()
  points.value.forEach((p, i) => (i ? ctx!.lineTo(p.x, p.y) : ctx!.moveTo(p.x, p.y)))
  if (closed.value) ctx.closePath()
  ctx.strokeStyle = '#7c3aed'
  ctx.lineWidth = 1.5
  ctx.setLineDash(closed.value ? [] : [5, 4])
  ctx.stroke()
  if (closed.value) {
    ctx.fillStyle = 'rgba(124,58,237,0.16)'
    ctx.fill()
  }
  ctx.restore()

  points.value.forEach((p, i) => {
    ctx!.beginPath()
    ctx!.arc(p.x, p.y, i === 0 && !closed.value ? 5 : 3.5, 0, Math.PI * 2)
    ctx!.fillStyle = i === 0 && !closed.value ? '#f59e0b' : '#7c3aed'
    ctx!.fill()
    ctx!.strokeStyle = '#fff'
    ctx!.lineWidth = 1.5
    ctx!.stroke()
  })
}

/** 把显示坐标的多边形路径按自然分辨率画到给定 ctx */
function tracePathNatural(c: CanvasRenderingContext2D) {
  c.beginPath()
  points.value.forEach((p, i) => {
    const x = p.x / displayScale
    const y = p.y / displayScale
    if (i) c.lineTo(x, y)
    else c.moveTo(x, y)
  })
  c.closePath()
}

function doCutout() {
  if (!closed.value || points.value.length < 3) {
    ElMessage.warning('先圈好一块（点回起点或按"闭合"）')
    return
  }
  if (!sourceImg) return
  const out = document.createElement('canvas')
  out.width = naturalW
  out.height = naturalH
  const c = out.getContext('2d')!
  tracePathNatural(c)
  c.clip()
  c.drawImage(sourceImg, 0, 0)
  emit('cutout', out.toDataURL('image/png'))
  emit('update:modelValue', false)
}

async function doErase() {
  if (!closed.value || points.value.length < 3) {
    ElMessage.warning('先圈好一块（点回起点或按"闭合"）')
    return
  }
  const mask = document.createElement('canvas')
  mask.width = naturalW
  mask.height = naturalH
  const c = mask.getContext('2d')!
  c.fillStyle = '#000'
  c.fillRect(0, 0, naturalW, naturalH)
  c.globalCompositeOperation = 'destination-out'
  tracePathNatural(c)
  c.fill()
  processing.value = true
  try {
    const result = await eraseObject(
      authStore.isAuthenticated,
      props.imageSrc,
      mask.toDataURL('image/png'),
      '自然地用周围背景填充圈选区域，不要出现新增物体，保持光影和纹理一致',
    )
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
    title="圈选处理（钢笔）"
    width="580px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon class="mb-3" />
    <template v-else>
      <p class="mb-2 text-xs text-gray-500">
        在图上依次点击描出轮廓 → 点回起点（或按「闭合」）合拢 → 闭合后可拖动顶点微调。比框选更贴形状。
      </p>
      <div class="flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2">
        <canvas
          ref="canvasEl"
          class="max-w-full cursor-crosshair touch-none"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointerleave="onUp"
        />
      </div>

      <div class="mt-3 flex items-center gap-2">
        <el-button size="small" :disabled="!points.length" @click="undoPoint">撤销一步</el-button>
        <el-button size="small" :disabled="!points.length" @click="reset">重来</el-button>
        <el-button size="small" :disabled="closed || points.length < 3" @click="closePath">闭合</el-button>
        <span class="ml-auto text-[11px] text-gray-400">{{ points.length }} 个点{{ closed ? ' · 已闭合' : '' }}</span>
      </div>

      <div class="mt-3 rounded-lg bg-gray-50 p-2 text-[11px] text-gray-500">
        <p><b class="text-gray-700">抠出这块</b>：精确按轮廓从原图裁出来，作为新的可拖动元素加到画布（原图保留）。不花 AI 额度。</p>
        <p class="mt-1">
          <b class="text-gray-700">去掉这块</b>：把圈中的东西（多余文字、杂物…）用 AI 按背景补掉，替换当前图。{{
            authStore.isAuthenticated ? '' : '（未登录为演示模式，返回原图）'
          }}
        </p>
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button :disabled="!closed || processing" @click="doCutout">抠出这块</el-button>
      <el-button type="primary" :loading="processing" :disabled="!closed" @click="doErase">
        {{ processing ? '处理中…' : '去掉这块' }}
      </el-button>
    </template>
  </el-dialog>
</template>
