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
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i]
      const dataTag = c as unknown as { _dataField?: string; _dataIndex?: number }
      if (dataTag._dataField !== undefined && c.visible && c.containsPoint(scenePoint)) {
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
function mkText(text: string, opts: ConstructorParameters<typeof IText>[1]) {
  return new IText(text, { originX: 'left', originY: 'top', ...opts })
}
function mkCircle(opts: ConstructorParameters<typeof Circle>[0]) {
  return new Circle({ originX: 'left', originY: 'top', ...opts })
}
function mkLine(points: [number, number, number, number], opts: ConstructorParameters<typeof Line>[1]) {
  return new Line(points, { originX: 'left', originY: 'top', ...opts })
}

/** Group 组件（图表/图例/表格）落盘/读盘的通用往返：把已知的几种基础图形和它们互转，
 * 这样任何用 mkRect/mkText/mkCircle/mkLine/Path 拼出来的 Group 存模板都不会丢，不用为每种图表单独写序列化逻辑 */
function buildGroupChild(child: GroupChildElement): FabricObject | null {
  if (child.type === 'rect')
    return mkRect({ left: child.x, top: child.y, width: child.width, height: child.height, fill: child.fill, stroke: child.stroke, strokeWidth: child.strokeWidth, rx: child.rx ?? 0, ry: child.rx ?? 0 })
  if (child.type === 'text')
    return mkText(child.text, { left: child.x, top: child.y, width: child.width, fontSize: child.fontSize, fill: child.fill, fontWeight: child.fontWeight ?? 'normal', textAlign: (child.textAlign as 'left' | 'center' | 'right') ?? 'left' })
  if (child.type === 'circle')
    return mkCircle({ left: child.x, top: child.y, radius: child.radius, fill: child.fill, stroke: child.stroke, strokeWidth: child.strokeWidth })
  if (child.type === 'line')
    return mkLine([child.x1, child.y1, child.x2, child.y2], { stroke: child.stroke, strokeWidth: child.strokeWidth, strokeLineCap: child.strokeLineCap as CanvasLineCap | undefined })
  if (child.type === 'path')
    return new Path(child.path as ConstructorParameters<typeof Path>[0], { fill: child.fill, stroke: child.stroke, strokeWidth: child.strokeWidth, originX: 'left', originY: 'top' })
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
    children.push(new Path(path, { fill: d.color, originX: 'left', originY: 'top' }))
    angle += sweep
  })
  data.forEach((d, i) => {
    const ly = r * 2 + 16 + i * 22
    children.push(mkRect({ left: r * 2 + 16, top: ly, width: 12, height: 12, fill: d.color, rx: 3, ry: 3 }))
    children.push(mkText(`${d.label}  ${Math.round((d.value / total) * 100)}%`, { left: r * 2 + 34, top: ly - 2, fontSize: 13, fill: '#374151' }))
  })
  return new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
}

/** 环形图：跟饼图算法一样，多一步——中间盖一个白色圆挖空 */
function addDonutChart(): FabricObject {
  const data = CHART_DATA
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
  data.forEach((d, i) => {
    const ly = r * 2 + 16 + i * 22
    children.push(mkRect({ left: r * 2 + 16, top: ly, width: 12, height: 12, fill: d.color, rx: 3, ry: 3 }))
    children.push(mkText(`${d.label}  ${Math.round((d.value / total) * 100)}%`, { left: r * 2 + 34, top: ly - 2, fontSize: 13, fill: '#374151' }))
  })
  return new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
}

/** 漏斗图：转化率场景常用，每层是上宽下窄的梯形，宽度按占比递减 */
function addFunnelChart(): FabricObject {
  const stages = [
    { label: '访问', value: 100, color: '#8b5cf6' },
    { label: '咨询', value: 65, color: '#a78bfa' },
    { label: '下单', value: 38, color: '#ec4899' },
    { label: '成交', value: 20, color: '#f472b6' },
  ]
  const maxW = 220
  const stageH = 44
  const cx = maxW / 2
  const maxVal = stages[0].value
  const children: FabricObject[] = []
  stages.forEach((s, i) => {
    const wTop = ((i === 0 ? maxVal : stages[i - 1].value) / maxVal) * maxW
    const wBottom = (s.value / maxVal) * maxW
    const y = i * stageH
    const path = `M ${cx - wTop / 2} ${y} L ${cx + wTop / 2} ${y} L ${cx + wBottom / 2} ${y + stageH - 2} L ${cx - wBottom / 2} ${y + stageH - 2} Z`
    children.push(new Path(path, { fill: s.color, originX: 'left', originY: 'top' }))
    children.push(
      mkText(`${s.label} ${s.value}%`, {
        left: cx - 50,
        top: y + stageH / 2 - 9,
        fontSize: 14,
        fontWeight: 'bold',
        fill: '#ffffff',
        width: 100,
        textAlign: 'center',
      }),
    )
  })
  return new Group(children, { left: 0, top: 0, width: maxW, height: stages.length * stageH - 2, originX: 'left', originY: 'top' })
}

/** 图表统一入口：kind 决定具体画哪一种，插入逻辑（居中定位+选中+存历史）几种共用 */
function addChart(kind: 'bar' | 'hbar' | 'line' | 'pie' | 'donut' | 'funnel') {
  if (!canvas) return
  const builders = {
    bar: addBarChart,
    hbar: addHorizontalBarChart,
    line: addLineChart,
    pie: addPieChart,
    donut: addDonutChart,
    funnel: addFunnelChart,
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

function buildGridTable(rows: string[][] = DEFAULT_TABLE_ROWS): FabricObject {
  const cellW = TABLE_CELL_W
  const cellH = TABLE_CELL_H
  const cols = rows[0]?.length ?? 0
  const children: FabricObject[] = []
  rows.forEach((row, r) => {
    row.forEach((cellText, c) => {
      const x = c * cellW
      const y = r * cellH
      children.push(
        mkRect({
          left: x,
          top: y,
          width: cellW,
          height: cellH,
          fill: r === 0 ? '#8b5cf6' : r % 2 === 0 ? '#f9fafb' : '#ffffff',
          stroke: '#e5e7eb',
          strokeWidth: 1,
        }),
      )
      children.push(
        tagDataChild(
          mkText(cellText, { left: x + 8, top: y + 9, fontSize: 13, fill: r === 0 ? '#ffffff' : '#374151', width: cellW - 16 }),
          'cell',
          r * cols + c,
        ),
      )
    })
  })
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'grid-table', rows)
}

/** 无线表格：不画格子背景，只在表头下方和每行下方留一条细分隔线，文字左对齐——常见的"简洁列表"风格 */
function buildBorderlessTable(rows: string[][] = DEFAULT_TABLE_ROWS): FabricObject {
  const cellW = TABLE_CELL_W
  const cellH = TABLE_CELL_H
  const cols = rows[0]?.length ?? 0
  const tableW = cols * cellW
  const children: FabricObject[] = []
  rows.forEach((row, r) => {
    const y = r * cellH
    row.forEach((cellText, c) => {
      const x = c * cellW
      children.push(
        tagDataChild(
          mkText(cellText, {
            left: x + 4,
            top: y + 9,
            fontSize: 13,
            fill: r === 0 ? '#1f2937' : '#4b5563',
            fontWeight: r === 0 ? 'bold' : 'normal',
            width: cellW - 8,
          }),
          'cell',
          r * cols + c,
        ),
      )
    })
    children.push(mkRect({ left: 0, top: y + cellH - 1, width: tableW, height: r === 0 ? 2 : 1, fill: r === 0 ? '#1f2937' : '#e5e7eb' }))
  })
  const group = new Group(children, { left: 0, top: 0, originX: 'left', originY: 'top' })
  return tagComponent(group, 'borderless-table', rows)
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

/** 每种可编辑组件的 kind → 重建函数，双击改完数据后靠这张表拿对应 builder 重新生成整个 Group */
const COMPONENT_BUILDERS: Record<string, (data: never) => FabricObject> = {
  'bar-chart': addBarChart as (data: never) => FabricObject,
  'line-chart': addLineChart as (data: never) => FabricObject,
  'hbar-chart': addHorizontalBarChart as (data: never) => FabricObject,
  'swatch-legend': buildSwatchLegend as (data: never) => FabricObject,
  'step-legend': buildStepFlow as (data: never) => FabricObject,
  'grid-table': buildGridTable as (data: never) => FabricObject,
  'borderless-table': buildBorderlessTable as (data: never) => FabricObject,
}

function cloneComponentData(data: unknown): unknown {
  return JSON.parse(JSON.stringify(data))
}

/** 根据数据形状（表格是二维字符串数组，图表/图例是对象数组）通用地把编辑结果写回去，
 * 不用为每种组件分别写"改哪个字段"的逻辑 */
function applyFieldEdit(data: unknown, field: string, index: number, value: string) {
  if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    const rows = data as string[][]
    const cols = rows[0]?.length ?? 1
    const r = Math.floor(index / cols)
    const c = index % cols
    if (rows[r]) rows[r][c] = value
    return
  }
  if (Array.isArray(data)) {
    const item = (data as Array<{ label: string; value?: number }>)[index]
    if (!item) return
    if (field === 'value') item.value = Number(value) || 0
    else if (field === 'label') item.label = value
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
