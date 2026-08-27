<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, RefreshLeft, UploadFilled } from '@element-plus/icons-vue'

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

type Mode = 'draw' | 'type' | 'sealRound' | 'sealSquare' | 'perforated'
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

// ─────────────────────────── 圆章 / 方章 ───────────────────────────
const sealOuter = ref('')
const sealCenter = ref('')
const sealStar = ref(true)
const sealSquareLines = ref('')
const sealDistress = ref(true)

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

function applyDistress(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < size * 1.6; i++) {
    ctx.globalAlpha = Math.random() * 0.5
    ctx.beginPath()
    ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 2.2, 0, Math.PI * 2)
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
  const outer = sealOuter.value.trim()
  if (!outer) return null
  const S = 640
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const cx = S / 2
  const cy = S / 2
  const R = S / 2 - 14
  ctx.strokeStyle = INK.red
  ctx.fillStyle = INK.red
  ctx.lineWidth = S * 0.022
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.stroke()
  // 外圈文字：沿顶部弧线从左到右排列，字头朝外
  const chars = [...outer]
  const n = chars.length
  const spread = Math.min(Math.PI * 1.5, Math.max(n * 0.34, 0.6))
  ctx.font = `bold ${S * 0.12}px "Noto Serif SC", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  chars.forEach((ch, i) => {
    const a = -Math.PI / 2 - spread / 2 + (n > 1 ? spread * (i / (n - 1)) : 0)
    ctx.save()
    ctx.translate(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82)
    ctx.rotate(a + Math.PI / 2)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  })
  if (sealStar.value) drawStar(ctx, cx, cy, S * 0.13)
  if (sealCenter.value.trim()) {
    ctx.font = `bold ${S * 0.095}px "Noto Serif SC", serif`
    ctx.fillText(sealCenter.value.trim(), cx, cy + R * 0.52)
  }
  if (sealDistress.value) applyDistress(ctx, S)
  return c
}

function buildSquareSeal(): HTMLCanvasElement | null {
  const lines = sealSquareLines.value.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return null
  const S = 640
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = INK.red
  ctx.fillStyle = INK.red
  ctx.lineWidth = S * 0.03
  ctx.strokeRect(S * 0.1, S * 0.1, S * 0.8, S * 0.8)
  const maxLen = Math.max(...lines.map((l) => l.length), 1)
  ctx.font = `bold ${Math.min(S * 0.16, (S * 0.72) / maxLen, (S * 0.62) / lines.length)}px "Noto Serif SC", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const gap = (S * 0.72) / (lines.length + 1)
  lines.forEach((l, i) => ctx.fillText(l, S / 2, S * 0.14 + gap * (i + 1)))
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
  [mode, inkColor, slantDeg, faded, typeName, typeFont, sealOuter, sealCenter, sealStar, sealSquareLines, sealDistress],
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
  const a = document.createElement('a')
  a.href = url
  a.download = mode.value.startsWith('seal') ? '印章.png' : '签名.png'
  a.click()
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
  const a = document.createElement('a')
  a.href = c.toDataURL('image/png')
  a.download = `骑缝章-第${i + 1}页.png`
  a.click()
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
        <p class="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">仅本机开发可见。公章/企业印章不对外开放。</p>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">外圈文字</label>
          <el-input v-model="sealOuter" placeholder="例如：某某工作室" maxlength="20" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">中心横排文字（可选）</label>
          <el-input v-model="sealCenter" placeholder="编号 / 名称" maxlength="12" />
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
