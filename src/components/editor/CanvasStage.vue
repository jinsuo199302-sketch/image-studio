<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Canvas, FabricImage, IText, Rect, Shadow, filters, type FabricObject } from 'fabric'
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
      text: obj.text ?? '',
    }
  }
  if (obj instanceof FabricImage) return { type: 'image', src: obj.getSrc() }
  if (obj instanceof Rect) return { type: 'rect', fill: String(obj.fill ?? '#000000') }
  return { type: 'other' }
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
}

/** 实时调色：每次滑块变化都重建 filters 数组并应用，不做防抖以保证预览跟手 */
function setSelectedImageAdjust({ brightness, contrast, saturation }: ImageAdjust) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof FabricImage)) return
  active.filters = [
    new filters.Brightness({ brightness }),
    new filters.Contrast({ contrast }),
    new filters.Saturation({ saturation }),
  ]
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
  setSelectedImageAdjust,
  commitSelectedImageAdjust,
  getSelectedText,
  setSelectedText,
  deleteSelected,
  addRect,
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
