<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, RefreshLeft, UploadFilled } from '@element-plus/icons-vue'
import { saveFile } from '../../../../utils/saveFile'

/**
 * 签名生成器。纯前端 canvas，无后端。
 * - 生产（所有用户）：只做「个人手写签名」——手绘 + 打字转毛笔体
 * - 本机 dev（VITE_SEAL_TOOLS=true 才出现）：额外的圆章/方章/骑缝章
 *   —— 公章/企业印章法律风险高，只在项目所有者本机开发用，服务器 build 不带这个 flag，
 *      对应 UI 根本不渲染。
 */
const SEAL_ENABLED = import.meta.env.VITE_SEAL_TOOLS === 'true'

const emit = defineEmits<{
  (e: 'insert-image', url: string): void
  (e: 'use-in-pdf', url: string): void
}>()

type Mode = 'draw' | 'type' | 'sealRound' | 'sealSquare' | 'sealPersonal' | 'perforated'
const mode = ref<Mode>('draw')
const MODES = computed(() => {
  const base: { key: Mode; label: string }[] = [
    { key: 'draw', label: '手绘' },
    { key: 'type', label: '打字' },
  ]
  if (SEAL_ENABLED) {
    base.push(
      { key: 'sealRound', label: '圆章' },
      { key: 'sealSquare', label: '方章' },
      { key: 'sealPersonal', label: '私章' },
      { key: 'perforated', label: '骑缝章' },
    )
  }
  return base
})

const INK = { black: '#1a1a1a', blue: '#12347a', red: '#c0201c' }
const inkColor = ref<'black' | 'blue'>('black')
const slantDeg = ref(0)
const faded = ref(false)

// ─────────────────────────── 手绘 ───────────────────────────
const PAD_W = 900
const PAD_H = 300
const padEl = ref<HTMLCanvasElement>()
const penWidth = ref(5)
type Stroke = { color: string; width: number; pts: [number, number][] }
const strokes = ref<Stroke[]>([])
let drawing = false

function padPos(e: PointerEvent): [number, number] {
  const r = padEl.value!.getBoundingClientRect()
  return [((e.clientX - r.left) / r.width) * PAD_W, ((e.clientY - r.top) / r.height) * PAD_H]
}
function redrawPad() {
  const c = padEl.value
  if (!c) return
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, PAD_W, PAD_H)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, PAD_H * 0.74)
  ctx.lineTo(PAD_W, PAD_H * 0.74)
  ctx.stroke()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes.value) {
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.beginPath()
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
  }
}
function onPadDown(e: PointerEvent) {
  drawing = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  strokes.value.push({ color: INK[inkColor.value], width: penWidth.value, pts: [padPos(e)] })
}
function onPadMove(e: PointerEvent) {
  if (!drawing) return
  strokes.value[strokes.value.length - 1].pts.push(padPos(e))
  redrawPad()
}
function onPadUp() {
  drawing = false
}
function undoStroke() {
  strokes.value.pop()
  redrawPad()
}
function clearPad() {
  strokes.value = []
  redrawPad()
}

// ─────────────────────────── 打字 ───────────────────────────
const typeName = ref('')
const SIGN_FONTS = [
  { label: '志莽行书', value: '"Zhi Mang Xing", cursive' },
  { label: '马善政毛笔', value: '"Ma Shan Zheng", cursive' },
  { label: '龙藏体', value: '"Long Cang", cursive' },
  { label: '刘建毛草', value: '"Liu Jian Mao Cao", cursive' },
]
const typeFont = ref(SIGN_FONTS[0].value)

// ─────────────────────────── 圆章 / 方章 / 私章 ───────────────────────────
// 尺寸参照国内实际规格：公章标准 40mm 圆形；私章/名章常见 15/18/20/25mm 方形。
// 渲染像素 = 毫米 / 25.4 * 300dpi，导出即印刷精度。印章文字标准用宋体。
const sealOuter = ref('')
const sealCenter = ref('')
const sealStar = ref(true)
const sealSquareLines = ref('')
const sealDistress = ref(true)
const SEAL_FONT = '"Noto Serif SC", serif' // 印章标准宋体（思源宋体）

const ROUND_SIZES = [
  { label: '公章 40mm', mm: 40 },
  { label: '38mm', mm: 38 },
  { label: '42mm', mm: 42 },
]
const roundSizeMm = ref(40)

const SQUARE_SIZES = [
  { label: '25mm', mm: 25 },
  { label: '20mm', mm: 20 },
  { label: '30mm', mm: 30 },
]
const squareSizeMm = ref(25)

// 私章
const personalName = ref('')
const PERSONAL_SIZES = [
  { label: '15mm', mm: 15 },
  { label: '18mm', mm: 18 },
  { label: '20mm', mm: 20 },
  { label: '25mm', mm: 25 },
]
const personalSizeMm = ref(18)
const PERSONAL_FONTS = [
  { label: '宋体', value: '"Noto Serif SC", serif' },
  { label: '楷体', value: '"LXGW WenKai", serif' },
  { label: '毛笔', value: '"Ma Shan Zheng", cursive' },
]
const personalFont = ref(PERSONAL_FONTS[0].value)
const personalRound = ref(false)

const mmToPx = (mm: number) => Math.round((mm / 25.4) * 300)

// ─────────────────────────── 骑缝章 ───────────────────────────
const perfFile = ref<File | null>(null)
const perfInput = ref<HTMLInputElement>()
const perfImg = ref<HTMLImageElement | null>(null)
const perfPages = ref(3)
function onPerfPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  perfFile.value = f
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  const img = new Image()
  img.onload = () => (perfImg.value = img)
  img.src = URL.createObjectURL(f)
}

// ─────────────────────────── 输出 ───────────────────────────
function trimBounds(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data
  let minX = w, minY = h, maxX = 0, maxY = 0, found = false
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return found ? { minX, minY, maxX, maxY } : null
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rad = i % 2 ? r * 0.42 : r
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
  }
  ctx.closePath()
  ctx.fill()
}

function applyDistress(ctx: CanvasRenderingContext2D, size: number, strength = 1) {
  // 轻微墨色不匀，不啃出明显白刻痕：点小、透明度低、数量少
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  const n = size * 0.35 * strength
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = Math.random() * 0.22
    ctx.beginPath()
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 产出最终透明 PNG canvas；无内容返回 null */
function buildOutput(): HTMLCanvasElement | null {
  if (mode.value === 'draw') return buildFromStrokes()
  if (mode.value === 'type') return buildFromText()
  if (mode.value === 'sealRound') return buildRoundSeal()
  if (mode.value === 'sealSquare') return buildSquareSeal()
  if (mode.value === 'sealPersonal') return buildPersonalSeal()
  return null
}

function shearAndTrim(src: HTMLCanvasElement, pad = 16): HTMLCanvasElement {
  const ctx = src.getContext('2d')!
  const b = trimBounds(ctx, src.width, src.height)
  const out = document.createElement('canvas')
  if (!b) {
    out.width = out.height = 1
    return out
  }
  const cw = b.maxX - b.minX + 1
  const ch = b.maxY - b.minY + 1
  const shear = Math.tan((-slantDeg.value * Math.PI) / 180)
  out.width = Math.ceil(cw + Math.abs(shear) * ch) + pad * 2
  out.height = ch + pad * 2
  const octx = out.getContext('2d')!
  octx.setTransform(1, 0, shear, 1, pad + (shear < 0 ? -shear * ch : 0), pad)
  octx.drawImage(src, b.minX, b.minY, cw, ch, 0, 0, cw, ch)
  if (faded.value) {
    octx.setTransform(1, 0, 0, 1, 0, 0)
    octx.globalCompositeOperation = 'destination-out'
    octx.fillStyle = 'rgba(0,0,0,0.35)'
    octx.fillRect(0, 0, out.width, out.height)
  }
  return out
}

function buildFromStrokes(): HTMLCanvasElement | null {
  if (!strokes.value.length) return null
  const tmp = document.createElement('canvas')
  tmp.width = PAD_W
  tmp.height = PAD_H
  const ctx = tmp.getContext('2d')!
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes.value) {
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.beginPath()
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.stroke()
  }
  return shearAndTrim(tmp)
}

function buildFromText(): HTMLCanvasElement | null {
  const name = typeName.value.trim()
  if (!name) return null
  const tmp = document.createElement('canvas')
  tmp.width = 1400
  tmp.height = 400
  const ctx = tmp.getContext('2d')!
  const size = 200
  ctx.font = `${size}px ${typeFont.value}`
  ctx.fillStyle = INK[inkColor.value]
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, tmp.width / 2, tmp.height / 2)
  return shearAndTrim(tmp)
}

function buildRoundSeal(): HTMLCanvasElement | null {
  const name = sealOuter.value.trim()
  if (!name) return null
  const S = mmToPx(roundSizeMm.value)
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const cx = S / 2
  const cy = S / 2
  const R = S / 2 - S * 0.02
  ctx.fillStyle = INK.red
  ctx.strokeStyle = INK.red

  const strokeRing = () => {
    ctx.lineWidth = Math.max(2, S * 0.017)
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()
  }
  strokeRing()

  // 顶部弧线：公司名。真实公章字形瘦长——横向压到 0.7 倍，从左下绕过顶部到右下（约 245°）
  const nameChars = [...name]
  const nn = nameChars.length
  const CONDENSE = 0.7
  const nameSpread = Math.min(nn * 0.345, Math.PI * 1.42)
  const nameR = R * 0.78
  let nameFont = S * 0.135
  const arcLen = nameR * nameSpread
  if (nn * nameFont * CONDENSE * 1.06 > arcLen) nameFont = arcLen / (nn * CONDENSE * 1.06)
  ctx.font = `${nameFont}px ${SEAL_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  nameChars.forEach((ch, i) => {
    const a = -Math.PI / 2 - nameSpread / 2 + (nn > 1 ? nameSpread * (i / (nn - 1)) : 0)
    ctx.save()
    ctx.translate(cx + Math.cos(a) * nameR, cy + Math.sin(a) * nameR)
    ctx.rotate(a + Math.PI / 2)
    ctx.scale(CONDENSE, 1)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  })

  if (sealStar.value) drawStar(ctx, cx, cy, S * 0.165)

  // 底部弧线：编号，字头朝内（正着读），小号瘦长数字，贴近环线
  const num = sealCenter.value.trim()
  if (num) {
    const numChars = [...num]
    const m = numChars.length
    const numSpread = Math.min(m * 0.11, Math.PI * 0.95)
    const numR = R * 0.86
    ctx.font = `${S * 0.052}px Arial, "Noto Sans SC", sans-serif`
    numChars.forEach((ch, i) => {
      const a = Math.PI / 2 + numSpread / 2 - (m > 1 ? numSpread * (i / (m - 1)) : 0)
      ctx.save()
      ctx.translate(cx + Math.cos(a) * numR, cy + Math.sin(a) * numR)
      ctx.rotate(a - Math.PI / 2)
      ctx.scale(0.78, 1)
      ctx.fillText(ch, 0, 0)
      ctx.restore()
    })
  }

  if (sealDistress.value) {
    applyDistress(ctx, S, 0.7)
    strokeRing() // 做旧后把外环补描一遍，避免出现明显白刻痕
    // 再沿环线补一点点细小缺口——真实盖章会有，但不啃出大白块
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    const nicks = Math.round(R * 0.13)
    for (let i = 0; i < nicks; i++) {
      const a = Math.random() * Math.PI * 2
      ctx.globalAlpha = 0.3 + Math.random() * 0.4
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0.6 + Math.random() * 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  return c
}

function buildSquareSeal(): HTMLCanvasElement | null {
  const lines = sealSquareLines.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const S = mmToPx(squareSizeMm.value)
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = INK.red
  ctx.fillStyle = INK.red
  ctx.lineWidth = Math.max(3, S * 0.028)
  ctx.strokeRect(S * 0.1, S * 0.1, S * 0.8, S * 0.8)
  const maxLen = Math.max(...lines.map((l) => l.length), 1)
  ctx.font = `${Math.min(S * 0.16, (S * 0.72) / maxLen, (S * 0.62) / lines.length)}px ${SEAL_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const gap = (S * 0.72) / (lines.length + 1)
  lines.forEach((l, i) => ctx.fillText(l, S / 2, S * 0.14 + gap * (i + 1)))
  if (sealDistress.value) applyDistress(ctx, S)
  return c
}

/** 私章 / 姓名章：方形（可选圆形）红框 + 姓名。多字按传统竖排、从右到左分列。 */
function buildPersonalSeal(): HTMLCanvasElement | null {
  const name = personalName.value.trim()
  if (!name) return null
  const chars = [...name].slice(0, 4)
  const S = mmToPx(personalSizeMm.value)
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = INK.red
  ctx.fillStyle = INK.red
  ctx.lineWidth = Math.max(3, S * 0.05)
  const m = S * 0.08
  if (personalRound.value) {
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, S / 2 - m, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.strokeRect(m, m, S - m * 2, S - m * 2)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // 分列：1字居中；2字竖排；3字右列1+左列2；4字2×2（右上→右下→左上→左下）
  const inner = S - m * 2 - S * 0.12
  const place = (ch: string, col: number, cols: number, row: number, rows: number) => {
    const cw = inner / cols
    const rh = inner / rows
    const x = S / 2 + (cols === 1 ? 0 : (cols - 1) / 2 - col) * cw // col 0 = 右列
    const y = S / 2 - ((rows - 1) / 2 - row) * rh
    ctx.font = `${Math.min(cw, rh) * 0.92}px ${personalFont.value}`
    ctx.fillText(ch, x, y)
  }
  if (chars.length === 1) place(chars[0], 0, 1, 0, 1)
  else if (chars.length === 2) {
    place(chars[0], 0, 1, 0, 2)
    place(chars[1], 0, 1, 1, 2)
  } else if (chars.length === 3) {
    place(chars[0], 0, 2, 0, 1) // 右列单字，竖直居中
    place(chars[1], 1, 2, 0, 2)
    place(chars[2], 1, 2, 1, 2)
  } else {
    place(chars[0], 0, 2, 0, 2)
    place(chars[1], 0, 2, 1, 2)
    place(chars[2], 1, 2, 0, 2)
    place(chars[3], 1, 2, 1, 2)
  }
  if (sealDistress.value) applyDistress(ctx, S)
  return c
}

// ─────────────────────────── 动作 ───────────────────────────
const previewUrl = ref('')
function refreshPreview() {
  const out = buildOutput()
  previewUrl.value = out && out.width > 1 ? out.toDataURL('image/png') : ''
}
watch(
  [
    mode, inkColor, slantDeg, faded, typeName, typeFont,
    sealOuter, sealCenter, sealStar, sealSquareLines, sealDistress,
    roundSizeMm, squareSizeMm, personalName, personalSizeMm, personalFont, personalRound,
  ],
  () => nextTick(refreshPreview),
)

function currentPng(): string | null {
  const out = buildOutput()
  if (!out || out.width <= 1) {
    ElMessage.warning('还没有可导出的内容')
    return null
  }
  return out.toDataURL('image/png')
}
function download() {
  const url = currentPng()
  if (!url) return
  saveFile(mode.value.startsWith('seal') ? '印章.png' : '签名.png', url)
}
function insertToCanvas() {
  const url = currentPng()
  if (url) emit('insert-image', url)
}
function toPdf() {
  const url = currentPng()
  if (url) emit('use-in-pdf', url)
}

// 骑缝章：把图竖切 N 条，各自下载
function downloadPerfStrip(i: number) {
  if (!perfImg.value) return
  const img = perfImg.value
  const sw = img.naturalWidth / perfPages.value
  const c = document.createElement('canvas')
  c.width = Math.ceil(sw)
  c.height = img.naturalHeight
  c.getContext('2d')!.drawImage(img, i * sw, 0, sw, img.naturalHeight, 0, 0, sw, img.naturalHeight)
  saveFile(`骑缝章-第${i + 1}页.png`, c.toDataURL('image/png'))
}

onMounted(() => {
  redrawPad()
  refreshPreview()
})
watch(mode, () => nextTick(() => mode.value === 'draw' && redrawPad()))
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="生成个人手写签名，导出透明 PNG，可直接插入画布或 PDF 签名"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="flex flex-wrap gap-1.5 px-3 pt-3">
      <button
        v-for="m in MODES"
        :key="m.key"
        class="rounded-full border px-2.5 py-1 text-xs transition"
        :class="mode === m.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m.key"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <!-- 手绘 -->
      <template v-if="mode === 'draw'">
        <div class="rounded-lg border border-gray-200 bg-white">
          <canvas
            ref="padEl"
            :width="PAD_W"
            :height="PAD_H"
            class="w-full touch-none"
            style="aspect-ratio: 3 / 1"
            @pointerdown="onPadDown"
            @pointermove="onPadMove"
            @pointerup="onPadUp"
            @pointerleave="onPadUp"
          />
        </div>
        <div class="flex items-center gap-2">
          <el-button size="small" :icon="RefreshLeft" @click="undoStroke">撤销</el-button>
          <el-button size="small" :icon="Delete" @click="clearPad">清空</el-button>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">笔画粗细</label>
          <el-slider v-model="penWidth" :min="2" :max="14" :step="1" />
        </div>
      </template>

      <!-- 打字 -->
      <template v-else-if="mode === 'type'">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">姓名</label>
          <el-input v-model="typeName" placeholder="输入姓名" maxlength="8" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">字体</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="f in SIGN_FONTS"
              :key="f.value"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="typeFont === f.value ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              :style="{ fontFamily: f.value }"
              @click="typeFont = f.value"
            >
              {{ f.label }}
            </button>
          </div>
        </div>
      </template>

      <!-- 圆章 -->
      <template v-else-if="mode === 'sealRound'">
        <p class="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">仅本机开发可见。文字标准用宋体，标准公章直径 40mm。</p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">公司名称（顶部弧形）</label>
          <el-input v-model="sealOuter" placeholder="XX文化传媒有限公司" maxlength="30" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">底部编号（可选，弧形）</label>
          <el-input v-model="sealCenter" placeholder="如 6201230022810" maxlength="20" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">尺寸</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="s in ROUND_SIZES"
              :key="s.mm"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="roundSizeMm === s.mm ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="roundSizeMm = s.mm"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-600">
          <el-checkbox v-model="sealStar" /> 中心五角星
        </label>
        <label class="flex items-center gap-2 text-xs text-gray-600">
          <el-checkbox v-model="sealDistress" /> 做旧（墨色不匀/缺口）
        </label>
      </template>

      <!-- 方章 -->
      <template v-else-if="mode === 'sealSquare'">
        <p class="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">仅本机开发可见。</p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">文字（每行一条）</label>
          <el-input v-model="sealSquareLines" type="textarea" :rows="3" placeholder="第一行&#10;第二行" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">尺寸</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="s in SQUARE_SIZES"
              :key="s.mm"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="squareSizeMm === s.mm ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="squareSizeMm = s.mm"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-600">
          <el-checkbox v-model="sealDistress" /> 做旧
        </label>
      </template>

      <!-- 私章 / 姓名章 -->
      <template v-else-if="mode === 'sealPersonal'">
        <p class="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">仅本机开发可见。姓名章常见 15–25mm 方形。</p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">姓名（2–4 字）</label>
          <el-input v-model="personalName" placeholder="如 张伟" maxlength="4" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">字体</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="f in PERSONAL_FONTS"
              :key="f.value"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="personalFont === f.value ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              :style="{ fontFamily: f.value }"
              @click="personalFont = f.value"
            >
              {{ f.label }}
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">尺寸</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="s in PERSONAL_SIZES"
              :key="s.mm"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="personalSizeMm === s.mm ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="personalSizeMm = s.mm"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-600">
          <el-checkbox v-model="personalRound" /> 圆形（默认方形）
        </label>
        <label class="flex items-center gap-2 text-xs text-gray-600">
          <el-checkbox v-model="sealDistress" /> 做旧
        </label>
      </template>

      <!-- 骑缝章 -->
      <template v-else-if="mode === 'perforated'">
        <p class="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">仅本机开发可见。上传一张章图，按页数竖切成多条。</p>
        <input ref="perfInput" type="file" accept="image/*" class="hidden" @change="onPerfPick" />
        <div
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-violet-400"
          @click="perfInput?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ perfFile ? perfFile.name : '上传章图（PNG，透明背景）' }}</span>
        </div>
        <div v-if="perfImg">
          <label class="mb-1 block text-xs font-medium text-gray-600">页数</label>
          <el-slider v-model="perfPages" :min="2" :max="10" :step="1" show-stops />
          <div class="mt-2 flex flex-wrap gap-1.5">
            <el-button v-for="i in perfPages" :key="i" size="small" @click="downloadPerfStrip(i - 1)">
              第 {{ i }} 页
            </el-button>
          </div>
        </div>
      </template>

      <!-- 通用调节 + 预览（章模式不用倾斜/淡化） -->
      <template v-if="mode === 'draw' || mode === 'type'">
        <div class="flex gap-2">
          <button
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="inkColor === 'black' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="inkColor = 'black'"
          >
            黑色
          </button>
          <button
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="inkColor === 'blue' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="inkColor = 'blue'"
          >
            蓝色
          </button>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">倾斜 {{ slantDeg }}°</label>
          <el-slider v-model="slantDeg" :min="-15" :max="15" :step="1" />
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-600">
          <el-checkbox v-model="faded" /> 淡化（做旧感）
        </label>
      </template>

      <div v-if="previewUrl" class="rounded-lg border border-gray-200 bg-[conic-gradient(#f3f4f6_0deg_90deg,#fff_90deg_180deg,#f3f4f6_180deg_270deg,#fff_270deg_360deg)] [background-size:14px_14px] p-2">
        <img :src="previewUrl" class="mx-auto max-h-40 object-contain" />
      </div>
    </div>

    <div v-if="mode !== 'perforated'" class="space-y-2 border-t border-gray-100 p-3">
      <div class="flex gap-2">
        <el-button class="!flex-1" @click="insertToCanvas">插入画布</el-button>
        <el-button class="!flex-1" @click="toPdf">用于 PDF 签名</el-button>
      </div>
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        @click="download"
      >
        下载 PNG
      </el-button>
    </div>
  </div>
</template>
