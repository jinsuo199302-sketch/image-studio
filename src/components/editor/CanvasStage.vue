<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Canvas, Circle, FabricImage, Gradient, Group, IText, Line, Path, Rect, Shadow, Textbox, filters, type FabricObject } from 'fabric'
import type { CanvasElement, GroupChildElement, Template } from '../../data/templates'

const props = defineProps<{ template: Template }>()
const emit = defineEmits<{
  (e: 'selection', payload: SelectionInfo | null): void
  (e: 'history', payload: { canUndo: boolean; canRedo: boolean }): void
}>()

export interface SelectionInfo {
  type: 'text' | 'image' | 'rect' | 'other'
  /** 仅当选中的是表格组件（grid-table/borderless-table）时才有值，用来在选中面板里显示表格样式设置 */
  tableStyle?: {
    theme: string
    fontFamily: string
    fontSize: number
    bold: boolean
    italic: boolean
    underline: boolean
    align: 'left' | 'center' | 'right'
    rows: number
    cols: number
  }
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
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  hasStroke?: boolean
  strokeWidth?: number
  strokeColor?: string
  hasTextBackground?: boolean
  textBackgroundColor?: string
  warpKind?: WarpKind
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
/** 撤销/重做走 Fabric 自己的 canvas.toObject()/loadFromJSON()，默认不会带上我们自己塞在实例上的自定义属性——
 * 显式声明这两个才能让"双击编辑"这个组件标记在撤销/重做之后还活着 */
const HISTORY_EXTRA_PROPS = ['_componentKind', '_componentData']

function pushHistory() {
  if (!canvas || restoring) return
  if (historyTimer) clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    if (!canvas) return
    undoStack.push(JSON.stringify(canvas.toObject(HISTORY_EXTRA_PROPS)))
    if (undoStack.length > 30) undoStack.shift()
    redoStack.length = 0
    emitHistory()
  }, 250)
}

function emitHistory() {
  emit('history', { canUndo: undoStack.length > 1, canRedo: redoStack.length > 0 })
}

/** 拖拽时的吸附候选位置（画布边缘/中心 + 其它对象边缘/中心），一次拖拽只算一次 */
let dragStaticTargets: { v: number[]; h: number[] } | null = null
const GUIDE_COLOR = '#f43f5e'
/** 像素→毫米换算比例，跟 ResizeDialog.vue 里"A4 文档"预设（700×990px＝210×297mm）保持一致 */
const PX_PER_MM = 700 / 210

function computeStaticTargets(moving: FabricObject) {
  const v = [0, canvasSize.width / 2, canvasSize.width]
  const h = [0, canvasSize.height / 2, canvasSize.height]
  for (const obj of canvas?.getObjects() ?? []) {
    if (obj === moving) continue
    const left = obj.left ?? 0
    const top = obj.top ?? 0
    const w = obj.getScaledWidth()
    const objHeight = obj.getScaledHeight()
    v.push(left, left + w / 2, left + w)
    h.push(top, top + objHeight / 2, top + objHeight)
  }
  dragStaticTargets = { v, h }
}

function closestMatch(
  candidates: number[],
  targets: number[],
  threshold: number,
): { value: number; delta: number } | null {
  let best: { value: number; delta: number } | null = null
  for (const c of candidates) {
    for (const t of targets) {
      const diff = Math.abs(t - c)
      if (diff <= threshold && (!best || diff < Math.abs(best.delta))) {
        best = { value: t, delta: t - c }
      }
    }
  }
  return best
}

/** 拖拽移动时吸附到画布边缘/中心/其它对象边缘并画参考线；多选或有旋转角度时跳过（左上角原点假设不成立） */
function updateAlignmentGuides(target: FabricObject) {
  if (!canvas) return
  if (canvas.getActiveObjects().length > 1 || Math.abs(target.angle ?? 0) > 0.01) {
    clearAlignmentGuides()
    return
  }
  if (!dragStaticTargets) computeStaticTargets(target)

  const left = target.left ?? 0
  const top = target.top ?? 0
  const w = target.getScaledWidth()
  const objHeight = target.getScaledHeight()
  const threshold = 8 / canvas.getZoom()

  const xMatch = closestMatch([left, left + w / 2, left + w], dragStaticTargets!.v, threshold)
  if (xMatch) target.set({ left: left + xMatch.delta })

  const yMatch = closestMatch([top, top + objHeight / 2, top + objHeight], dragStaticTargets!.h, threshold)
  if (yMatch) target.set({ top: top + yMatch.delta })

  if (xMatch || yMatch) target.setCoords()

  drawAlignmentGuides(xMatch ? xMatch.value : null, yMatch ? yMatch.value : null)
}

function drawAlignmentGuides(matchedX: number | null, matchedY: number | null) {
  if (!canvas) return
  const ctx = canvas.contextTop
  canvas.clearContext(ctx)
  if (matchedX === null && matchedY === null) return

  const zoom = canvas.getZoom()
  ctx.save()
  ctx.strokeStyle = GUIDE_COLOR
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  if (matchedX !== null) {
    const x = matchedX * zoom
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvasSize.height * zoom)
    ctx.stroke()
  }
  if (matchedY !== null) {
    const y = matchedY * zoom
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvasSize.width * zoom, y)
    ctx.stroke()
  }
  ctx.restore()

  const activeTarget = canvas.getActiveObject()
  if (activeTarget) {
    const labelX = (activeTarget.left ?? 0) * zoom
    const labelY = (activeTarget.top ?? 0) * zoom
    const mmX = (activeTarget.left ?? 0) / PX_PER_MM
    const mmY = (activeTarget.top ?? 0) / PX_PER_MM
    const label = `${mmX.toFixed(1)}mm, ${mmY.toFixed(1)}mm`
    ctx.save()
    ctx.font = '11px sans-serif'
    const textWidth = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(labelX, labelY - 20, textWidth + 8, 16)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, labelX + 4, labelY - 8)
    ctx.restore()
  }
}

function clearAlignmentGuides() {
  if (canvas) canvas.clearContext(canvas.contextTop)
  dragStaticTargets = null
}

async function applyElements(
  elements: CanvasElement[],
  background: string,
  width: number,
  height: number,
  options: { resetHistory?: boolean } = {},
) {
  if (!canvas) return
  canvas.clear()
  canvas.backgroundColor = background
  canvasSize.width = width
  canvasSize.height = height

  for (const el of elements) {
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
        fontFamily: el.fontFamily ?? 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
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
    } else if (el.type === 'group') {
      const builder = el.componentKind ? COMPONENT_BUILDERS[el.componentKind] : undefined
      const group =
        builder && el.componentData
          ? builder(el.componentData as never)
          : new Group(el.children.map(buildGroupChild).filter((c): c is FabricObject => c !== null), {
              left: 0,
              top: 0,
              originX: 'left',
              originY: 'top',
            })
      group.set({ left: el.x, top: el.y, angle: el.angle ?? 0 })
      canvas.add(group)
    }
  }
  canvas.renderAll()
  if (options.resetHistory ?? true) {
    undoStack.length = 0
    redoStack.length = 0
  } else {
    redoStack.length = 0
  }
  undoStack.push(JSON.stringify(canvas.toJSON()))
  if (undoStack.length > 30) undoStack.shift()
  emitHistory()
}

async function buildFromTemplate(template: Template) {
  await applyElements(template.elements, template.background, template.canvasWidth, template.canvasHeight)
}

/** 应用 AI 生成的设计：作为一步可撤销的操作叠加在历史栈上，不像切换模板那样清空历史 */
async function applyGeneratedDesign(elements: CanvasElement[], background: string) {
  await applyElements(elements, background, canvasSize.width, canvasSize.height, { resetHistory: false })
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
      shadowColor: String(obj.shadow?.color ?? 'rgba(0,0,0,0.35)'),
      shadowBlur: obj.shadow?.blur ?? 6,
      shadowOffsetX: obj.shadow?.offsetX ?? 2,
      shadowOffsetY: obj.shadow?.offsetY ?? 2,
      hasStroke: !!(obj.stroke && (obj.strokeWidth ?? 0) > 0),
      strokeWidth: obj.strokeWidth ?? 0,
      strokeColor: String(obj.stroke ?? '#ffffff'),
      hasTextBackground: !!obj.textBackgroundColor,
      textBackgroundColor: obj.textBackgroundColor || '#fde047',
      warpKind: (obj as unknown as { _warpKind?: SelectionInfo['warpKind'] })._warpKind ?? 'none',
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
  if (obj instanceof Group) {
    const tagged = obj as unknown as { _componentKind?: string; _componentData?: TableStyle }
    if (tagged._componentKind === 'grid-table' || tagged._componentKind === 'borderless-table') {
      const style = tagged._componentData
      return {
        type: 'other',
        opacity: obj.opacity ?? 1,
        blendMode: obj.globalCompositeOperation ?? 'source-over',
        locked: !!obj.lockMovementX,
        tableStyle: style
          ? {
              theme: style.theme,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              bold: style.bold,
              italic: style.italic,
              underline: style.underline,
              align: style.align,
              rows: style.rows.length,
              cols: style.rows[0]?.length ?? 0,
            }
          : undefined,
      }
    }
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
  canvas.on('selection:cleared', () => {
    emit('selection', null)
    clearAlignmentGuides()
  })
  canvas.on('text:changed', (e) => {
    if (canvas?.getActiveObject() === e.target) emit('selection', describeSelection(e.target))
  })
  canvas.on('object:modified', pushHistory)
  canvas.on('object:added', pushHistory)
  canvas.on('object:removed', pushHistory)
  canvas.on('object:modified', clearAlignmentGuides)
  canvas.on('object:moving', (e) => updateAlignmentGuides(e.target))
  canvas.on('mouse:up', clearAlignmentGuides)
  canvas.on('mouse:dblclick', (opt) => {
    const group = opt.target
    if (!canvas || !(group instanceof Group)) return
    const tagged = group as unknown as { _componentKind?: string }
    if (!tagged._componentKind) return
    const scenePoint = (opt as unknown as { scenePoint?: ReturnType<Canvas['getScenePoint']> }).scenePoint
    if (!scenePoint) return
    const children = group.getObjects()
    // Group 刚生成/刚替换时，子元素的 aCoords 命中坐标缓存不会自动刷新，跟实际画出来的位置对不上
    // （画的时候用的是实时变换，命中检测用的是缓存）——命中检测前必须强制刷新一次，不然点在数字正上方也点不中
    group.setCoords()
    children.forEach((c) => c.setCoords())
    const HIT_PADDING = 6 // 留一点点容差，不用太大
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i]
      const dataTag = c as unknown as { _dataField?: string; _dataIndex?: number }
      if (dataTag._dataField === undefined || !c.visible) continue
      const coords = c.getCoords()
      const xs = coords.map((p) => p.x)
      const ys = coords.map((p) => p.y)
      const hit =
        scenePoint.x >= Math.min(...xs) - HIT_PADDING &&
        scenePoint.x <= Math.max(...xs) + HIT_PADDING &&
        scenePoint.y >= Math.min(...ys) - HIT_PADDING &&
        scenePoint.y <= Math.max(...ys) + HIT_PADDING
      if (hit) {
        openInlineEdit(group, c, dataTag._dataField, dataTag._dataIndex ?? 0)
        break
      }
    }
  })

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

function setSelectedRectFill(color: string) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof Rect)) return
  active.set('fill', color)
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function setSelectedTextShadowDetail({
  color,
  blur,
  offsetX,
  offsetY,
}: {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  active.set('shadow', new Shadow({ color, blur, offsetX, offsetY }))
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

const TEXT_EFFECT_PRESETS: Record<
  'outline' | 'emboss' | 'neon',
  { stroke: string; strokeWidth: number; shadow: { color: string; blur: number; offsetX: number; offsetY: number } }
> = {
  outline: {
    stroke: '#1f2329',
    strokeWidth: 3,
    shadow: { color: 'rgba(0,0,0,0.25)', blur: 4, offsetX: 2, offsetY: 2 },
  },
  emboss: {
    stroke: '#ffffff',
    strokeWidth: 1,
    shadow: { color: 'rgba(0,0,0,0.45)', blur: 10, offsetX: 4, offsetY: 6 },
  },
  neon: {
    stroke: '#ffffff',
    strokeWidth: 2,
    shadow: { color: '#7c3aed', blur: 20, offsetX: 0, offsetY: 0 },
  },
}

/** 一键叠加描边+阴影的特效预设，批量改完属性后只统一渲染/记一步历史，不分别调用现有 setter（避免撤销栈里多留几步） */
function applyTextEffectPreset(preset: 'none' | 'outline' | 'emboss' | 'neon') {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  if (preset === 'none') {
    active.set({ stroke: undefined, strokeWidth: 0, shadow: null })
  } else {
    const p = TEXT_EFFECT_PRESETS[preset]
    active.set({ stroke: p.stroke, strokeWidth: p.strokeWidth, paintFirst: 'stroke', shadow: new Shadow(p.shadow) })
  }
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

type PathWarpKind = 'arc-up' | 'arc-down' | 'fan' | 'wave' | 'flag' | 'ring'
export type WarpKind = 'none' | PathWarpKind | 'skew'

function buildWarpPath(kind: PathWarpKind, width: number, intensity: number): string {
  const w = Math.max(width, 1)
  if (kind === 'arc-up') return `M 0 0 Q ${w / 2} ${-intensity} ${w} 0`
  if (kind === 'arc-down') return `M 0 0 Q ${w / 2} ${intensity} ${w} 0`
  if (kind === 'fan') {
    // 圆弧的正矢公式：已知弦长 w、拱高 intensity，反推半径，画出真正等曲率的圆弧（跟贝塞尔的拱形手感不同）
    const sagitta = Math.max(intensity, 1)
    const r = (w * w) / (8 * sagitta) + sagitta / 2
    return `M 0 0 A ${r} ${r} 0 0 1 ${w} 0`
  }
  if (kind === 'wave') return `M 0 0 Q ${w / 4} ${-intensity} ${w / 2} 0 Q ${(w * 3) / 4} ${intensity} ${w} 0`
  if (kind === 'flag')
    return `M 0 0 Q ${w / 6} ${-intensity} ${w / 3} 0 Q ${w / 2} ${intensity} ${(w * 2) / 3} 0 Q ${(w * 5) / 6} ${-intensity} ${w} 0`
  // ring：整圈闭合路径，半径按周长=文字宽度反推，让文字正好绕一圈
  const r = w / (2 * Math.PI)
  return `M ${w / 2} ${-r} A ${r} ${r} 0 1 1 ${w / 2 - 0.01} ${-r}`
}

/** 文字沿弧形/波浪/圆环路径排列，或用 skewX 做平行四边形斜切；切回"无"/"斜切"时要把设置 path 前
 * 暂存的原始宽度还原——Fabric 设置 path 后会用路径包围盒覆盖对象的 width/height，不会自动恢复 */
function setSelectedTextWarp(kind: WarpKind, intensity: number) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!(active instanceof IText)) return
  const withStash = active as unknown as { _warpKind?: string; _preWarpWidth?: number }

  if (kind === 'none' || kind === 'skew') {
    active.set({ path: undefined, width: withStash._preWarpWidth ?? active.width, skewX: kind === 'skew' ? Math.min(intensity, 60) : 0 })
    withStash._warpKind = kind
  } else {
    if (withStash._preWarpWidth === undefined) withStash._preWarpWidth = active.width ?? 200
    active.set({
      skewX: 0,
      path: new Path(buildWarpPath(kind, withStash._preWarpWidth, intensity), { visible: false }),
      pathAlign: 'center',
      pathSide: 'left',
      pathStartOffset: 0,
    })
    withStash._warpKind = kind
  }
  active.setCoords()
  canvas.requestRenderAll()
  pushHistory()
  emit('selection', describeSelection(active))
}

function deselectActive() {
  if (!canvas) return
  canvas.discardActiveObject()
  canvas.requestRenderAll()
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

interface ChartDatum {
  label: string
  value: number
  color: string
}
interface LegendDatum {
  label: string
  color: string
}

const CHART_DATA: ChartDatum[] = [
  { label: 'A', value: 60, color: '#8b5cf6' },
  { label: 'B', value: 90, color: '#ec4899' },
  { label: 'C', value: 45, color: '#38bdf8' },
  { label: 'D', value: 75, color: '#22c55e' },
]

const DEFAULT_SWATCH_LEGEND: LegendDatum[] = [
  { label: '系列一', color: '#8b5cf6' },
  { label: '系列二', color: '#ec4899' },
  { label: '系列三', color: '#38bdf8' },
]

const DEFAULT_STEP_LEGEND: LegendDatum[] = [
  { label: '第一步', color: '#8b5cf6' },
  { label: '第二步', color: '#ec4899' },
  { label: '第三步', color: '#22c55e' },
]

interface IconListDatum {
  shape: 'circle' | 'square' | 'diamond'
  color: string
  icon: string
  label: string
}
const DEFAULT_ICON_LIST: IconListDatum[] = [
  { shape: 'circle', color: '#c1272d', icon: '1', label: '第一条说明文字' },
  { shape: 'circle', color: '#c1272d', icon: '2', label: '第二条说明文字' },
  { shape: 'circle', color: '#16a34a', icon: '✓', label: '第三条说明文字' },
  { shape: 'circle', color: '#dc2626', icon: '✕', label: '第四条说明文字' },
]
const ICON_LIST_ROW_H = 34
const ICON_LIST_BADGE = 22
const ICON_LIST_LABEL_W = 180

interface RibbonTitleDatum {
  text: string
  color: string
}
/** 单元素数组，不是裸对象——applyFieldEdit 双击编辑写回只认数组形状（跟其它组件保持一致） */
const DEFAULT_RIBBON_TITLE: RibbonTitleDatum[] = [{ text: '标题文字', color: '#c1272d' }]
const RIBBON_W = 220
const RIBBON_H = 32
const RIBBON_TAIL_W = 9

/** 十六进制颜色调暗，给丝带两端的小三角尾巴用一个更深的同色系，不用额外配色 */
function darkenHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 0xff) - amount)
  const g = Math.max(0, ((n >> 8) & 0xff) - amount)
  const b = Math.max(0, (n & 0xff) - amount)
  return `#${((r << 16) + (g << 8) + b).toString(16).padStart(6, '0')}`
}

const DEFAULT_TABLE_ROWS: string[][] = [
  ['列1', '列2', '列3'],
  ['内容1-1', '内容1-2', '内容1-3'],
  ['内容2-1', '内容2-2', '内容2-3'],
]
const TABLE_CELL_W = 90
const TABLE_CELL_H = 36

/** 给图表/图例/表格里"承载数据"的子元素打标记，双击命中测试时用来反查该改 _componentData 里的哪一项 */
function tagDataChild<T extends FabricObject>(obj: T, field: string, index: number): T {
  const tagged = obj as unknown as { _dataField?: string; _dataIndex?: number }
  tagged._dataField = field
  tagged._dataIndex = index
  return obj
}

/** 给整个 Group 打上"这是什么组件+对应数据是什么"，双击编辑提交后要靠这两个信息重新调用对应 builder 重画 */
function tagComponent<T extends FabricObject>(group: T, kind: string, data: unknown): T {
  const tagged = group as unknown as { _componentKind?: string; _componentData?: unknown }
  tagged._componentKind = kind
  tagged._componentData = data
  return group
}

/** 所有图表/图例/表格子元素统一走这几个 helper 创建，强制 originX/originY 为 left/top——
 * Fabric 这个版本里 Rect/IText/Circle/Line/Group 全部默认 center 锚点，混用手算坐标会全部错位 */
function mkRect(opts: ConstructorParameters<typeof Rect>[0]) {
  return new Rect({ originX: 'left', originY: 'top', ...opts })
}
/** 用 Textbox 而不是 IText：IText 的 initDimensions() 每次都会把 width 强制改写成文字实际渲染宽度，
 * 传进去的 width 会被立刻覆盖掉，textAlign:'center'/'right' 因此完全不起作用（表格合并单元格加了居中对齐后才暴露这个坑）。
 * Textbox 是 IText 的子类（instanceof IText 判断不受影响），且 initDimensions() 明确不会覆盖手动设的 width。
 * 没传 width 的调用点（跟以前 IText 自动按文字宽度收缩的行为保持一致）用一个临时 IText 量出文字的自然宽度再传给 Textbox。 */
function mkText(text: string, opts: ConstructorParameters<typeof Textbox>[1]) {
  let finalOpts = opts
  if (!finalOpts || finalOpts.width === undefined) {
    // 显式传 fontFamily: undefined 会覆盖掉 Fabric 的类默认值导致崩溃，所以量宽度时只带上真的设置过的字段
    const probeOpts: Record<string, unknown> = {}
    if (finalOpts?.fontSize !== undefined) probeOpts.fontSize = finalOpts.fontSize
    if (finalOpts?.fontFamily !== undefined) probeOpts.fontFamily = finalOpts.fontFamily
    if (finalOpts?.fontWeight !== undefined) probeOpts.fontWeight = finalOpts.fontWeight
    const probe = new IText(text, probeOpts)
    finalOpts = { ...finalOpts, width: probe.width }
  }
  return new Textbox(text, { originX: 'left', originY: 'top', splitByGrapheme: true, ...finalOpts })
}
function mkCircle(opts: ConstructorParameters<typeof Circle>[0]) {
  return new Circle({ originX: 'left', originY: 'top', ...opts })
}
function mkLine(points: [number, number, number, number], opts: ConstructorParameters<typeof Line>[1]) {
  return new Line(points, { originX: 'left', originY: 'top', ...opts })
}

/** Group 组件（图表/图例/表格）落盘/读盘的通用往返：把已知的几种基础图形和它们互转，
 * 这样任何用 mkRect/mkText/mkCircle/mkLine/Path 拼出来的 Group 存模板都不会丢，不用为每种图表单独写序列化逻辑 */
/** stroke/strokeWidth 是可选字段，不能无脑把 undefined 也当"真的传了"塞进 Fabric 构造选项——
 * 会覆盖掉 Circle/Rect 类的默认值（比如 strokeWidth 默认是 1），变成显式 undefined，
 * 导致 Group 用 fit-content 布局算包围盒时算出 NaN，整个 Group 连带子元素全部不可见
 * （跟 mkText 那个 fontFamily:undefined 的坑是同一类问题，这里也得一样处理）*/
function optionalStroke(child: { stroke?: string; strokeWidth?: number }) {
  const opts: { stroke?: string; strokeWidth?: number } = {}
  if (child.stroke !== undefined) opts.stroke = child.stroke
  if (child.strokeWidth !== undefined) opts.strokeWidth = child.strokeWidth
  return opts
}

function buildGroupChild(child: GroupChildElement): FabricObject | null {
  if (child.type === 'rect')
    return mkRect({ left: child.x, top: child.y, width: child.width, height: child.height, fill: child.fill, rx: child.rx ?? 0, ry: child.rx ?? 0, ...optionalStroke(child) })
  if (child.type === 'text')
    return mkText(child.text, { left: child.x, top: child.y, width: child.width, fontSize: child.fontSize, fill: child.fill, fontWeight: child.fontWeight ?? 'normal', textAlign: (child.textAlign as 'left' | 'center' | 'right') ?? 'left' })
  if (child.type === 'circle')
    return mkCircle({ left: child.x, top: child.y, radius: child.radius, fill: child.fill, ...optionalStroke(child) })
  if (child.type === 'line')
    return mkLine([child.x1, child.y1, child.x2, child.y2], { stroke: child.stroke, strokeWidth: child.strokeWidth, strokeLineCap: child.strokeLineCap as CanvasLineCap | undefined })
  if (child.type === 'path')
    return new Path(child.path as ConstructorParameters<typeof Path>[0], { fill: child.fill, originX: 'left', originY: 'top', ...optionalStroke(child) })
  return null
}

function serializeGroupChild(obj: FabricObject): GroupChildElement | null {
  if (obj instanceof IText)
    return { type: 'text', x: obj.left ?? 0, y: obj.top ?? 0, width: obj.width, text: obj.text ?? '', fontSize: obj.fontSize ?? 14, fill: String(obj.fill ?? '#000000'), fontWeight: String(obj.fontWeight ?? 'normal'), textAlign: obj.textAlign }
  if (obj instanceof Circle)
    return { type: 'circle', x: obj.left ?? 0, y: obj.top ?? 0, radius: obj.radius ?? 0, fill: String(obj.fill ?? '#000000'), stroke: obj.stroke ? String(obj.stroke) : undefined, strokeWidth: obj.strokeWidth }
  if (obj instanceof Line)
    return { type: 'line', x1: obj.x1 ?? 0, y1: obj.y1 ?? 0, x2: obj.x2 ?? 0, y2: obj.y2 ?? 0, stroke: String(obj.stroke ?? '#000000'), strokeWidth: obj.strokeWidth ?? 1, strokeLineCap: obj.strokeLineCap }
  if (obj instanceof Path)
    return { type: 'path', path: obj.toObject().path, fill: obj.fill ? String(obj.fill) : undefined, stroke: obj.stroke ? String(obj.stroke) : undefined, strokeWidth: obj.strokeWidth }
  if (obj instanceof Rect)
    return { type: 'rect', x: obj.left ?? 0, y: obj.top ?? 0, width: obj.getScaledWidth(), height: obj.getScaledHeight(), fill: String(obj.fill ?? '#000000'), stroke: obj.stroke ? String(obj.stroke) : undefined, strokeWidth: obj.strokeWidth, rx: (obj.rx as number | undefined) ?? 0 }
  return null
}

function addBarChart(data: ChartDatum[] = CHART_DATA): FabricObject {
  const chartH = 160
  const barW = 40
  const gap = 20
  const maxVal = Math.max(...data.map((d) => d.value))
  const children: FabricObject[] = [
    mkRect({ left: 0, top: chartH, width: data.length * (barW + gap), height: 2, fill: '#d1d5db' }),
  ]
  data.forEach((d, i) => {
    const h = (d.value / maxVal) * (chartH - 30)
    const x = i * (barW + gap) + 10
    children.push(mkRect({ left: x, top: chartH - h, width: barW, height: h, fill: d.color, rx: 4, ry: 4 }))
    children.push(tagDataChild(mkText(String(d.value), { left: x, top: chartH - h - 22, fontSize: 14, fill: '#374151', width: barW, textAlign: 'center' }), 'value', i))
    children.push(tagDataChild(mkText(d.label, { left: x, top: chartH + 8, fontSize: 13, fill: '#6b7280', width: barW, textAlign: 'center' }), 'label', i))
  })
  const chartW = data.length * (barW + gap) + 20
  const group = new Group(children, { left: 0, top: 0, width: chartW, height: chartH + 30, originX: 'left', originY: 'top' })
  return tagComponent(group, 'bar-chart', data)
}

/** 折线图：同一组示例数据，把柱子换成"折线+端点圆点"的画法 */
function addLineChart(data: ChartDatum[] = CHART_DATA): FabricObject {
  const chartH = 160
  const stepX = 90
  const maxVal = Math.max(...data.map((d) => d.value))
  const points = data.map((d, i) => ({
    x: i * stepX + 20,
    y: chartH - (d.value / maxVal) * (chartH - 30),
  }))
  const children: FabricObject[] = [
    mkRect({ left: 0, top: chartH, width: (data.length - 1) * stepX + 40, height: 2, fill: '#d1d5db' }),
  ]
  for (let i = 0; i < points.length - 1; i++) {
    children.push(
      mkLine([points[i].x, points[i].y, points[i + 1].x, points[i + 1].y], {
        stroke: '#8b5cf6',
        strokeWidth: 3,
        strokeLineCap: 'round',
      }),
    )
  }
  points.forEach((p, i) => {
    children.push(mkCircle({ left: p.x - 6, top: p.y - 6, radius: 6, fill: '#ffffff', stroke: '#8b5cf6', strokeWidth: 3 }))
    children.push(tagDataChild(mkText(String(data[i].value), { left: p.x - 20, top: p.y - 28, fontSize: 14, fill: '#374151', width: 40, textAlign: 'center' }), 'value', i))
    children.push(tagDataChild(mkText(data[i].label, { left: p.x - 20, top: chartH + 8, fontSize: 13, fill: '#6b7280', width: 40, textAlign: 'center' }), 'label', i))
  })
  const chartW = (data.length - 1) * stepX + 40
  const group = new Group(children, { left: 0, top: 0, width: chartW, height: chartH + 30, originX: 'left', originY: 'top' })
  return tagComponent(group, 'line-chart', data)
}

/** 横向柱状图：标签在左、数值在条形右端，适合标签文字比较长的场景 */
function addHorizontalBarChart(data: ChartDatum[] = CHART_DATA): FabricObject {
  const chartW = 180
  const barH = 26
  const gap = 16
  const labelW = 22
  const maxVal = Math.max(...data.map((d) => d.value))
  const children: FabricObject[] = []
  data.forEach((d, i) => {
    const y = i * (barH + gap)
    const w = (d.value / maxVal) * chartW
    children.push(tagDataChild(mkText(d.label, { left: 0, top: y + barH / 2 - 8, fontSize: 14, fill: '#374151', width: labelW }), 'label', i))
    children.push(mkRect({ left: labelW + 8, top: y, width: w, height: barH, fill: d.color, rx: 4, ry: 4 }))
    children.push(tagDataChild(mkText(String(d.value), { left: labelW + 8 + w + 8, top: y + barH / 2 - 8, fontSize: 13, fill: '#6b7280' }), 'value', i))
  })
  const totalH = data.length * (barH + gap) - gap
  const group = new Group(children, { left: 0, top: 0, width: labelW + 8 + chartW + 40, height: totalH, originX: 'left', originY: 'top' })
  return tagComponent(group, 'hbar-chart', data)
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** 饼图/环形图共用的图例行：色块 + 独立的标签/百分比两个 tagDataChild 文字（可分别双击编辑），
 * 百分比文字编辑时改的是背后的 value（比例的分子），提交后扇形角度和百分比会跟着重新计算 */
function buildPieLegendRow(children: FabricObject[], d: ChartDatum, i: number, r: number, total: number) {
  const ly = r * 2 + 16 + i * 22
  children.push(mkRect({ left: r * 2 + 16, top: ly, width: 12, height: 12, fill: d.color, rx: 3, ry: 3 }))
  children.push(tagDataChild(mkText(d.label, { left: r * 2 + 34, top: ly - 2, fontSize: 13, fill: '#374151', width: 50 }), 'label', i))
  children.push(
    tagDataChild(
      mkText(`${Math.round((d.value / total) * 100)}%`, { left: r * 2 + 86, top: ly - 2, fontSize: 13, fill: '#374151', width: 40 }),
      'value',
      i,
    ),
  )
}

/** 饼图：用 SVG 弧形路径手算每一块扇形，圆心引一条细线到外面的图例文字 */
function addPieChart(data: ChartDatum[] = CHART_DATA): FabricObject {
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
    children.push(new Path(path, { fill: d.color, originX: 'left', originY: 'top' }))
    angle += sweep
  })
  data.forEach((d, i) => buildPieLegendRow(children, d, i, r, total))
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'pie-chart', data)
}

/** 环形图：跟饼图算法一样，多一步——中间盖一个白色圆挖空 */
function addDonutChart(data: ChartDatum[] = CHART_DATA): FabricObject {
  const r = 80
  const innerR = 45
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
    children.push(new Path(path, { fill: d.color, originX: 'left', originY: 'top' }))
    angle += sweep
  })
  children.push(mkCircle({ left: cx - innerR, top: cy - innerR, radius: innerR, fill: '#ffffff' }))
  data.forEach((d, i) => buildPieLegendRow(children, d, i, r, total))
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'donut-chart', data)
}

const FUNNEL_DATA: ChartDatum[] = [
  { label: '访问', value: 100, color: '#8b5cf6' },
  { label: '咨询', value: 65, color: '#a78bfa' },
  { label: '下单', value: 38, color: '#ec4899' },
  { label: '成交', value: 20, color: '#f472b6' },
]

/** 漏斗图：转化率场景常用，每层是上宽下窄的梯形，宽度按占比递减
 * 标签和"数值%"拆成两个独立的 tagDataChild 文字（而不是像最初那样拼成一整串），
 * 这样才能像柱状图一样双击单独编辑其中一项 */
function addFunnelChart(data: ChartDatum[] = FUNNEL_DATA): FabricObject {
  const maxW = 220
  const stageH = 44
  const cx = maxW / 2
  const maxVal = data[0].value
  const children: FabricObject[] = []
  data.forEach((s, i) => {
    const wTop = ((i === 0 ? maxVal : data[i - 1].value) / maxVal) * maxW
    const wBottom = (s.value / maxVal) * maxW
    const y = i * stageH
    const path = `M ${cx - wTop / 2} ${y} L ${cx + wTop / 2} ${y} L ${cx + wBottom / 2} ${y + stageH - 2} L ${cx - wBottom / 2} ${y + stageH - 2} Z`
    children.push(new Path(path, { fill: s.color, originX: 'left', originY: 'top' }))
    const textY = y + stageH / 2 - 9
    children.push(
      tagDataChild(
        mkText(s.label, { left: cx - 50, top: textY, fontSize: 14, fontWeight: 'bold', fill: '#ffffff', width: 48, textAlign: 'right' }),
        'label',
        i,
      ),
    )
    children.push(
      tagDataChild(
        mkText(`${s.value}%`, { left: cx + 2, top: textY, fontSize: 14, fontWeight: 'bold', fill: '#ffffff', width: 48, textAlign: 'left' }),
        'value',
        i,
      ),
    )
  })
  const group = new Group(children, { left: 0, top: 0, width: maxW, height: data.length * stageH - 2, originX: 'left', originY: 'top' })
  return tagComponent(group, 'funnel-chart', data)
}

const PYRAMID_DATA: ChartDatum[] = [
  { label: '战略层', value: 20, color: '#8b5cf6' },
  { label: '管理层', value: 38, color: '#a78bfa' },
  { label: '执行层', value: 65, color: '#ec4899' },
  { label: '基础层', value: 100, color: '#f472b6' },
]

/** 金字塔图：漏斗图的镜像——顶部收成一点、底部最宽，常用来表现"层级越往上人越少"的结构。
 * data 按从上到下排列，value 是"越往下越大"的基数（不要求是百分比，跟漏斗图一样是相对比例） */
function addPyramidChart(data: ChartDatum[] = PYRAMID_DATA): FabricObject {
  const maxW = 220
  const stageH = 44
  const cx = maxW / 2
  const maxVal = data[data.length - 1].value
  const children: FabricObject[] = []
  data.forEach((s, i) => {
    const wTop = i === 0 ? 0 : (data[i - 1].value / maxVal) * maxW
    const wBottom = (s.value / maxVal) * maxW
    const y = i * stageH
    const path = `M ${cx - wTop / 2} ${y} L ${cx + wTop / 2} ${y} L ${cx + wBottom / 2} ${y + stageH - 2} L ${cx - wBottom / 2} ${y + stageH - 2} Z`
    children.push(new Path(path, { fill: s.color, originX: 'left', originY: 'top' }))
    const textY = y + stageH / 2 - 9
    children.push(
      tagDataChild(
        mkText(s.label, { left: cx - 50, top: textY, fontSize: 13, fontWeight: 'bold', fill: '#ffffff', width: 48, textAlign: 'right' }),
        'label',
        i,
      ),
    )
    children.push(
      tagDataChild(
        mkText(`${s.value}%`, { left: cx + 2, top: textY, fontSize: 13, fontWeight: 'bold', fill: '#ffffff', width: 48, textAlign: 'left' }),
        'value',
        i,
      ),
    )
  })
  const group = new Group(children, { left: 0, top: 0, width: maxW, height: data.length * stageH - 2, originX: 'left', originY: 'top' })
  return tagComponent(group, 'pyramid-chart', data)
}

/** 图表统一入口：kind 决定具体画哪一种，插入逻辑（居中定位+选中+存历史）几种共用 */
function addChart(kind: 'bar' | 'hbar' | 'line' | 'pie' | 'donut' | 'funnel' | 'pyramid') {
  if (!canvas) return
  const builders = {
    bar: addBarChart,
    hbar: addHorizontalBarChart,
    line: addLineChart,
    pie: addPieChart,
    donut: addDonutChart,
    funnel: addFunnelChart,
    pyramid: addPyramidChart,
  }
  const obj = builders[kind]()
  const w = obj.width ?? 200
  const h = obj.height ?? 160
  obj.set({ left: canvasSize.width / 2 - w / 2, top: canvasSize.height / 2 - h / 2 })
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  pushHistory()
}

function buildSwatchLegend(data: LegendDatum[] = DEFAULT_SWATCH_LEGEND): FabricObject {
  const children: FabricObject[] = []
  data.forEach((it, i) => {
    const y = i * 26
    children.push(mkRect({ left: 0, top: y, width: 14, height: 14, fill: it.color, rx: 3, ry: 3 }))
    children.push(tagDataChild(mkText(it.label, { left: 22, top: y - 2, fontSize: 14, fill: '#374151' }), 'label', i))
  })
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'swatch-legend', data)
}

/** 步骤流程图：编号圆圈 + 连接线，横向排 3 步，每步下面配一行说明文字 */
function buildStepFlow(data: LegendDatum[] = DEFAULT_STEP_LEGEND): FabricObject {
  const r = 20
  const gap = 100
  const children: FabricObject[] = []
  data.forEach((s, i) => {
    const cx = i * gap + r
    if (i < data.length - 1) {
      children.push(mkLine([cx + r, r, cx + gap - r, r], { stroke: '#d1d5db', strokeWidth: 2 }))
    }
    children.push(mkCircle({ left: cx - r, top: 0, radius: r, fill: s.color }))
    children.push(mkText(String(i + 1), { left: cx - r, top: r - 9, fontSize: 16, fontWeight: 'bold', fill: '#ffffff', width: r * 2, textAlign: 'center' }))
    children.push(tagDataChild(mkText(s.label, { left: cx - 30, top: r * 2 + 10, fontSize: 13, fill: '#374151', width: 60, textAlign: 'center' }), 'label', i))
  })
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'step-legend', data)
}

/** 图标清单：竖排"圆形/方形徽标 + 一行说明文字"，密排信息看板/展板类模板里常见的编号列表、
 * 勾叉清单都是这个形状——喂一个数据数组就整组生成，不用像手摆安全月看板那次一样一条条摆坐标。
 * label 支持双击编辑，shape/color/icon 走 componentData 配置，不做双击编辑（跟其它组件的图标/颜色一致）。*/
function buildIconList(data: IconListDatum[] = DEFAULT_ICON_LIST): FabricObject {
  const children: FabricObject[] = []
  data.forEach((it, i) => {
    const y = i * ICON_LIST_ROW_H
    const half = ICON_LIST_BADGE / 2
    const badge =
      it.shape === 'circle'
        ? mkCircle({ left: 0, top: y, radius: half, fill: it.color })
        : it.shape === 'diamond'
          ? new Path(`M ${half} ${y} L ${ICON_LIST_BADGE} ${y + half} L ${half} ${y + ICON_LIST_BADGE} L 0 ${y + half} Z`, {
              fill: it.color,
              originX: 'left',
              originY: 'top',
            })
          : mkRect({ left: 0, top: y, width: ICON_LIST_BADGE, height: ICON_LIST_BADGE, fill: it.color, rx: 5, ry: 5 })
    children.push(badge)
    children.push(
      mkText(it.icon, {
        left: 0,
        top: y + ICON_LIST_BADGE / 2 - 8,
        width: ICON_LIST_BADGE,
        fontSize: 12,
        fontWeight: 'bold',
        fill: '#ffffff',
        textAlign: 'center',
      }),
    )
    children.push(
      tagDataChild(
        mkText(it.label, { left: ICON_LIST_BADGE + 10, top: y + 1, width: ICON_LIST_LABEL_W, fontSize: 13, fill: '#374151' }),
        'label',
        i,
      ),
    )
  })
  const group = new Group(children, {
    left: 0,
    top: 0,
    width: ICON_LIST_BADGE + 10 + ICON_LIST_LABEL_W,
    height: data.length * ICON_LIST_ROW_H,
    originX: 'left',
    originY: 'top',
  })
  return tagComponent(group, 'icon-list', data)
}

/** 丝带标题条：密排信息看板/展板类模板的分区小标题常用样式——通栏色块 + 两端小三角"旗尾"
 * + 居中白色粗体文字，比之前"细色条+左对齐彩色文字"的写法更接近稿得快那类模板的视觉。
 * text 支持双击编辑，color 走 componentData 配置。*/
function buildRibbonTitle(data: RibbonTitleDatum[] = DEFAULT_RIBBON_TITLE): FabricObject {
  const item = data[0] ?? DEFAULT_RIBBON_TITLE[0]
  const dark = darkenHex(item.color, 45)
  const children: FabricObject[] = [
    mkRect({ left: 0, top: 0, width: RIBBON_W, height: RIBBON_H, fill: item.color }),
    new Path(`M 0 0 L ${-RIBBON_TAIL_W} ${RIBBON_H / 2} L 0 ${RIBBON_H} Z`, { fill: dark, originX: 'left', originY: 'top' }),
    new Path(`M ${RIBBON_W} 0 L ${RIBBON_W + RIBBON_TAIL_W} ${RIBBON_H / 2} L ${RIBBON_W} ${RIBBON_H} Z`, {
      fill: dark,
      originX: 'left',
      originY: 'top',
    }),
    tagDataChild(
      mkText(item.text, { left: 0, top: RIBBON_H / 2 - 10, width: RIBBON_W, fontSize: 16, fontWeight: 'bold', fill: '#ffffff', textAlign: 'center' }),
      'text',
      0,
    ),
  ]
  const group = new Group(children, { left: 0, top: 0, width: RIBBON_W, height: RIBBON_H, originX: 'left', originY: 'top' })
  return tagComponent(group, 'ribbon-title', data)
}

function addLegend(kind: 'swatch' | 'steps' | 'icon-list' | 'ribbon-title') {
  if (!canvas) return
  const obj =
    kind === 'steps'
      ? buildStepFlow()
      : kind === 'icon-list'
        ? buildIconList()
        : kind === 'ribbon-title'
          ? buildRibbonTitle()
          : buildSwatchLegend()
  const w = obj.width ?? 160
  const h = obj.height ?? 80
  obj.set({ left: canvasSize.width / 2 - w / 2, top: canvasSize.height / 2 - h / 2 })
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  pushHistory()
}

interface SwotDatum {
  title: string
  body: string
  color: string
}
const SWOT_DATA: SwotDatum[] = [
  { title: '优势 S', body: '核心竞争力\n产品/团队优势', color: '#22c55e' },
  { title: '劣势 W', body: '待改进的短板', color: '#ef4444' },
  { title: '机会 O', body: '可以把握的\n市场机会', color: '#3b82f6' },
  { title: '威胁 T', body: '需要警惕的\n外部风险', color: '#f59e0b' },
]

/** SWOT 四象限：2x2 彩色格子，每格一个标题+一段说明，标题/说明分别可双击编辑 */
function buildSwot(data: SwotDatum[] = SWOT_DATA): FabricObject {
  const cellW = 150
  const cellH = 110
  const gap = 8
  const children: FabricObject[] = []
  data.forEach((d, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = col * (cellW + gap)
    const y = row * (cellH + gap)
    children.push(mkRect({ left: x, top: y, width: cellW, height: cellH, fill: d.color, rx: 8, ry: 8 }))
    children.push(
      tagDataChild(mkText(d.title, { left: x + 12, top: y + 10, fontSize: 16, fontWeight: 'bold', fill: '#ffffff', width: cellW - 24 }), 'title', i),
    )
    children.push(
      tagDataChild(mkText(d.body, { left: x + 12, top: y + 40, fontSize: 12, fill: '#ffffff', width: cellW - 24 }), 'body', i),
    )
  })
  const group = new Group(children, { left: 0, top: 0, width: cellW * 2 + gap, height: cellH * 2 + gap, originX: 'left', originY: 'top' })
  return tagComponent(group, 'swot', data)
}

interface TimelineDatum {
  date: string
  label: string
  color: string
}
const TIMELINE_DATA: TimelineDatum[] = [
  { date: '2024.01', label: '项目启动', color: '#8b5cf6' },
  { date: '2024.04', label: '产品上线', color: '#ec4899' },
  { date: '2024.08', label: '规模增长', color: '#38bdf8' },
  { date: '2024.12', label: '达成目标', color: '#22c55e' },
]

/** 时间轴：一条横线上依次排节点，每个节点上方是日期、下方是事件说明，两个都可双击编辑 */
function buildTimeline(data: TimelineDatum[] = TIMELINE_DATA): FabricObject {
  const gap = 110
  const r = 8
  const lineY = 34
  const children: FabricObject[] = [mkLine([r, lineY, (data.length - 1) * gap + r, lineY], { stroke: '#d1d5db', strokeWidth: 2 })]
  data.forEach((d, i) => {
    const cx = i * gap + r
    children.push(mkCircle({ left: cx - r, top: lineY - r, radius: r, fill: d.color }))
    children.push(
      tagDataChild(
        mkText(d.date, { left: cx - 40, top: lineY - r - 26, fontSize: 12, fontWeight: 'bold', fill: '#6b7280', width: 80, textAlign: 'center' }),
        'date',
        i,
      ),
    )
    children.push(
      tagDataChild(
        mkText(d.label, { left: cx - 40, top: lineY + r + 10, fontSize: 13, fill: '#374151', width: 80, textAlign: 'center' }),
        'label',
        i,
      ),
    )
  })
  const chartW = (data.length - 1) * gap + r * 2
  const group = new Group(children, { left: 0, top: 0, width: chartW, height: 96, originX: 'left', originY: 'top' })
  return tagComponent(group, 'timeline', data)
}

/** 进度条：标签 + 圆角进度条 + 百分比，value 就是 0~100 的百分比本身（不像饼图那样要除以总数） */
function buildProgressBars(data: ChartDatum[] = CHART_DATA): FabricObject {
  const barW = 180
  const barH = 14
  const rowGap = 30
  const labelW = 56
  const children: FabricObject[] = []
  data.forEach((d, i) => {
    const y = i * rowGap
    children.push(tagDataChild(mkText(d.label, { left: 0, top: y + 1, fontSize: 12, fill: '#374151', width: labelW }), 'label', i))
    children.push(mkRect({ left: labelW, top: y, width: barW, height: barH, fill: '#e5e7eb', rx: barH / 2, ry: barH / 2 }))
    const fillW = Math.min(barW, Math.max(4, (d.value / 100) * barW))
    children.push(mkRect({ left: labelW, top: y, width: fillW, height: barH, fill: d.color, rx: barH / 2, ry: barH / 2 }))
    children.push(
      tagDataChild(mkText(`${d.value}%`, { left: labelW + barW + 8, top: y, fontSize: 12, fill: '#6b7280', width: 40 }), 'value', i),
    )
  })
  const totalH = data.length * rowGap - (rowGap - barH)
  const group = new Group(children, { left: 0, top: 0, width: labelW + barW + 48, height: totalH, originX: 'left', originY: 'top' })
  return tagComponent(group, 'progress-bars', data)
}

interface VsDatum {
  title: string
  point1: string
  point2: string
  point3: string
  color: string
}
const VS_DATA: VsDatum[] = [
  { title: '方案 A', point1: '成本更低', point2: '交付更快', point3: '适合中小团队', color: '#8b5cf6' },
  { title: '方案 B', point1: '功能更全', point2: '扩展性更强', point3: '适合企业级场景', color: '#38bdf8' },
]
const VS_POINT_FIELDS = ['point1', 'point2', 'point3'] as const

/** VS 对比框：左右两张色卡各带标题+三条要点，中间一个"VS"圆牌，标题/每条要点都可单独双击编辑 */
function buildVsCompare(data: VsDatum[] = VS_DATA): FabricObject {
  const cardW = 140
  const cardH = 150
  const gap = 34
  const children: FabricObject[] = []
  data.forEach((d, i) => {
    const x = i * (cardW + gap)
    children.push(mkRect({ left: x, top: 0, width: cardW, height: cardH, fill: d.color, rx: 10, ry: 10 }))
    children.push(
      tagDataChild(mkText(d.title, { left: x + 12, top: 14, fontSize: 16, fontWeight: 'bold', fill: '#ffffff', width: cardW - 24 }), 'title', i),
    )
    VS_POINT_FIELDS.forEach((field, pi) => {
      const py = 52 + pi * 28
      children.push(mkCircle({ left: x + 12, top: py + 6, radius: 2, fill: '#ffffff' }))
      children.push(
        tagDataChild(mkText(d[field], { left: x + 22, top: py, fontSize: 12, fill: '#ffffff', width: cardW - 34 }), field, i),
      )
    })
  })
  const midX = cardW + gap / 2
  children.push(mkCircle({ left: midX - 20, top: cardH / 2 - 20, radius: 20, fill: '#1f2937' }))
  children.push(mkText('VS', { left: midX - 20, top: cardH / 2 - 10, fontSize: 15, fontWeight: 'bold', fill: '#ffffff', width: 40, textAlign: 'center' }))
  const group = new Group(children, { left: 0, top: 0, width: cardW * 2 + gap, height: cardH, originX: 'left', originY: 'top' })
  return tagComponent(group, 'vs-compare', data)
}

/** 图示统一入口：SWOT/时间轴/进度条/VS对比，跟 addChart/addLegend 一样的插入套路 */
function addDiagram(kind: 'swot' | 'timeline' | 'progress' | 'vs') {
  if (!canvas) return
  const builders = {
    swot: buildSwot,
    timeline: buildTimeline,
    progress: buildProgressBars,
    vs: buildVsCompare,
  }
  const obj = builders[kind]()
  const w = obj.width ?? 200
  const h = obj.height ?? 160
  obj.set({ left: canvasSize.width / 2 - w / 2, top: canvasSize.height / 2 - h / 2 })
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  pushHistory()
}

interface TableMerge {
  r1: number
  c1: number
  r2: number
  c2: number
}
interface TableStyle {
  rows: string[][]
  /** TABLE_THEMES 里的 key，缺省/未知 key 一律按 'violet' 处理 */
  theme: string
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  align: 'left' | 'center' | 'right'
  /** 合并单元格范围列表，行列都是 0-indexed 闭区间；只有 (r1,c1) 这个"锚点"格子会被画出来（占满整个合并范围），
   * 范围内其它格子的数据仍然保留在 rows 里（没丢），只是不渲染，重新拆分合并后能恢复 */
  merges: TableMerge[]
}
const DEFAULT_TABLE_STYLE: TableStyle = {
  rows: DEFAULT_TABLE_ROWS,
  theme: 'violet',
  fontFamily: 'sans-serif',
  fontSize: 13,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  merges: [],
}

/** 表格配色预设：表头底色/表头文字色/隔行底色/正文文字色/边框色，插入表格、双击改主题时都读这张表 */
const TABLE_THEMES: Record<string, { header: string; headerText: string; altRow: string; text: string; border: string }> = {
  violet: { header: '#8b5cf6', headerText: '#ffffff', altRow: '#f9fafb', text: '#374151', border: '#e5e7eb' },
  gray: { header: '#4b5563', headerText: '#ffffff', altRow: '#f9fafb', text: '#374151', border: '#e5e7eb' },
  pink: { header: '#ec4899', headerText: '#ffffff', altRow: '#fdf2f8', text: '#831843', border: '#fbcfe8' },
  orange: { header: '#f97316', headerText: '#ffffff', altRow: '#fff7ed', text: '#7c2d12', border: '#fed7aa' },
  blue: { header: '#2563eb', headerText: '#ffffff', altRow: '#eff6ff', text: '#1e3a8a', border: '#bfdbfe' },
}

/** 某个格子如果落在某个合并范围内，返回那个范围；不是锚点也会返回（调用方自己判断 r/c 是不是等于 r1/c1） */
function mergeCovering(merges: TableMerge[], r: number, c: number): TableMerge | undefined {
  return merges.find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2)
}

function buildGridTable(style: TableStyle = DEFAULT_TABLE_STYLE): FabricObject {
  const { rows, fontFamily, fontSize, bold, italic, underline, align, merges } = style
  const t = TABLE_THEMES[style.theme] ?? TABLE_THEMES.violet
  const cellW = TABLE_CELL_W
  const cellH = TABLE_CELL_H
  const cols = rows[0]?.length ?? 0
  const children: FabricObject[] = []
  rows.forEach((row, r) => {
    row.forEach((cellText, c) => {
      const merge = mergeCovering(merges, r, c)
      if (merge && (merge.r1 !== r || merge.c1 !== c)) return // 被合并吸收的格子不单独画
      const spanRows = merge ? merge.r2 - merge.r1 + 1 : 1
      const spanCols = merge ? merge.c2 - merge.c1 + 1 : 1
      const x = c * cellW
      const y = r * cellH
      const w = cellW * spanCols
      const h = cellH * spanRows
      children.push(
        mkRect({
          left: x,
          top: y,
          width: w,
          height: h,
          fill: r === 0 ? t.header : r % 2 === 0 ? t.altRow : '#ffffff',
          stroke: t.border,
          strokeWidth: 1,
        }),
      )
      children.push(
        tagDataChild(
          mkText(cellText, {
            left: x + 8,
            top: y + Math.max(4, (h - fontSize * 1.16) / 2),
            width: w - 16,
            fontSize,
            fill: r === 0 ? t.headerText : t.text,
            fontFamily,
            fontWeight: bold || r === 0 ? 'bold' : 'normal',
            fontStyle: italic ? 'italic' : 'normal',
            underline,
            textAlign: align,
          }),
          'cell',
          r * cols + c,
        ),
      )
    })
  })
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'grid-table', style)
}

/** 无线表格：不画格子背景，只在表头下方和每行下方留一条细分隔线，文字左对齐——常见的"简洁列表"风格 */
function buildBorderlessTable(style: TableStyle = DEFAULT_TABLE_STYLE): FabricObject {
  const { rows, fontFamily, fontSize, bold, italic, underline, align, merges } = style
  const t = TABLE_THEMES[style.theme] ?? TABLE_THEMES.violet
  const cellW = TABLE_CELL_W
  const cellH = TABLE_CELL_H
  const cols = rows[0]?.length ?? 0
  const tableW = cols * cellW
  const children: FabricObject[] = []
  rows.forEach((row, r) => {
    const y = r * cellH
    row.forEach((cellText, c) => {
      const merge = mergeCovering(merges, r, c)
      if (merge && (merge.r1 !== r || merge.c1 !== c)) return
      const spanRows = merge ? merge.r2 - merge.r1 + 1 : 1
      const spanCols = merge ? merge.c2 - merge.c1 + 1 : 1
      const x = c * cellW
      const h = cellH * spanRows
      children.push(
        tagDataChild(
          mkText(cellText, {
            left: x + 4,
            top: y + Math.max(4, (h - fontSize * 1.16) / 2),
            width: cellW * spanCols - 8,
            fontSize,
            fill: r === 0 ? t.header : t.text,
            fontFamily,
            fontWeight: bold || r === 0 ? 'bold' : 'normal',
            fontStyle: italic ? 'italic' : 'normal',
            underline,
            textAlign: align,
          }),
          'cell',
          r * cols + c,
        ),
      )
    })
    children.push(mkRect({ left: 0, top: y + cellH - 1, width: tableW, height: r === 0 ? 2 : 1, fill: r === 0 ? t.header : t.border }))
  })
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'borderless-table', style)
}

function addDataTable(kind: 'grid' | 'borderless') {
  if (!canvas) return
  const obj = kind === 'borderless' ? buildBorderlessTable() : buildGridTable()
  const cols = DEFAULT_TABLE_ROWS[0]?.length ?? 0
  const w = obj.width ?? cols * TABLE_CELL_W
  const h = obj.height ?? DEFAULT_TABLE_ROWS.length * TABLE_CELL_H
  obj.set({ left: canvasSize.width / 2 - w / 2, top: canvasSize.height / 2 - h / 2 })
  canvas.add(obj)
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
  pushHistory()
}

/** 表格样式面板用：修改配色主题/字体/行列数，读当前选中表格的 _componentData 合并 patch 后整表重建
 * （跟双击改单元格走的 commitInlineEdit 是同一套"改数据→调 builder 重建 Group"的模式） */
interface TableStylePatch {
  theme: string
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  align: 'left' | 'center' | 'right'
  rows: number
  cols: number
  /** 行列互换（转置），选完之后原有的合并范围语义就不对了，直接清空 */
  transpose: boolean
  /** 清空所有单元格文字，保留表格结构/样式/合并 */
  clearAll: boolean
  mergeRange: TableMerge
}

/** 表格样式面板用：修改配色主题/字体/字号/加粗斜体下划线/对齐/行列数/转置/清空/合并单元格，
 * 读当前选中表格的 _componentData 合并 patch 后整表重建
 * （跟双击改单元格走的 commitInlineEdit 是同一套"改数据→调 builder 重建 Group"的模式） */
function updateTableStyle(patch: Partial<TableStylePatch>) {
  if (!canvas) return
  const active = canvas.getActiveObject()
  if (!active) return
  const tagged = active as unknown as { _componentKind?: string; _componentData?: TableStyle }
  if (tagged._componentKind !== 'grid-table' && tagged._componentKind !== 'borderless-table') return
  if (!tagged._componentData) return
  const style: TableStyle = JSON.parse(JSON.stringify(tagged._componentData))
  if (patch.theme !== undefined) style.theme = patch.theme
  if (patch.fontFamily !== undefined) style.fontFamily = patch.fontFamily
  if (patch.fontSize !== undefined) style.fontSize = Math.max(8, patch.fontSize)
  if (patch.bold !== undefined) style.bold = patch.bold
  if (patch.italic !== undefined) style.italic = patch.italic
  if (patch.underline !== undefined) style.underline = patch.underline
  if (patch.align !== undefined) style.align = patch.align
  if (patch.rows !== undefined) {
    const cols = style.rows[0]?.length ?? 1
    const target = Math.max(1, patch.rows)
    while (style.rows.length < target) style.rows.push(Array.from({ length: cols }, () => ''))
    if (style.rows.length > target) style.rows.length = target
    style.merges = style.merges.filter((m) => m.r2 < target)
  }
  if (patch.cols !== undefined) {
    const target = Math.max(1, patch.cols)
    style.rows = style.rows.map((row) => {
      const next = row.slice(0, target)
      while (next.length < target) next.push('')
      return next
    })
    style.merges = style.merges.filter((m) => m.c2 < target)
  }
  if (patch.transpose) {
    const cols = style.rows[0]?.length ?? 0
    const rowCount = style.rows.length
    const next: string[][] = Array.from({ length: cols }, () => Array.from({ length: rowCount }, () => ''))
    style.rows.forEach((row, r) => row.forEach((cell, c) => (next[c][r] = cell)))
    style.rows = next
    style.merges = []
  }
  if (patch.clearAll) {
    style.rows = style.rows.map((row) => row.map(() => ''))
  }
  if (patch.mergeRange) {
    const { r1, c1, r2, c2 } = patch.mergeRange
    const rows = style.rows.length
    const cols = style.rows[0]?.length ?? 0
    const rr1 = Math.max(0, Math.min(r1, r2))
    const rr2 = Math.min(rows - 1, Math.max(r1, r2))
    const cc1 = Math.max(0, Math.min(c1, c2))
    const cc2 = Math.min(cols - 1, Math.max(c1, c2))
    // 跟新范围有重叠的旧合并先撤掉，避免合并区域交叉重叠导致渲染混乱
    style.merges = style.merges.filter((m) => !(m.r1 <= rr2 && m.r2 >= rr1 && m.c1 <= cc2 && m.c2 >= cc1))
    if (rr2 > rr1 || cc2 > cc1) style.merges.push({ r1: rr1, c1: cc1, r2: rr2, c2: cc2 })
  }
  const builder = tagged._componentKind === 'borderless-table' ? buildBorderlessTable : buildGridTable
  const newGroup = builder(style)
  newGroup.set({ left: active.left, top: active.top, angle: active.angle })
  canvas.remove(active)
  canvas.add(newGroup)
  canvas.setActiveObject(newGroup)
  emit('selection', describeSelection(newGroup))
  canvas.requestRenderAll()
  pushHistory()
}

/** 每种可编辑组件的 kind → 重建函数，双击改完数据后靠这张表拿对应 builder 重新生成整个 Group */
const COMPONENT_BUILDERS: Record<string, (data: never) => FabricObject> = {
  'bar-chart': addBarChart as (data: never) => FabricObject,
  'line-chart': addLineChart as (data: never) => FabricObject,
  'hbar-chart': addHorizontalBarChart as (data: never) => FabricObject,
  'funnel-chart': addFunnelChart as (data: never) => FabricObject,
  'pie-chart': addPieChart as (data: never) => FabricObject,
  'donut-chart': addDonutChart as (data: never) => FabricObject,
  'pyramid-chart': addPyramidChart as (data: never) => FabricObject,
  'swot': buildSwot as (data: never) => FabricObject,
  'timeline': buildTimeline as (data: never) => FabricObject,
  'progress-bars': buildProgressBars as (data: never) => FabricObject,
  'vs-compare': buildVsCompare as (data: never) => FabricObject,
  'swatch-legend': buildSwatchLegend as (data: never) => FabricObject,
  'step-legend': buildStepFlow as (data: never) => FabricObject,
  'icon-list': buildIconList as (data: never) => FabricObject,
  'ribbon-title': buildRibbonTitle as (data: never) => FabricObject,
  'grid-table': buildGridTable as (data: never) => FabricObject,
  'borderless-table': buildBorderlessTable as (data: never) => FabricObject,
}

function cloneComponentData(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data))
}

/** 根据数据形状通用地把编辑结果写回去：表格是二维字符串数组（或带 rows 字段的 TableStyle 包装），
 * 图表/图例/图示是对象数组——数组项上任意字段都能编辑，原值是数字就按数字解析，是字符串就直接写回，
 * 不用为每种组件、每个字段名分别写"改哪个字段"的逻辑 */
function applyFieldEdit(data: unknown, field: string, index: number, value: string) {
  const maybeTableWrapper = data as { rows?: unknown } | null
  const rows2d =
    Array.isArray(data) && Array.isArray((data as unknown[])[0])
      ? (data as string[][])
      : maybeTableWrapper && Array.isArray(maybeTableWrapper.rows)
        ? (maybeTableWrapper.rows as string[][])
        : null
  if (rows2d) {
    const cols = rows2d[0]?.length ?? 1
    const r = Math.floor(index / cols)
    const c = index % cols
    if (rows2d[r]) rows2d[r][c] = value
    return
  }
  if (Array.isArray(data)) {
    const item = (data as Array<Record<string, unknown>>)[index]
    if (!item || !(field in item)) return
    const current = item[field]
    item[field] = typeof current === 'number' ? parseFloat(value) || 0 : value
  }
}

const inlineEdit = reactive({
  visible: false,
  left: 0,
  top: 0,
  width: 60,
  height: 24,
  fontSize: 14,
  value: '',
})
const inlineEditInput = ref<HTMLInputElement>()
let inlineEditTarget: { group: FabricObject; field: string; index: number } | null = null

/** 双击命中的子元素的场景坐标角点（已经叠加了 group 的变换）经 viewportTransform 换算成画布容器内的 CSS 像素，
 * 用来给悬浮的 <input> 定位——用四个角点取包围盒而不是直接拿 width/height 乘 zoom，组件被整体旋转时也不会算错 */
function openInlineEdit(group: FabricObject, child: FabricObject, field: string, index: number) {
  if (!canvas) return
  const vt = canvas.viewportTransform
  const pts = child.getCoords().map((p) => p.transform(vt))
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const width = Math.max(...xs) - left
  const height = Math.max(...ys) - top
  inlineEdit.left = left
  inlineEdit.top = top
  inlineEdit.width = Math.max(width, 40)
  inlineEdit.height = Math.max(height, 20)
  inlineEdit.fontSize = Math.max((child instanceof IText ? child.fontSize : 14) * canvas.getZoom(), 10)
  inlineEdit.value = child instanceof IText ? (child.text ?? '') : ''
  inlineEdit.visible = true
  inlineEditTarget = { group, field, index }
  nextTick(() => {
    inlineEditInput.value?.focus()
    inlineEditInput.value?.select()
  })
}

function commitInlineEdit() {
  if (!canvas || !inlineEditTarget) {
    inlineEdit.visible = false
    return
  }
  const { group, field, index } = inlineEditTarget
  const tagged = group as unknown as { _componentKind?: string; _componentData?: unknown }
  const builder = tagged._componentKind ? COMPONENT_BUILDERS[tagged._componentKind] : undefined
  if (builder && tagged._componentData) {
    const newData = cloneComponentData(tagged._componentData)
    applyFieldEdit(newData, field, index, inlineEdit.value)
    const newGroup = builder(newData as never)
    newGroup.set({ left: group.left, top: group.top, angle: group.angle })
    canvas.remove(group)
    canvas.add(newGroup)
    canvas.setActiveObject(newGroup)
    canvas.requestRenderAll()
    pushHistory()
  }
  inlineEdit.visible = false
  inlineEditTarget = null
}

function cancelInlineEdit() {
  inlineEdit.visible = false
  inlineEditTarget = null
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
        fontFamily: String(obj.fontFamily ?? 'sans-serif'),
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
    } else if (obj instanceof Group) {
      const children = obj
        .getObjects()
        .map(serializeGroupChild)
        .filter((c): c is GroupChildElement => c !== null)
      const tagged = obj as unknown as { _componentKind?: string; _componentData?: unknown }
      elements.push({
        type: 'group',
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: obj.width,
        height: obj.height,
        angle: obj.angle || undefined,
        componentKind: tagged._componentKind,
        componentData: tagged._componentData,
        children,
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
  applyGeneratedDesign,
  replaceSelectedImage,
  setSelectedTextProp,
  setSelectedTextShadow,
  setSelectedTextStroke,
  setSelectedTextStrokeWidth,
  setSelectedTextStrokeColor,
  setSelectedTextGradient,
  setSelectedTextBackground,
  setSelectedTextShadowDetail,
  applyTextEffectPreset,
  setSelectedTextWarp,
  setSelectedRectFill,
  deselectActive,
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
  addDiagram,
  addDataTable,
  updateTableStyle,
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
    <div class="relative rounded-sm shadow-lg">
      <canvas ref="canvasEl" />
      <input
        v-if="inlineEdit.visible"
        ref="inlineEditInput"
        v-model="inlineEdit.value"
        class="absolute z-10 border-2 border-violet-500 bg-white px-0.5 outline-none"
        :style="{
          left: inlineEdit.left + 'px',
          top: inlineEdit.top + 'px',
          width: inlineEdit.width + 'px',
          height: inlineEdit.height + 'px',
          fontSize: inlineEdit.fontSize + 'px',
        }"
        @keyup.enter="commitInlineEdit"
        @keyup.esc="cancelInlineEdit"
        @blur="commitInlineEdit"
      />
    </div>
  </div>
</template>
