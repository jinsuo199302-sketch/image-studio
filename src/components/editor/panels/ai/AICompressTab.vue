<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close } from '@element-plus/icons-vue'
import { makeStoreZip } from '../../../../utils/storeZip'

type OutFmt = 'keep' | 'jpeg' | 'png' | 'webp'
type Mode = 'quality' | 'target'

interface Item {
  file: File
  name: string
  origSize: number
  outBlob: Blob | null
  outSize: number
  error: string
}

const items = ref<Item[]>([])
const fileInput = ref<HTMLInputElement>()
const outFmt = ref<OutFmt>('keep')
const mode = ref<Mode>('quality')
const quality = ref(80)
const targetKb = ref(200)
const maxSide = ref(0) // 0 = 不限
const processing = ref(false)

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function fmtSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`
}

function onPick(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  for (const f of picked.slice(0, 50)) {
    items.value.push({ file: f, name: f.name, origSize: f.size, outBlob: null, outSize: 0, error: '' })
  }
}
function remove(i: number) {
  items.value.splice(i, 1)
}

function isHeic(f: File) {
  return /\.(heic|heif)$/i.test(f.name) || f.type === 'image/heic' || f.type === 'image/heif'
}

async function heicToJpeg(f: File): Promise<Blob> {
  const form = new FormData()
  form.append('image', f, f.name)
  const res = await fetch('/api/pdf/heic-to-jpg', { method: 'POST', body: form })
  if (!res.ok) throw new Error('HEIC 转换失败')
  return res.blob()
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob)
}

function targetType(srcType: string): { type: string; ext: string } {
  if (outFmt.value === 'jpeg') return { type: 'image/jpeg', ext: 'jpg' }
  if (outFmt.value === 'png') return { type: 'image/png', ext: 'png' }
  if (outFmt.value === 'webp') return { type: 'image/webp', ext: 'webp' }
  const t = srcType === 'image/png' || srcType === 'image/webp' ? srcType : 'image/jpeg'
  return { type: t, ext: EXT[t] ?? 'jpg' }
}

function draw(bmp: ImageBitmap, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * scale))
  c.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return c
}
function encode(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('编码失败'))), type, q),
  )
}

async function processOne(it: Item) {
  it.error = ''
  it.outBlob = null
  try {
    let src: Blob = it.file
    if (isHeic(it.file)) src = await heicToJpeg(it.file)
    const bmp = await loadBitmap(src)
    const { type } = targetType(it.file.type || (isHeic(it.file) ? 'image/jpeg' : 'image/jpeg'))

    let scale = 1
    if (maxSide.value > 0) {
      const longest = Math.max(bmp.width, bmp.height)
      if (longest > maxSide.value) scale = maxSide.value / longest
    }
    let canvas = draw(bmp, scale)

    let blob: Blob
    if (mode.value === 'quality' || type === 'image/png') {
      blob = await encode(canvas, type, quality.value / 100)
    } else {
      const target = targetKb.value * 1024
      let lo = 0.25
      let hi = 0.95
      let best: Blob | null = null
      for (let i = 0; i < 7; i++) {
        const q = (lo + hi) / 2
        const b = await encode(canvas, type, q)
        if (b.size <= target) {
          best = b
          lo = q
        } else {
          hi = q
        }
      }
      // 最低质量还超标 → 逐步缩小尺寸
      let shrink = scale
      while (!best && shrink > 0.15) {
        shrink *= 0.8
        canvas = draw(bmp, shrink)
        const b = await encode(canvas, type, 0.5)
        if (b.size <= target) best = b
      }
      blob = best ?? (await encode(canvas, type, 0.3))
    }
    it.outBlob = blob
    it.outSize = blob.size
  } catch (e) {
    it.error = e instanceof Error ? e.message : '处理失败'
  }
}

async function run() {
  if (!items.value.length) return
  processing.value = true
  try {
    for (const it of items.value) await processOne(it)
    const ok = items.value.filter((i) => i.outBlob).length
    ElMessage[ok ? 'success' : 'error'](ok ? `完成 ${ok} 张` : '全部处理失败')
  } finally {
    processing.value = false
  }
}

function outName(it: Item): string {
  const { ext } = targetType(it.file.type || 'image/jpeg')
  return it.name.replace(/\.[^.]+$/, '') + '.' + ext
}
function downloadOne(it: Item) {
  if (!it.outBlob) return
  const url = URL.createObjectURL(it.outBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = outName(it)
  a.click()
  URL.revokeObjectURL(url)
}
async function downloadAll() {
  const done = items.value.filter((i) => i.outBlob)
  if (!done.length) return
  if (done.length === 1) return downloadOne(done[0])
  const entries = await Promise.all(
    done.map(async (it) => ({ name: outName(it), data: new Uint8Array(await it.outBlob!.arrayBuffer()) })),
  )
  const url = URL.createObjectURL(makeStoreZip(entries))
  const a = document.createElement('a')
  a.href = url
  a.download = '图片.zip'
  a.click()
  URL.revokeObjectURL(url)
}

const anyDone = computed(() => items.value.some((i) => i.outBlob))
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="JPG/PNG/WebP 互转、批量压缩、HEIC 转 JPG。除 HEIC 外全部本地处理，不上传。"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*,.heic,.heif" multiple class="hidden" @change="onPick" />
      <div
        class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="20"><UploadFilled /></el-icon>
        <span class="text-xs">选择图片（可多选，最多 50 张）</span>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">输出格式</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="f in [['keep', '保持原格式'], ['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']] as const"
            :key="f[0]"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="outFmt === f[0] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="outFmt = f[0]"
          >
            {{ f[1] }}
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">压缩方式</label>
        <div class="flex gap-1.5">
          <button
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="mode === 'quality' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="mode = 'quality'"
          >
            按质量
          </button>
          <button
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="mode === 'target' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="mode = 'target'"
          >
            压到指定大小
          </button>
        </div>
      </div>

      <div v-if="mode === 'quality'">
        <label class="mb-1 block text-xs font-medium text-gray-600">质量 {{ quality }}</label>
        <el-slider v-model="quality" :min="10" :max="100" :step="1" />
      </div>
      <div v-else>
        <label class="mb-1 block text-xs font-medium text-gray-600">目标大小（KB 以内）</label>
        <el-input-number v-model="targetKb" :min="10" :max="10000" :step="50" size="small" controls-position="right" />
        <p class="mt-1 text-[11px] text-gray-400">PNG 无损、不吃质量，压到指定大小请选 JPG/WebP 或配合下面缩尺寸</p>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">最大边长（px，0 = 不限）</label>
        <el-input-number v-model="maxSide" :min="0" :max="10000" :step="200" size="small" controls-position="right" />
      </div>

      <div v-if="items.length" class="space-y-1.5">
        <div
          v-for="(it, i) in items"
          :key="i"
          class="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 text-[11px]"
        >
          <span class="min-w-0 flex-1 truncate text-gray-700" :title="it.name">{{ it.name }}</span>
          <span class="shrink-0 text-gray-400">{{ fmtSize(it.origSize) }}</span>
          <template v-if="it.outBlob">
            <span class="shrink-0 text-violet-600">→ {{ fmtSize(it.outSize) }}</span>
            <span class="shrink-0 text-green-600">-{{ Math.max(0, Math.round((1 - it.outSize / it.origSize) * 100)) }}%</span>
            <button class="shrink-0 text-violet-500 hover:underline" @click="downloadOne(it)">下载</button>
          </template>
          <span v-else-if="it.error" class="shrink-0 text-red-500">{{ it.error }}</span>
          <button class="shrink-0 text-gray-400 hover:text-red-500" @click="remove(i)">
            <el-icon :size="12"><Close /></el-icon>
          </button>
        </div>
      </div>
    </div>

    <div v-if="items.length" class="space-y-2 border-t border-gray-100 p-3">
      <el-button v-if="anyDone" class="!w-full" @click="downloadAll">打包下载全部</el-button>
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="processing"
        @click="run"
      >
        {{ processing ? '处理中…' : '开始处理' }}
      </el-button>
    </div>
  </div>
</template>
