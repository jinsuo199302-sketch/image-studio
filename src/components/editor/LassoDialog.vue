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
  /** 去掉圈中的那块——处理后的整图，替换当前图 */
  (e: 'result', dataUrl: string): void
}>()

const authStore = useAuthStore()

/** 钢笔笔尖光标（尖端对准 hotspot 2,2） */
const PEN_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><path d='M2 2 L11 5 L5 11 Z' fill='%23111827' stroke='%23ffffff' stroke-width='1.2'/><path d='M10.5 5.5 L17 12' stroke='%23111827' stroke-width='2.4' stroke-linecap='round'/><path d='M10.5 5.5 L17 12' stroke='%23ffffff' stroke-width='0.8' stroke-linecap='round'/></svg>\") 2 2, crosshair"

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
const regenPrompt = ref('')
const GRAB = 9

async function loadImage() {
  loadError.value = ''
  points.value = []
  closed.value = false
  regenPrompt.value = ''
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
    redraw()
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

/** PS 钢笔风格的锚点：白色小方块 + 深色描边；起点用实心菱形标出来 */
function drawAnchor(c: CanvasRenderingContext2D, p: Pt, isStart: boolean) {
  c.save()
  c.translate(p.x, p.y)
  if (isStart && !closed.value) {
    c.rotate(Math.PI / 4)
    c.fillStyle = '#7c3aed'
    c.strokeStyle = '#fff'
    c.lineWidth = 1.5
    c.beginPath()
    c.rect(-4, -4, 8, 8)
    c.fill()
    c.stroke()
  } else {
    c.fillStyle = '#fff'
    c.strokeStyle = '#7c3aed'
    c.lineWidth = 1.5
    c.beginPath()
    c.rect(-3.5, -3.5, 7, 7)
    c.fill()
    c.stroke()
  }
  c.restore()
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

  points.value.forEach((p, i) => drawAnchor(ctx!, p, i === 0))
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

function guardClosed(): boolean {
  if (!closed.value || points.value.length < 3) {
    ElMessage.warning('先圈好一块（点回起点或按「闭合」）')
    return false
  }
  return !!sourceImg
}

function doCutout() {
  if (!guardClosed()) return
  const out = document.createElement('canvas')
  out.width = naturalW
  out.height = naturalH
  const c = out.getContext('2d')!
  tracePathNatural(c)
  c.clip()
  c.drawImage(sourceImg!, 0, 0)
  const url = out.toDataURL('image/png')
  emit('update:modelValue', false)
  emit('cutout', url)
}

/**
 * 本地"涂背景"去掉圈中内容：取圈线外侧一圈像素的平均色，把圈内填成这个色，边缘羽化。
 * 对"浅色/纯色背景上的多余文字"最管用（手抄报最常见），瞬间完成、不花额度。
 */
function doLocalFill() {
  if (!guardClosed()) return
  const out = document.createElement('canvas')
  out.width = naturalW
  out.height = naturalH
  const c = out.getContext('2d')!
  c.drawImage(sourceImg!, 0, 0)

  // 外侧一圈的 mask：粗描边多边形 → 再挖掉内部 → 只剩圈外的带
  const band = Math.max(14, Math.round(Math.min(naturalW, naturalH) * 0.025))
  const rm = document.createElement('canvas')
  rm.width = naturalW
  rm.height = naturalH
  const rc = rm.getContext('2d')!
  rc.strokeStyle = '#fff'
  rc.lineWidth = band * 2
  rc.lineJoin = 'round'
  tracePathNatural(rc)
  rc.stroke()
  rc.globalCompositeOperation = 'destination-out'
  tracePathNatural(rc)
  rc.fill()

  const ring = rc.getImageData(0, 0, naturalW, naturalH).data
  const src = c.getImageData(0, 0, naturalW, naturalH).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < ring.length; i += 4) {
    if (ring[i + 3] > 128) {
      r += src[i]
      g += src[i + 1]
      b += src[i + 2]
      n++
    }
  }
  if (!n) {
    ElMessage.error('取不到周围背景色，换个圈法或用「AI 补背景」')
    return
  }
  const avg = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`

  // 硬填 + 一圈羽化描边，让边界过渡自然
  c.save()
  tracePathNatural(c)
  c.clip()
  c.fillStyle = avg
  c.fillRect(0, 0, naturalW, naturalH)
  c.restore()
  c.save()
  c.filter = 'blur(3px)'
  c.strokeStyle = avg
  c.lineWidth = 8
  c.lineJoin = 'round'
  tracePathNatural(c)
  c.stroke()
  c.restore()

  const url = out.toDataURL('image/png')
  emit('update:modelValue', false)
  emit('result', url)
  ElMessage.success('已用周围背景色盖掉')
}

/** 多边形 → inpaint mask（圈内透明=要重绘，圈外黑=保持） */
function buildPolygonMask(): string {
  const mask = document.createElement('canvas')
  mask.width = naturalW
  mask.height = naturalH
  const c = mask.getContext('2d')!
  c.fillStyle = '#000'
  c.fillRect(0, 0, naturalW, naturalH)
  c.globalCompositeOperation = 'destination-out'
  tracePathNatural(c)
  c.fill()
  return mask.toDataURL('image/png')
}

async function runInpaint(prompt: string, okMsg: string) {
  processing.value = true
  try {
    const result = await eraseObject(authStore.isAuthenticated, props.imageSrc, buildPolygonMask(), prompt)
    emit('update:modelValue', false)
    emit('result', result)
    ElMessage.success(authStore.isAuthenticated ? okMsg : '演示模式：未登录，返回的是原图')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '处理失败，请重试')
  } finally {
    processing.value = false
  }
}

/** 复杂纹理背景才用：多边形转 mask 交给 AI inpaint 补背景 */
function doAiErase() {
  if (!guardClosed()) return
  runInpaint(
    '自然地用周围背景填充圈选区域，不要出现新增物体，保持光影和纹理一致',
    'AI 处理完成',
  )
}

/** 圈住的素材 AI 重画：只重绘圈内，大小位置由 mask 决定、天然不变 */
function doAiRegen() {
  if (!guardClosed()) return
  const t = regenPrompt.value.trim()
  const prompt = t
    ? `在圈选区域画：${t}。画风、线条、颜色、光影和画面其它部分完全一致；大小和位置不变；只改这一块，圈外一点都不要动。`
    : '把圈选区域里的图案按原来的样子重新画一遍，更精细、线条更干净；画风和位置大小保持不变；只动这一块，圈外一点都不要动。'
  runInpaint(prompt, '已按提示重画这块')
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
          class="max-w-full touch-none"
          :style="{ cursor: PEN_CURSOR }"
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

      <div class="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 p-2">
        <p class="mb-1 text-[11px] font-medium text-violet-700">AI 重画这块（大小位置不变，只改圈内）</p>
        <el-input
          v-model="regenPrompt"
          size="small"
          placeholder="想换成什么？留空 = 按原样重画得更精细。例：换成一朵向日葵"
          maxlength="40"
          @keyup.enter="doAiRegen"
        />
        <el-button
          type="primary"
          size="small"
          class="mt-1.5 !w-full"
          :disabled="!closed"
          :loading="processing"
          @click="doAiRegen"
        >
          {{ closed ? 'AI 重画这块' : '先圈好一块再点' }}
        </el-button>
        <p v-if="!authStore.isAuthenticated" class="mt-1 text-[10px] text-gray-400">
          未登录是演示模式，会返回原图
        </p>
      </div>

      <div class="mt-3 rounded-lg bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-500">
        <p><b class="text-gray-700">抠出这块</b>：精确按轮廓从原图裁出来，作为新的可拖动元素加到画布（原图保留）。</p>
        <p class="mt-1">
          <b class="text-gray-700">去掉这块</b>：取圈线周围的背景色，把圈中内容（多余文字、杂物…）盖掉。
          浅色/纯色背景最管用，瞬间完成、不花额度；背景是复杂纹理盖不干净时改用
          <el-button link type="primary" size="small" :disabled="!closed" :loading="processing" @click="doAiErase">AI 补背景</el-button>。
        </p>
      </div>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button :disabled="!closed || processing" @click="doCutout">抠出这块</el-button>
      <el-button type="primary" :disabled="!closed || processing" @click="doLocalFill">去掉这块</el-button>
    </template>
  </el-dialog>
</template>
