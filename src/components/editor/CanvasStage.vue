<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Canvas, FabricImage, Gradient, Group, IText, Rect, Shadow, filters, type FabricObject } from 'fabric'
import type { CanvasElement, Template } from '../../data/templates'

const props = defineProps<{ template: Template }>()
const emit = defineEmits<{
  (e: 'selection', payload: SelectionInfo | null): void
  (e: 'history', payload: { canUndo: boolean; canRedo: boolean }): void
}>()

export interface SelectionInfo {
  type: 'text' | 'image' | 'rect' | 'other'
  fontSize?: number
  fill?: string
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  underline?: boolean
  textAlign?: string
  lineHeight?: number
  charSpacing?: number
  hasShadow?: boolean
  hasStroke?: boolean
  strokeWidth?: number
  strokeColor?: string
  hasTextBackground?: boolean
  textBackgroundColor?: string
  opacity?: number
  blendMode?: string
  text?: string
  src?: string
}

const canvasEl = ref<HTMLCanvasElement>()
const wrapperEl = ref<HTMLDivElement>()
let canvas: Canvas | null = null
let scale = 1

/** 当前画布逻辑尺寸；初始等于模板尺寸，"尺寸调整"会修改它，与 props.template 脱钩 */
const canvasSize = reactive({ width: props.template.canvasWidth, height: props.template.canvasHeight })

const undoStack: string[] = []
const redoStack: string[] = []
let restoring = false
let historyTimer: ReturnType<typeof setTimeout> | null = null

function pushHistory() {
  if (!canvas || restoring) return
  if (historyTimer) clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    if (!canvas) return
    undoStack.push(JSON.stringify(canvas.toJSON()))
    if (undoStack.length > 30) undoStack.shift()
    redoStack.length = 0
    emitHistory()
  }, 250)
}

function emitHistory() {
  emit('history', { canUndo: undoStack.length > 1, canRedo: redoStack.length > 0 })
}

async function buildFromTemplate(template: Template) {
  if (!canvas) return
  canvas.clear()
  canvas.backgroundColor = template.background
  canvasSize.width = template.canvasWidth
  canvasSize.height = template.canvasHeight

  for (const el of template.elements) {
    if (el.type === 'text') {
      const text = new IText(el.text, {
        left: el.x,
        top: el.y,
        originX: 'left',
        originY: 'top',
        width: el.width,
        fontSize: el.fontSize,
        fontWeight: el.fontWeight ?? 'normal',
        fill: el.color,
        textAlign: el.align ?? 'left',
        fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
      })
      canvas.add(text)
    } else if (el.type === 'rect') {
      const rect = new Rect({
        left: el.x,
        top: el.y,
        originX: 'left',
        originY: 'top',
        width: el.width,
        height: el.height,
        fill: el.fill,
        rx: el.rx ?? 0,
        ry: el.rx ?? 0,
      })
      canvas.add(rect)
    } else if (el.type === 'image') {
      try {
        const img = await FabricImage.fromURL(el.src, { crossOrigin: 'anonymous' })
        img.set({
          left: el.x,
          top: el.y,
          originX: 'left',
          originY: 'top',
          scaleX: el.width / (img.width || el.width),
          scaleY: el.height / (img.height || el.height),
        })
        canvas.add(img)
      } catch {
        // 图片加载失败时跳过，不阻塞其它元素渲染
      }
    }
  }
  canvas.renderAll()
  undoStack.length = 0
  redoStack.length = 0
  undoStack.push(JSON.stringify(canvas.toJSON()))
  emitHistory()
}

function fitCanvas() {
  if (!canvas || !wrapperEl.value) return
  const padding = 48
  const availW = wrapperEl.value.clientWidth - padding
  const availH = wrapperEl.value.clientHeight - padding
  scale = Math.min(availW / canvasSize.width, availH / canvasSize.height, 1)
  canvas.setDimensions({
    width: canvasSize.width * scale,
    height: canvasSize.height * scale,
  })
  canvas.setZoom(scale)
  canvas.renderAll()
}

function resizeCanvas(width: number, height: number) {
  if (!canvas) return
  canvasSize.width = width
  canvasSize.height = height
  fitCanvas()
  pushHistory()
}

function describeSelection(obj: FabricObject | undefined): SelectionInfo | null {
  if (!obj) return null
  if (obj instanceof IText) {
    return {
      type: 'text',
      fontSize: obj.fontSize,
      fill: String(obj.fill ?? '#000000'),
      fontFamily: String(obj.fontFamily ?? 'sans-serif'),
      fontWeight: String(obj.fontWeight ?? 'normal'),
      fontStyle: String(obj.fontStyle ?? 'normal'),
      underline: !!obj.underline,
      textAlign: obj.textAlign,
      lineHeight: obj.lineHeight ?? 1.16,
      charSpacing: obj.charSpacing ?? 0,
      hasShadow: !!obj.shadow,
      hasStroke: !!(obj.stroke && (obj.strokeWidth ?? 0) > 0),
      strokeWidth: obj.strokeWidth ?? 0,
      strokeColor: String(obj.stroke ?? '#ffffff'),
      hasTextBackground: !!obj.textBackgroundColor,
      textBackgroundColor: obj.textBackgroundColor || '#fde047',
      opacity: obj.opacity ?? 1,
      blendMode: obj.globalCompositeOperation ?? 'source-over',
      text: obj.text ?? '',
    }
  }
  if (obj instanceof FabricImage)
    return { type: 'image', src: obj.getSrc(), opacity: obj.opacity ?? 1, blendMode: obj.globalCompositeOperation ?? 'source-over' }
  if (obj instanceof Rect)
    return { type: 'rect', fill: String(obj.fill ?? '#000000'), opacity: obj.opacity ?? 1, blendMode: obj.globalCompositeOperation ?? 'source-over' }
  return { type: 'other', opacity: obj.opacity ?? 1, blendMode: obj.globalCompositeOperation ?? 'source-over' }
}

onMounted(async () => {
  if (!canvasEl.value) return
  canvas = new Canvas(canvasEl.value, { preserveObjectStacking: true })
  canvas.on('selection:created', (e) => emit('selection', describeSelection(e.selected?.[0])))
  canvas.on('selection:updated', (e) => emit('selection', describeSelection(e.selected?.[0])))
  canvas.on('selection:cleared', () => emit('selection', null))
  canvas.on('text:changed', (e) => {
    if (canvas?.getActiveObject() === e.target) emit('selection', describeSelection(e.target))
  })
  canvas.on('object:modified', pushHistory)
  canvas.on('object:added', pushHistory)
  canvas.on('object:removed', pushHistory)

  await buildFromTemplate(props.template)
  fitCanvas()
  window.addEventListener('resize', fitCanvas)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitCanvas)
  canvas?.dispose()
})

watch(
  () => props.template.id,
  async () => {
    await buildFromTemplate(props.template)
    fitCanvas()
  },
)

function addText(initialText = '双击编辑文字') {
  if (!canvas) return
  const text = new IText(initialText, {
    left: canvasSize.width / 2 - 80,
    top: canvasSize.height / 2,
    originX: 'left',
    originY: 'top',
    fontSize: 28,
    fill: '#1f2329',
    fontFamily: 'sans-serif',
  })
  canvas.add(text)
  canvas.setActiveObject(text)
  canvas.requestRenderAll()
}

async function addImage(url: string) {
  if (!canvas) return
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  const maxW = canvasSize.width * 0.6
  if ((img.width || 0) > maxW) {
    const s = maxW / (img.width || maxW)
    img.scale(s)
  }
  img.set({
    left: canvasSize.width / 2 - (img.getScaledWidth() || 0) / 2,
    top: 40,
    originX: 'left',
    originY: 'top',
  })
  canvas.add(img)
  canvas.setActiveObject(img)
  canvas.requestRenderAll()
}

async function replaceSelectedImage(url: string) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof FabricImage)) return
  const { left, top, angle, scaleX, scaleY, originX, originY } = active
  const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
  img.set({ left, top, angle, scaleX, scaleY, originX, originY })
  canvas.remove(active)
  canvas.add(img)
  canvas.setActiveObject(img)
  canvas.requestRenderAll()
  pushHistory()
}

interface ImageAdjust {
  brightness: number
  contrast: number
  saturation: number
  preset?: 'none' | 'grayscale' | 'sepia'
}

/** 实时调色：每次滑块变化都重建 filters 数组并应用，不做防抖以保证预览跟手 */
function setSelectedImageAdjust({ brightness, contrast, saturation, preset }: ImageAdjust) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof FabricImage)) return
  const stack = []
  if (preset === 'grayscale') stack.push(new filters.Grayscale())
  if (preset === 'sepia') stack.push(new filters.Sepia())
  stack.push(
    new filters.Brightness({ brightness }),
    new filters.Contrast({ contrast }),
    new filters.Saturation({ saturation }),
  )
  active.filters = stack
  active.applyFilters()
  canvas.requestRenderAll()
}

function commitSelectedImageAdjust() {
  pushHistory()
}

type TextPropKey =
  | 'fontSize'
  | 'fill'
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'underline'
  | 'textAlign'
  | 'lineHeight'
  | 'charSpacing'

function setSelectedTextProp(prop: TextPropKey, value: string | number | boolean) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set(prop, value)
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function setSelectedTextShadow(enabled: boolean) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set('shadow', enabled ? new Shadow({ color: 'rgba(0,0,0,0.35)', blur: 6, offsetX: 2, offsetY: 2 }) : null)
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

/** paintFirst: 'stroke' 让描边先画、填充后画，描边只露出字形外沿，不会把细笔画的内部吃掉 */
function setSelectedTextStroke(enabled: boolean) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set({
    stroke: enabled ? '#ffffff' : undefined,
    strokeWidth: enabled ? 1 : 0,
    paintFirst: 'stroke',
  })
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function setSelectedTextStrokeWidth(width: number) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set({ strokeWidth: width, paintFirst: 'stroke' })
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function setSelectedTextStrokeColor(color: string) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set({ stroke: color, paintFirst: 'stroke' })
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function setSelectedTextGradient(colors: [string, string]) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  const gradient = new Gradient({
    type: 'linear',
    coords: { x1: 0, y1: 0, x2: active.width ?? 200, y2: 0 },
    colorStops: [
      { offset: 0, color: colors[0] },
      { offset: 1, color: colors[1] },
    ],
  })
  active.set('fill', gradient)
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function setSelectedTextBackground(enabled: boolean, color?: string) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set('textBackgroundColor', enabled ? color ?? active.textBackgroundColor ?? '#fde047' : '')
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function setSelectedOpacity(value: number) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  active.set('opacity', value)
  canvas.requestRenderAll()
  emit('selection', describeSelection(active))
}

function commitSelectedOpacity() {
  pushHistory()
}

function setSelectedBlendMode(mode: string) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  active.set('globalCompositeOperation', mode)
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function bringSelectedForward() {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  canvas.bringObjectForward(active)
  canvas.requestRenderAll()
  pushHistory()
}

function sendSelectedBackward() {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  canvas.sendObjectBackwards(active)
  canvas.requestRenderAll()
  pushHistory()
}

async function duplicateSelected() {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  const clone = await active.clone()
  clone.set({ left: (active.left ?? 0) + 20, top: (active.top ?? 0) + 20 })
  canvas.add(clone)
  canvas.setActiveObject(clone)
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(clone))
}

function getSelectedText(): string | null {
  const active = canvas?.getActiveObject()
  return active instanceof IText ? (active.text ?? '') : null
}

function setSelectedText(text: string) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set('text', text)
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function addRect(fill: string) {
  if (!canvas) return
  const rect = new Rect({
    left: canvasSize.width / 2 - 60,
    top: canvasSize.height / 2 - 40,
    originX: 'left',
    originY: 'top',
    width: 120,
    height: 80,
    fill,
    rx: 8,
    ry: 8,
  })
  canvas.add(rect)
  canvas.setActiveObject(rect)
  canvas.requestRenderAll()
}

/** 插入一个简单柱状图组件（示例数据，插入后可以像普通图层一样拖拽、编辑里面的文字） */
function addBarChart() {
  if (!canvas) return
  const data = [
    { label: 'A', value: 60, color: '#8b5cf6' },
    { label: 'B', value: 90, color: '#ec4899' },
    { label: 'C', value: 45, color: '#38bdf8' },
    { label: 'D', value: 75, color: '#22c55e' },
  ]
  const chartH = 160
  const barW = 40
  const gap = 20
  const maxVal = Math.max(...data.map((d) => d.value))
  const children: FabricObject[] = [
    new Rect({ left: 0, top: chartH, width: data.length * (barW + gap), height: 2, fill: '#d1d5db' }),
  ]
  data.forEach((d, i) => {
    const h = (d.value / maxVal) * (chartH - 30)
    const x = i * (barW + gap) + 10
    children.push(new Rect({ left: x, top: chartH - h, width: barW, height: h, fill: d.color, rx: 4, ry: 4 }))
    children.push(
      new IText(String(d.value), { left: x, top: chartH - h - 22, fontSize: 14, fill: '#374151', width: barW, textAlign: 'center' }),
    )
    children.push(
      new IText(d.label, { left: x, top: chartH + 8, fontSize: 13, fill: '#6b7280', width: barW, textAlign: 'center' }),
    )
  })
  const chartW = data.length * (barW + gap) + 20
  const group = new Group(children, {
    left: canvasSize.width / 2 - chartW / 2,
    top: canvasSize.height / 2 - chartH / 2,
  })
  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  pushHistory()
}

/** 插入一个色块+文字的图例组件 */
function addLegend() {
  if (!canvas) return
  const items = [
    { label: '系列一', color: '#8b5cf6' },
    { label: '系列二', color: '#ec4899' },
    { label: '系列三', color: '#38bdf8' },
  ]
  const children: FabricObject[] = []
  items.forEach((it, i) => {
    const y = i * 26
    children.push(new Rect({ left: 0, top: y, width: 14, height: 14, fill: it.color, rx: 3, ry: 3 }))
    children.push(new IText(it.label, { left: 22, top: y - 2, fontSize: 14, fill: '#374151' }))
  })
  const group = new Group(children, {
    left: canvasSize.width / 2 - 60,
    top: canvasSize.height / 2 - 40,
  })
  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  pushHistory()
}

/** 插入一个 3 列 x 3 行的数据表格组件（首行是表头样式） */
function addDataTable() {
  if (!canvas) return
  const cols = 3
  const rows = 3
  const cellW = 90
  const cellH = 36
  const children: FabricObject[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW
      const y = r * cellH
      children.push(
        new Rect({
          left: x,
          top: y,
          width: cellW,
          height: cellH,
          fill: r === 0 ? '#8b5cf6' : r % 2 === 0 ? '#f9fafb' : '#ffffff',
          stroke: '#e5e7eb',
          strokeWidth: 1,
        }),
      )
      const text = r === 0 ? `列${c + 1}` : `内容${r}-${c + 1}`
      children.push(
        new IText(text, {
          left: x + 8,
          top: y + 9,
          fontSize: 13,
          fill: r === 0 ? '#ffffff' : '#374151',
          width: cellW - 16,
        }),
      )
    }
  }
  const group = new Group(children, {
    left: canvasSize.width / 2 - (cols * cellW) / 2,
    top: canvasSize.height / 2 - (rows * cellH) / 2,
  })
  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  pushHistory()
}

function setBackground(color: string) {
  if (!canvas) return
  canvas.backgroundColor = color
  canvas.requestRenderAll()
  pushHistory()
}

function deleteSelected() {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  canvas.remove(active)
  canvas.discardActiveObject()
  canvas.requestRenderAll()
}

function restoreFromJson(json: string) {
  if (!canvas) return
  restoring = true
  canvas.loadFromJSON(json).then(() => {
    canvas!.requestRenderAll()
    restoring = false
  })
}

function undo() {
  if (undoStack.length <= 1) return
  const current = undoStack.pop()!
  redoStack.push(current)
  restoreFromJson(undoStack[undoStack.length - 1])
  emitHistory()
}

function redo() {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(next)
  restoreFromJson(next)
  emitHistory()
}

function captureDataUrl(multiplier: number): string {
  if (!canvas) return ''
  const currentZoom = canvas.getZoom()
  canvas.setZoom(1)
  canvas.setDimensions({ width: canvasSize.width, height: canvasSize.height })
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier })
  canvas.setZoom(currentZoom)
  canvas.setDimensions({
    width: canvasSize.width * currentZoom,
    height: canvasSize.height * currentZoom,
  })
  return dataUrl
}

function exportPNG(): string {
  return captureDataUrl(2)
}

interface SerializedTemplate {
  elements: CanvasElement[]
  thumbnail: string
  canvasWidth: number
  canvasHeight: number
  background: string
}

function serialize(): SerializedTemplate {
  const elements: CanvasElement[] = []
  for (const obj of canvas?.getObjects() ?? []) {
    if (obj instanceof IText) {
      elements.push({
        type: 'text',
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: obj.width ?? 200,
        text: obj.text ?? '',
        fontSize: obj.fontSize ?? 20,
        fontWeight: String(obj.fontWeight ?? 'normal'),
        color: String(obj.fill ?? '#000000'),
        align: (obj.textAlign as 'left' | 'center' | 'right' | undefined) ?? 'left',
      })
    } else if (obj instanceof FabricImage) {
      elements.push({
        type: 'image',
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: obj.getScaledWidth(),
        height: obj.getScaledHeight(),
        src: obj.getSrc(),
      })
    } else if (obj instanceof Rect) {
      elements.push({
        type: 'rect',
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: obj.getScaledWidth(),
        height: obj.getScaledHeight(),
        fill: String(obj.fill ?? '#000000'),
        rx: (obj.rx as number | undefined) ?? 0,
      })
    }
  }
  return {
    elements,
    thumbnail: captureDataUrl(1),
    canvasWidth: canvasSize.width,
    canvasHeight: canvasSize.height,
    background: String(canvas?.backgroundColor ?? '#ffffff'),
  }
}

defineExpose({
  addText,
  addImage,
  replaceSelectedImage,
  setSelectedTextProp,
  setSelectedTextShadow,
  setSelectedTextStroke,
  setSelectedTextStrokeWidth,
  setSelectedTextStrokeColor,
  setSelectedTextGradient,
  setSelectedTextBackground,
  setSelectedOpacity,
  commitSelectedOpacity,
  setSelectedBlendMode,
  bringSelectedForward,
  sendSelectedBackward,
  duplicateSelected,
  setSelectedImageAdjust,
  commitSelectedImageAdjust,
  getSelectedText,
  setSelectedText,
  deleteSelected,
  addRect,
  addBarChart,
  addLegend,
  addDataTable,
  setBackground,
  resizeCanvas,
  undo,
  redo,
  exportPNG,
  serialize,
})
</script>

<template>
  <div ref="wrapperEl" class="flex h-full w-full items-center justify-center overflow-hidden">
    <div class="rounded-sm shadow-lg">
      <canvas ref="canvasEl" />
    </div>
  </div>
</template>
