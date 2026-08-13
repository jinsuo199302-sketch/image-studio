<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Canvas, Circle, FabricImage, Gradient, Group, IText, Line, Path, Rect, Shadow, Textbox, filters, type FabricObject } from 'fabric'
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
  locked?: boolean
  vertical?: boolean
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
      const text = new Textbox(el.text, {
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
        splitByGrapheme: true,
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
      locked: !!obj.lockMovementX,
      vertical: !!(obj as unknown as { isVerticalText?: boolean }).isVerticalText,
      text: obj.text ?? '',
    }
  }
  if (obj instanceof FabricImage)
    return {
      type: 'image',
      src: obj.getSrc(),
      opacity: obj.opacity ?? 1,
      blendMode: obj.globalCompositeOperation ?? 'source-over',
      locked: !!obj.lockMovementX,
    }
  if (obj instanceof Rect)
    return {
      type: 'rect',
      fill: String(obj.fill ?? '#000000'),
      opacity: obj.opacity ?? 1,
      blendMode: obj.globalCompositeOperation ?? 'source-over',
      locked: !!obj.lockMovementX,
    }
  return {
    type: 'other',
    opacity: obj.opacity ?? 1,
    blendMode: obj.globalCompositeOperation ?? 'source-over',
    locked: !!obj.lockMovementX,
  }
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
  const text = new Textbox(initialText, {
    left: canvasSize.width / 2 - 80,
    top: canvasSize.height / 2,
    originX: 'left',
    originY: 'top',
    width: 240,
    fontSize: 28,
    fill: '#1f2329',
    fontFamily: 'sans-serif',
    splitByGrapheme: true,
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

/** 锁定/解锁：锁定后禁止拖动、缩放、旋转，但仍可被选中查看属性（不锁 selectable，不然连选都选不中了） */
function setSelectedLocked(locked: boolean) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  active.set({
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    hasControls: !locked,
  })
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

/** 竖排文字：CJK 竖排本质是"每行只放一个字再自上而下排列"，把宽度收窄到刚好容纳一个全角字符，
 * 靠 splitByGrapheme 的自动换行在每个字后面强制换行，实现视觉上的竖排效果 */
function setSelectedVertical(vertical: boolean) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof Textbox)) return
  const marked = active as unknown as { isVerticalText?: boolean; _horizontalWidth?: number }
  if (vertical) {
    marked._horizontalWidth = active.width
    active.set({ width: (active.fontSize ?? 24) * 1.15, textAlign: 'center' })
  } else {
    active.set({ width: marked._horizontalWidth ?? 200, textAlign: 'left' })
  }
  marked.isVerticalText = vertical
  active.initDimensions?.()
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

/** 给每一行手动加上项目符号/序号前缀，纯文本层面的列表格式（不是富文本，简单直接） */
function applySelectedListFormat(kind: 'bullet' | 'number' | 'none') {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  const stripped = (active.text ?? '')
    .split('\n')
    .map((line) => line.replace(/^(\s*[•·]\s*|\s*\d+[.、]\s*)/, ''))
  const next =
    kind === 'none'
      ? stripped
      : stripped.map((line, i) => (kind === 'bullet' ? `• ${line}` : `${i + 1}. ${line}`))
  active.set('text', next.join('\n'))
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

const CHART_DATA = [
  { label: 'A', value: 60, color: '#8b5cf6' },
  { label: 'B', value: 90, color: '#ec4899' },
  { label: 'C', value: 45, color: '#38bdf8' },
  { label: 'D', value: 75, color: '#22c55e' },
]

function addBarChart(): FabricObject {
  const data = CHART_DATA
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
  return new Group(children, { left: 0, top: 0, width: chartW, height: chartH + 30, originX: 'left', originY: 'top' })
}

/** 折线图：同一组示例数据，把柱子换成"折线+端点圆点"的画法 */
function addLineChart(): FabricObject {
  const data = CHART_DATA
  const chartH = 160
  const stepX = 90
  const maxVal = Math.max(...data.map((d) => d.value))
  const points = data.map((d, i) => ({
    x: i * stepX + 20,
    y: chartH - (d.value / maxVal) * (chartH - 30),
  }))
  const children: FabricObject[] = [
    new Rect({ left: 0, top: chartH, width: (data.length - 1) * stepX + 40, height: 2, fill: '#d1d5db' }),
  ]
  for (let i = 0; i < points.length - 1; i++) {
    children.push(
      new Line([points[i].x, points[i].y, points[i + 1].x, points[i + 1].y], {
        stroke: '#8b5cf6',
        strokeWidth: 3,
        strokeLineCap: 'round',
      }),
    )
  }
  points.forEach((p, i) => {
    children.push(new Circle({ left: p.x - 6, top: p.y - 6, radius: 6, fill: '#ffffff', stroke: '#8b5cf6', strokeWidth: 3 }))
    children.push(
      new IText(String(data[i].value), { left: p.x - 20, top: p.y - 28, fontSize: 14, fill: '#374151', width: 40, textAlign: 'center' }),
    )
    children.push(
      new IText(data[i].label, { left: p.x - 20, top: chartH + 8, fontSize: 13, fill: '#6b7280', width: 40, textAlign: 'center' }),
    )
  })
  const chartW = (data.length - 1) * stepX + 40
  return new Group(children, { left: 0, top: 0, width: chartW, height: chartH + 30, originX: 'left', originY: 'top' })
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** 饼图：用 SVG 弧形路径手算每一块扇形，圆心引一条细线到外面的图例文字 */
function addPieChart(): FabricObject {
  const data = CHART_DATA
  const r = 80
  const cx = r
  const cy = r
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const children: FabricObject[] = []
  let angle = 0
  data.forEach((d) => {
    const sweep = (d.value / total) * 360
    const start = polarPoint(cx, cy, r, angle)
    const end = polarPoint(cx, cy, r, angle + sweep)
    const largeArc = sweep > 180 ? 1 : 0
    const path = `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
    children.push(new Path(path, { fill: d.color }))
    angle += sweep
  })
  data.forEach((d, i) => {
    const ly = r * 2 + 16 + i * 22
    children.push(new Rect({ left: r * 2 + 16, top: ly, width: 12, height: 12, fill: d.color, rx: 3, ry: 3 }))
    children.push(
      new IText(`${d.label}  ${Math.round((d.value / total) * 100)}%`, {
        left: r * 2 + 34,
        top: ly - 2,
        fontSize: 13,
        fill: '#374151',
      }),
    )
  })
  return new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
}

/** 图表统一入口：kind 决定具体画哪一种，插入逻辑（居中定位+选中+存历史）三种共用 */
function addChart(kind: 'bar' | 'line' | 'pie') {
  if (!canvas) return
  const obj = kind === 'line' ? addLineChart() : kind === 'pie' ? addPieChart() : addBarChart()
  const w = obj.width ?? 200
  const h = obj.height ?? 160
  obj.set({ left: canvasSize.width / 2 - w / 2, top: canvasSize.height / 2 - h / 2 })
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  pushHistory()
}

function buildSwatchLegend(): FabricObject {
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
  return new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
}

/** 步骤流程图：编号圆圈 + 连接线，横向排 3 步，每步下面配一行说明文字 */
function buildStepFlow(): FabricObject {
  const steps = [
    { label: '第一步', color: '#8b5cf6' },
    { label: '第二步', color: '#ec4899' },
    { label: '第三步', color: '#22c55e' },
  ]
  const r = 20
  const gap = 100
  const children: FabricObject[] = []
  steps.forEach((s, i) => {
    const cx = i * gap + r
    if (i < steps.length - 1) {
      children.push(new Line([cx + r, r, cx + gap - r, r], { stroke: '#d1d5db', strokeWidth: 2 }))
    }
    children.push(new Circle({ left: cx - r, top: 0, radius: r, fill: s.color }))
    children.push(
      new IText(String(i + 1), { left: cx - r, top: r - 9, fontSize: 16, fontWeight: 'bold', fill: '#ffffff', width: r * 2, textAlign: 'center' }),
    )
    children.push(
      new IText(s.label, { left: cx - 30, top: r * 2 + 10, fontSize: 13, fill: '#374151', width: 60, textAlign: 'center' }),
    )
  })
  return new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
}

function addLegend(kind: 'swatch' | 'steps') {
  if (!canvas) return
  const obj = kind === 'steps' ? buildStepFlow() : buildSwatchLegend()
  const w = obj.width ?? 160
  const h = obj.height ?? 80
  obj.set({ left: canvasSize.width / 2 - w / 2, top: canvasSize.height / 2 - h / 2 })
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  pushHistory()
}

const TABLE_DATA = { cols: 3, rows: 3, cellW: 90, cellH: 36 }

function buildGridTable(): FabricObject {
  const { cols, rows, cellW, cellH } = TABLE_DATA
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
        new IText(text, { left: x + 8, top: y + 9, fontSize: 13, fill: r === 0 ? '#ffffff' : '#374151', width: cellW - 16 }),
      )
    }
  }
  return new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
}

/** 无线表格：不画格子背景，只在表头下方和每行下方留一条细分隔线，文字左对齐——常见的"简洁列表"风格 */
function buildBorderlessTable(): FabricObject {
  const { cols, rows, cellW, cellH } = TABLE_DATA
  const tableW = cols * cellW
  const children: FabricObject[] = []
  for (let r = 0; r < rows; r++) {
    const y = r * cellH
    for (let c = 0; c < cols; c++) {
      const x = c * cellW
      const text = r === 0 ? `列${c + 1}` : `内容${r}-${c + 1}`
      children.push(
        new IText(text, {
          left: x + 4,
          top: y + 9,
          fontSize: 13,
          fill: r === 0 ? '#1f2937' : '#4b5563',
          fontWeight: r === 0 ? 'bold' : 'normal',
          width: cellW - 8,
        }),
      )
    }
    children.push(new Rect({ left: 0, top: y + cellH - 1, width: tableW, height: r === 0 ? 2 : 1, fill: r === 0 ? '#1f2937' : '#e5e7eb' }))
  }
  return new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
}

function addDataTable(kind: 'grid' | 'borderless') {
  if (!canvas) return
  const obj = kind === 'borderless' ? buildBorderlessTable() : buildGridTable()
  const { cols, rows, cellW, cellH } = TABLE_DATA
  const w = obj.width ?? cols * cellW
  const h = obj.height ?? rows * cellH
  obj.set({ left: canvasSize.width / 2 - w / 2, top: canvasSize.height / 2 - h / 2 })
  canvas.add(obj)
  canvas.setActiveObject(obj)
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
  setSelectedLocked,
  setSelectedVertical,
  applySelectedListFormat,
  bringSelectedForward,
  sendSelectedBackward,
  duplicateSelected,
  setSelectedImageAdjust,
  commitSelectedImageAdjust,
  getSelectedText,
  setSelectedText,
  deleteSelected,
  addRect,
  addChart,
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
