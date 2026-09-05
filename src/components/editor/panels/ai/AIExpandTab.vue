<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { eraseObject } from '../../../../services/imageEditApi'
import { prepareUpload } from '../../../../utils/prepImage'
import { saveFile } from '../../../../utils/saveFile'

const authStore = useAuthStore()

const fileInput = ref<HTMLInputElement>()
const sourceImage = ref<string | null>(null)
const resultImage = ref<string | null>(null)
let img: HTMLImageElement | null = null
// img 是普通闭包变量，Vue 追踪不到它什么时候被异步赋值——layoutText 这个 computed 要跟着
// 图片尺寸变，得靠这个 ref 镜像一份尺寸出来触发响应式
const imgSize = ref<{ w: number; h: number } | null>(null)

type Side = 'top' | 'bottom' | 'left' | 'right'
const SIDES: { key: Side; label: string }[] = [
  { key: 'top', label: '上' },
  { key: 'bottom', label: '下' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
]
const sides = ref<Record<Side, boolean>>({ top: true, bottom: true, left: true, right: true })
const AMOUNTS = [
  { pct: 0.3, label: '30%' },
  { pct: 0.6, label: '60%' },
  { pct: 1.0, label: '100%' },
]
const amount = ref(0.3)
const prompt = ref('')
const processing = ref(false)

const previewCanvasEl = ref<HTMLCanvasElement>()

/** 按当前方向/幅度算出扩展后的画布尺寸和原图在里面的位置 */
function computeLayout() {
  // imgSize（ref）必须放前面先读到——短路的话 Vue 追踪不到这个依赖，
  // 图片异步加载完之后 computed 就再也不会重新算了
  if (!imgSize.value || !img) return null
  const w = imgSize.value.w
  const h = imgSize.value.h
  const left = sides.value.left ? Math.round(w * amount.value) : 0
  const right = sides.value.right ? Math.round(w * amount.value) : 0
  const top = sides.value.top ? Math.round(h * amount.value) : 0
  const bottom = sides.value.bottom ? Math.round(h * amount.value) : 0
  return { w, h, left, right, top, bottom, newW: w + left + right, newH: h + top + bottom }
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  if (file.size > 30 * 1024 * 1024) {
    ElMessage.error('图片超过 30MB，请先压缩')
    return
  }
  const prepped = await prepareUpload(file)
  const reader = new FileReader()
  reader.onload = () => {
    sourceImage.value = reader.result as string
  }
  reader.readAsDataURL(prepped)
}

async function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('图片加载失败'))
    im.src = src
  })
}

async function drawPreview() {
  if (!sourceImage.value) return
  img = await loadImg(sourceImage.value)
  imgSize.value = { w: img.naturalWidth, h: img.naturalHeight }
  await nextTick()
  const layout = computeLayout()
  const canvas = previewCanvasEl.value
  if (!layout || !canvas || !img) return
  const maxDisplay = 380
  const scale = Math.min(maxDisplay / layout.newW, maxDisplay / layout.newH, 1)
  canvas.width = Math.round(layout.newW * scale)
  canvas.height = Math.round(layout.newH * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ede9fe'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#c4b5fd'
  ctx.setLineDash([4, 3])
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2)
  ctx.setLineDash([])
  ctx.drawImage(img, layout.left * scale, layout.top * scale, layout.w * scale, layout.h * scale)
}

watch([sourceImage, sides, amount], drawPreview, { deep: true })

const layoutText = computed(() => {
  const l = computeLayout()
  if (!l) return ''
  return `${l.w}×${l.h} → ${l.newW}×${l.newH}`
})

function reset() {
  sourceImage.value = null
  resultImage.value = null
  img = null
  imgSize.value = null
}

const MAX_LONG_EDGE = 2048

async function submit() {
  const layout = computeLayout()
  if (!layout || !img) return
  if (!layout.left && !layout.right && !layout.top && !layout.bottom) {
    ElMessage.warning('至少选一个要扩展的方向')
    return
  }
  processing.value = true
  try {
    let scale = 1
    const longEdge = Math.max(layout.newW, layout.newH)
    if (longEdge > MAX_LONG_EDGE) scale = MAX_LONG_EDGE / longEdge
    const outW = Math.round(layout.newW * scale)
    const outH = Math.round(layout.newH * scale)

    const imgCanvas = document.createElement('canvas')
    imgCanvas.width = outW
    imgCanvas.height = outH
    const ictx = imgCanvas.getContext('2d')!
    ictx.fillStyle = '#e5e7eb'
    ictx.fillRect(0, 0, outW, outH)
    ictx.drawImage(
      img,
      layout.left * scale,
      layout.top * scale,
      layout.w * scale,
      layout.h * scale,
    )

    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = outW
    maskCanvas.height = outH
    const mctx = maskCanvas.getContext('2d')!
    // 透明 = 交给 AI 生成；实心黑 = 保留原图那一块
    mctx.fillStyle = '#000000'
    mctx.fillRect(layout.left * scale, layout.top * scale, layout.w * scale, layout.h * scale)

    const finalPrompt = prompt.value.trim() || '自然地向外延伸画面内容，风格、光影、透视与原图保持一致，不要出现生硬的边界'
    const result = await eraseObject(
      authStore.isAuthenticated,
      imgCanvas.toDataURL('image/png'),
      maskCanvas.toDataURL('image/png'),
      finalPrompt,
    )
    resultImage.value = result
    ElMessage.success('扩图完成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '扩图失败，请重试')
  } finally {
    processing.value = false
  }
}

function download() {
  if (!resultImage.value) return
  saveFile('扩图结果.png', resultImage.value)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，使用真实 AI 处理' : '演示模式：处理结果为原图，登录后自动切换'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!sourceImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传图片，AI 帮你把画面向外延伸</span>
      </div>

      <template v-else>
        <div class="relative flex justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-2">
          <canvas ref="previewCanvasEl" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click="reset"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>
        <p class="text-center text-[11px] text-gray-400">{{ layoutText }}</p>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">扩展方向</label>
          <div class="flex gap-1.5">
            <button
              v-for="s in SIDES"
              :key="s.key"
              class="h-8 w-12 rounded-md border text-xs transition"
              :class="sides[s.key] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="sides[s.key] = !sides[s.key]"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">扩展幅度</label>
          <div class="flex gap-1.5">
            <button
              v-for="a in AMOUNTS"
              :key="a.pct"
              class="rounded-full border px-3 py-1 text-xs transition"
              :class="amount === a.pct ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="amount = a.pct"
            >
              {{ a.label }}
            </button>
          </div>
        </div>

        <el-input
          v-model="prompt"
          type="textarea"
          :rows="2"
          placeholder="可选：描述扩展出来的部分要是什么内容，留空则自动延续原图风格"
        />

        <el-button
          type="primary"
          class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          :loading="processing"
          @click="submit"
        >
          {{ processing ? '生成中…' : '开始扩图' }}
        </el-button>

        <div v-if="resultImage" class="space-y-2 border-t border-gray-100 pt-3">
          <p class="text-xs font-medium text-gray-600">扩图结果</p>
          <img :src="resultImage" class="w-full rounded-lg border border-gray-200 object-contain" />
        </div>
      </template>
    </div>

    <div v-if="resultImage" class="border-t border-gray-100 p-3">
      <el-button type="primary" class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none" @click="download">
        下载
      </el-button>
    </div>
  </div>
</template>
