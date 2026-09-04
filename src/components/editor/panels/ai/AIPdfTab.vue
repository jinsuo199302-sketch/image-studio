<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { mergePdfs, splitPdf, watermarkPdf, signPdf, type SplitMode } from '../../../../services/pdfApi'
import { saveFile } from '../../../../utils/saveFile'

const props = defineProps<{ presetSignature?: string | null }>()

type SubTab = 'merge' | 'split' | 'watermark' | 'sign'
const activeSubTab = ref<SubTab>('merge')

/** 与服务器 Nginx 的 client_max_body_size 保持一致，改了那边记得也改这里 */
const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

function downloadBlob(blob: Blob, filename: string) {
  return saveFile(filename, blob)
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ---- 合并 ----
const mergeFiles = ref<File[]>([])
const mergeInput = ref<HTMLInputElement>()
const merging = ref(false)
const mergeError = ref('')

function onMergePick(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  const oversized = picked.filter((f) => f.size > MAX_FILE_SIZE)
  const ok = picked.filter((f) => f.size <= MAX_FILE_SIZE)
  if (oversized.length) {
    ElMessage.error(`${oversized.map((f) => f.name).join('、')} 超过 ${MAX_FILE_SIZE_MB}MB，未添加`)
  }
  mergeFiles.value.push(...ok)
  ;(e.target as HTMLInputElement).value = ''
}

function removeMergeFile(i: number) {
  mergeFiles.value.splice(i, 1)
}

function moveMergeFile(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= mergeFiles.value.length) return
  const arr = mergeFiles.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

async function doMerge() {
  if (mergeFiles.value.length < 2) {
    mergeError.value = '至少选择 2 个 PDF 文件'
    return
  }
  mergeError.value = ''
  merging.value = true
  try {
    const blob = await mergePdfs(mergeFiles.value)
    await downloadBlob(blob, 'merged.pdf')
    ElMessage.success('合并完成，已开始下载')
  } catch (e) {
    mergeError.value = e instanceof Error ? e.message : '合并失败，请重试'
  } finally {
    merging.value = false
  }
}

// ---- 拆分 ----
const splitFile = ref<File | null>(null)
const splitInput = ref<HTMLInputElement>()
const splitMode = ref<SplitMode>('every_n')
const pagesPerFile = ref(1)
const ranges = ref('')
const splitting = ref(false)
const splitError = ref('')

function onSplitPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  if (file && file.size > MAX_FILE_SIZE) {
    splitError.value = `文件超过 ${MAX_FILE_SIZE_MB}MB，未选择`
    splitFile.value = null
  } else {
    splitError.value = ''
    splitFile.value = file
  }
  ;(e.target as HTMLInputElement).value = ''
}

async function doSplit() {
  if (!splitFile.value) {
    splitError.value = '请先选择要拆分的 PDF 文件'
    return
  }
  if (splitMode.value === 'ranges' && !ranges.value.trim()) {
    splitError.value = '请输入页码范围，例如 1-3,5,7-9'
    return
  }
  splitError.value = ''
  splitting.value = true
  try {
    const blob = await splitPdf(splitFile.value, splitMode.value, {
      pagesPerFile: pagesPerFile.value,
      ranges: ranges.value.trim(),
    })
    await downloadBlob(blob, 'split.zip')
    ElMessage.success('拆分完成，已开始下载')
  } catch (e) {
    splitError.value = e instanceof Error ? e.message : '拆分失败，请重试'
  } finally {
    splitting.value = false
  }
}

// ---- 加水印 ----
const watermarkFile = ref<File | null>(null)
const watermarkInput = ref<HTMLInputElement>()
const watermarkText = ref('')
const watermarkOpacity = ref(0.3)
const watermarkFontSize = ref(36)
const watermarking = ref(false)
const watermarkError = ref('')

function onWatermarkPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  if (file && file.size > MAX_FILE_SIZE) {
    watermarkError.value = `文件超过 ${MAX_FILE_SIZE_MB}MB，未选择`
    watermarkFile.value = null
  } else {
    watermarkError.value = ''
    watermarkFile.value = file
  }
  ;(e.target as HTMLInputElement).value = ''
}

async function doWatermark() {
  if (!watermarkFile.value) {
    watermarkError.value = '请先选择要加水印的 PDF 文件'
    return
  }
  if (!watermarkText.value.trim()) {
    watermarkError.value = '请输入水印文字'
    return
  }
  watermarkError.value = ''
  watermarking.value = true
  try {
    const blob = await watermarkPdf(watermarkFile.value, watermarkText.value.trim(), {
      opacity: watermarkOpacity.value,
      fontSize: watermarkFontSize.value,
    })
    await downloadBlob(blob, 'watermarked.pdf')
    ElMessage.success('加水印完成，已开始下载')
  } catch (e) {
    watermarkError.value = e instanceof Error ? e.message : '加水印失败，请重试'
  } finally {
    watermarking.value = false
  }
}

// ---- 签名 ----
const signFile = ref<File | null>(null)
const signInput = ref<HTMLInputElement>()
const signatureFile = ref<File | null>(null)
const signatureInput = ref<HTMLInputElement>()
const signPageNumber = ref(1)
const signWidth = ref(0.25)
// 后端要的 x/y 是签名图"左上角"的位置比例，不是中心点——预设位置直接给左上角坐标，
// 不去精确计算图片高度（签名图宽高比不固定，前端不读图就不知道），留够边距够用即可，
// 不追求像素级贴边对齐
type SignPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
const SIGN_POSITIONS: { key: SignPosition; label: string }[] = [
  { key: 'top-left', label: '左上' },
  { key: 'top-right', label: '右上' },
  { key: 'center', label: '居中' },
  { key: 'bottom-left', label: '左下' },
  { key: 'bottom-right', label: '右下' },
]
const signPosition = ref<SignPosition>('bottom-right')

function positionTopLeft(pos: SignPosition, width: number): { x: number; y: number } {
  const margin = 0.05
  const x = pos.includes('left') ? margin : pos.includes('right') ? 1 - width - margin : 0.5 - width / 2
  const y = pos.startsWith('top') ? margin : pos.startsWith('bottom') ? 0.75 : 0.45
  return { x, y }
}
const signing = ref(false)
const signError = ref('')

function onSignFilePick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  if (file && file.size > MAX_FILE_SIZE) {
    signError.value = `文件超过 ${MAX_FILE_SIZE_MB}MB，未选择`
    signFile.value = null
  } else {
    signError.value = ''
    signFile.value = file
  }
  ;(e.target as HTMLInputElement).value = ''
}

function onSignatureImagePick(e: Event) {
  signatureFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
  ;(e.target as HTMLInputElement).value = ''
}

// 「签名」tab 生成签名后跳过来，dataURL 直接转成 File 填进签名槽
watch(
  () => props.presetSignature,
  async (url) => {
    if (!url) return
    const blob = await (await fetch(url)).blob()
    signatureFile.value = new File([blob], '签名.png', { type: 'image/png' })
    activeSubTab.value = 'sign'
    ElMessage.success('已带入生成的签名，选好 PDF 和位置即可')
  },
  { immediate: true },
)

async function doSign() {
  if (!signFile.value) {
    signError.value = '请先选择要签名的 PDF 文件'
    return
  }
  if (!signatureFile.value) {
    signError.value = '请上传签名图片（可以是手写签名的照片，背景透明效果更好）'
    return
  }
  signError.value = ''
  signing.value = true
  try {
    const { x, y } = positionTopLeft(signPosition.value, signWidth.value)
    const blob = await signPdf(signFile.value, signatureFile.value, {
      pageNumber: signPageNumber.value,
      x,
      y,
      width: signWidth.value,
    })
    await downloadBlob(blob, 'signed.pdf')
    ElMessage.success('签名完成，已开始下载')
  } catch (e) {
    signError.value = e instanceof Error ? e.message : '签名失败，请重试'
  } finally {
    signing.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="`合并/拆分/加水印/签名（单个文件最大 ${MAX_FILE_SIZE_MB}MB，页数不限）`"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="flex flex-wrap gap-1.5 px-3 pt-3">
      <button
        v-for="tab in [
          { key: 'merge', label: '合并' },
          { key: 'split', label: '拆分' },
          { key: 'watermark', label: '加水印' },
          { key: 'sign', label: '签名' },
        ]"
        :key="tab.key"
        class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
        :class="
          activeSubTab === tab.key
            ? 'border-violet-500 bg-violet-50 text-violet-600'
            : 'border-gray-200 text-gray-500'
        "
        @click="activeSubTab = tab.key as SubTab"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <template v-if="activeSubTab === 'merge'">
        <input ref="mergeInput" type="file" accept="application/pdf" multiple class="hidden" @change="onMergePick" />
        <div
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="mergeInput?.click()"
        >
          <el-icon :size="22"><UploadFilled /></el-icon>
          <span class="text-xs">点击选择 PDF 文件（可多选，至少 2 个，单个不超过 {{ MAX_FILE_SIZE_MB }}MB）</span>
        </div>

        <div v-if="mergeFiles.length" class="space-y-1.5">
          <div
            v-for="(f, i) in mergeFiles"
            :key="`${f.name}-${i}`"
            class="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 text-xs"
          >
            <span class="w-4 shrink-0 text-center text-gray-400">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1 truncate text-gray-700" :title="f.name">{{ f.name }}</span>
            <span class="shrink-0 text-[11px] text-gray-400">{{ formatSize(f.size) }}</span>
            <button class="text-gray-400 hover:text-gray-600" :disabled="i === 0" @click="moveMergeFile(i, -1)">
              <el-icon :size="12"><ArrowUp /></el-icon>
            </button>
            <button
              class="text-gray-400 hover:text-gray-600"
              :disabled="i === mergeFiles.length - 1"
              @click="moveMergeFile(i, 1)"
            >
              <el-icon :size="12"><ArrowDown /></el-icon>
            </button>
            <button class="text-gray-400 hover:text-red-500" @click="removeMergeFile(i)">
              <el-icon :size="12"><Close /></el-icon>
            </button>
          </div>
        </div>

        <p v-if="mergeError" class="text-xs text-red-500">{{ mergeError }}</p>
      </template>

      <template v-else-if="activeSubTab === 'split'">
        <input ref="splitInput" type="file" accept="application/pdf" class="hidden" @change="onSplitPick" />
        <div
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="splitInput?.click()"
        >
          <el-icon :size="22"><UploadFilled /></el-icon>
          <span class="text-xs">{{ splitFile ? splitFile.name : `点击选择要拆分的 PDF 文件（不超过 ${MAX_FILE_SIZE_MB}MB）` }}</span>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">拆分方式</label>
          <div class="flex gap-1.5">
            <button
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="splitMode === 'every_n' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="splitMode = 'every_n'"
            >
              按页数拆分
            </button>
            <button
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="splitMode === 'ranges' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="splitMode = 'ranges'"
            >
              自定义页码范围
            </button>
          </div>
        </div>

        <div v-if="splitMode === 'every_n'">
          <label class="mb-1 block text-xs font-medium text-gray-600">每份页数</label>
          <el-input-number v-model="pagesPerFile" :min="1" size="small" controls-position="right" />
        </div>
        <div v-else>
          <label class="mb-1 block text-xs font-medium text-gray-600">页码范围</label>
          <el-input v-model="ranges" placeholder="例如：1-3,5,7-9" />
        </div>

        <p v-if="splitError" class="text-xs text-red-500">{{ splitError }}</p>
      </template>

      <template v-else-if="activeSubTab === 'watermark'">
        <input ref="watermarkInput" type="file" accept="application/pdf" class="hidden" @change="onWatermarkPick" />
        <div
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="watermarkInput?.click()"
        >
          <el-icon :size="22"><UploadFilled /></el-icon>
          <span class="text-xs">{{ watermarkFile ? watermarkFile.name : `点击选择要加水印的 PDF 文件（不超过 ${MAX_FILE_SIZE_MB}MB）` }}</span>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">水印文字</label>
          <el-input v-model="watermarkText" placeholder="例如：内部资料 请勿外传" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">透明度</label>
          <el-slider v-model="watermarkOpacity" :min="0.05" :max="0.8" :step="0.05" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">字号</label>
          <el-input-number v-model="watermarkFontSize" :min="12" :max="80" size="small" controls-position="right" />
        </div>

        <p v-if="watermarkError" class="text-xs text-red-500">{{ watermarkError }}</p>
      </template>

      <template v-else>
        <input ref="signInput" type="file" accept="application/pdf" class="hidden" @change="onSignFilePick" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="signInput?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ signFile ? signFile.name : `选择要签名的 PDF（不超过 ${MAX_FILE_SIZE_MB}MB）` }}</span>
        </div>

        <input ref="signatureInput" type="file" accept="image/*" class="hidden" @change="onSignatureImagePick" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="signatureInput?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ signatureFile ? signatureFile.name : '上传签名图片（透明背景效果更好）' }}</span>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">签在第几页</label>
          <el-input-number v-model="signPageNumber" :min="1" size="small" controls-position="right" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">位置</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in SIGN_POSITIONS"
              :key="p.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="signPosition === p.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="signPosition = p.key"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">签名大小</label>
          <el-slider v-model="signWidth" :min="0.1" :max="0.6" :step="0.05" />
        </div>

        <p v-if="signError" class="text-xs text-red-500">{{ signError }}</p>
      </template>
    </div>

    <div class="border-t border-gray-100 p-3">
      <el-button
        v-if="activeSubTab === 'merge'"
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="merging"
        @click="doMerge"
      >
        {{ merging ? '合并中…' : '合并并下载' }}
      </el-button>
      <el-button
        v-else-if="activeSubTab === 'split'"
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="splitting"
        @click="doSplit"
      >
        {{ splitting ? '拆分中…' : '拆分并下载' }}
      </el-button>
      <el-button
        v-else-if="activeSubTab === 'watermark'"
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="watermarking"
        @click="doWatermark"
      >
        {{ watermarking ? '处理中…' : '加水印并下载' }}
      </el-button>
      <el-button
        v-else
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="signing"
        @click="doSign"
      >
        {{ signing ? '处理中…' : '签名并下载' }}
      </el-button>
    </div>
  </div>
</template>
