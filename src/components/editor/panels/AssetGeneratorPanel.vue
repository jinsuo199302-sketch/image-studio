<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { generateReferenceAsset } from '../../../services/assetsApi'

const emit = defineEmits<{ (e: 'insert', url: string): void }>()

const file = ref<File | null>(null)
const previewUrl = ref('')
const containerEl = ref<HTMLDivElement>()

const dragging = ref(false)
const startX = ref(0)
const startY = ref(0)
/** 框选矩形，单位是显示容器里的像素——生成时再按容器实际尺寸换算成 0~1 的比例传给后端 */
const rect = ref<{ x: number; y: number; w: number; h: number } | null>(null)

const assetType = ref<'illustration' | 'text'>('illustration')
const textContent = ref('')
const generating = ref(false)
const error = ref('')
const resultUrl = ref('')

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  file.value = f
  previewUrl.value = URL.createObjectURL(f)
  rect.value = null
  resultUrl.value = ''
  error.value = ''
}

function pos(e: PointerEvent) {
  const r = containerEl.value!.getBoundingClientRect()
  return {
    x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
    y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
  }
}

function onPointerDown(e: PointerEvent) {
  if (!previewUrl.value) return
  const p = pos(e)
  dragging.value = true
  startX.value = p.x
  startY.value = p.y
  rect.value = { x: p.x, y: p.y, w: 0, h: 0 }
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const p = pos(e)
  rect.value = {
    x: Math.min(startX.value, p.x),
    y: Math.min(startY.value, p.y),
    w: Math.abs(p.x - startX.value),
    h: Math.abs(p.y - startY.value),
  }
}
function onPointerUp() {
  dragging.value = false
}

function regionFractions() {
  if (!rect.value || !containerEl.value) return null
  const cw = containerEl.value.clientWidth
  const ch = containerEl.value.clientHeight
  if (!cw || !ch || rect.value.w < 6 || rect.value.h < 6) return null
  return { x: rect.value.x / cw, y: rect.value.y / ch, width: rect.value.w / cw, height: rect.value.h / ch }
}

async function generate() {
  if (!file.value) return
  const region = regionFractions()
  if (!region) {
    ElMessage.warning('先在图片上框选一块区域')
    return
  }
  if (assetType.value === 'text' && !textContent.value.trim()) {
    ElMessage.warning('请填写想要生成的文字内容')
    return
  }
  error.value = ''
  generating.value = true
  resultUrl.value = ''
  try {
    const result = await generateReferenceAsset(file.value, region, assetType.value, textContent.value.trim() || undefined)
    resultUrl.value = result.url
    ElMessage.success('生成完成，已自动存进"素材"')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '生成失败'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="space-y-3 p-3">
    <el-alert
      title="只学参考图里这块区域的手法/风格类别，生成的是全新素材，不是抠图复制"
      type="info"
      :closable="false"
      show-icon
    />

    <input type="file" accept="image/*" class="hidden" id="asset-gen-file" @change="onFileChange" />
    <label
      v-if="!previewUrl"
      for="asset-gen-file"
      class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
    >
      <el-icon :size="24"><UploadFilled /></el-icon>
      <span class="text-xs">上传参考图，在图上框选想要的插画/文字</span>
    </label>

    <template v-else>
      <div
        ref="containerEl"
        class="relative cursor-crosshair select-none overflow-hidden rounded-lg border border-gray-200"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
      >
        <img :src="previewUrl" class="pointer-events-none block max-h-64 w-full object-contain" draggable="false" />
        <div
          v-if="rect"
          class="absolute border-2 border-violet-500 bg-violet-500/20"
          :style="{ left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' }"
        />
      </div>
      <label for="asset-gen-file" class="cursor-pointer text-xs text-violet-600 hover:underline">换一张参考图</label>

      <div class="flex gap-2">
        <button
          class="flex-1 rounded-lg border py-1.5 text-xs transition"
          :class="assetType === 'illustration' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="assetType = 'illustration'"
        >
          素材插画
        </button>
        <button
          class="flex-1 rounded-lg border py-1.5 text-xs transition"
          :class="assetType === 'text' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="assetType = 'text'"
        >
          造型文字
        </button>
      </div>

      <el-input
        v-if="assetType === 'text'"
        v-model="textContent"
        placeholder="想生成的文字内容，比如：暑期特惠"
      />
      <p v-else class="text-[11px] text-gray-400">框选的区域会学它的画风类别（比如"扁平卡通插画"），不会照抄具体形状</p>

      <el-button type="primary" class="!w-full !bg-violet-500 !border-none" :loading="generating" @click="generate">
        生成
      </el-button>

      <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

      <template v-if="resultUrl">
        <div
          class="overflow-hidden rounded-lg border border-gray-200 bg-[conic-gradient(#f3f4f6_0deg_90deg,#fff_90deg_180deg,#f3f4f6_180deg_270deg,#fff_270deg_360deg)] [background-size:16px_16px]"
        >
          <img :src="resultUrl" class="max-h-56 w-full object-contain" />
        </div>
        <el-button class="!w-full" @click="emit('insert', resultUrl)">插入到画布</el-button>
      </template>
    </template>
  </div>
</template>
