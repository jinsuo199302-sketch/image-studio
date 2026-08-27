<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { scanToPdf, type ScanMode } from '../../../../services/pdfApi'

const MAX_FILES = 30
const MAX_FILE_SIZE = 20 * 1024 * 1024

interface Page {
  file: File
  url: string
}
const pages = ref<Page[]>([])
const fileInput = ref<HTMLInputElement>()
const mode = ref<ScanMode>('bw')
const autoCrop = ref(true)
const processing = ref(false)

const MODES: { key: ScanMode; label: string; desc: string }[] = [
  { key: 'bw', label: '黑白', desc: '纸白字黑，最清晰，文件小' },
  { key: 'gray', label: '灰度', desc: '保留印章、手写、浅色底纹' },
  { key: 'color', label: '彩色', desc: '带照片/彩色内容的页面' },
]

function onPick(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  for (const f of picked) {
    if (pages.value.length >= MAX_FILES) {
      ElMessage.warning(`最多 ${MAX_FILES} 页`)
      break
    }
    if (f.size > MAX_FILE_SIZE) {
      ElMessage.error(`${f.name} 超过 20MB，已跳过`)
      continue
    }
    pages.value.push({ file: f, url: URL.createObjectURL(f) })
  }
}

function remove(i: number) {
  URL.revokeObjectURL(pages.value[i].url)
  pages.value.splice(i, 1)
}
function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= pages.value.length) return
  const arr = pages.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

async function generate() {
  if (!pages.value.length) return
  processing.value = true
  try {
    const blob = await scanToPdf(
      pages.value.map((p) => p.file),
      mode.value,
      autoCrop.value,
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scan.pdf'
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('扫描件已生成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '扫描失败，请重试')
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="拍/传文档照片，自动裁边校正 + 增强，合成清晰扫描件 PDF（本地处理，不上传第三方）"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
      <div
        class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="22"><UploadFilled /></el-icon>
        <span class="text-xs">点击选择文档照片（可多选，多页按顺序合成，单张不超过 20MB）</span>
      </div>

      <div v-if="pages.length" class="grid grid-cols-3 gap-2">
        <div v-for="(p, i) in pages" :key="p.url" class="group relative overflow-hidden rounded-md border border-gray-200">
          <img :src="p.url" class="h-24 w-full object-cover" />
          <div class="absolute inset-x-0 top-0 flex justify-between bg-black/40 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
            <span class="text-[11px] text-white">{{ i + 1 }}</span>
            <div class="flex gap-1">
              <button class="text-white disabled:opacity-30" :disabled="i === 0" @click="move(i, -1)">
                <el-icon :size="12"><ArrowUp /></el-icon>
              </button>
              <button class="text-white disabled:opacity-30" :disabled="i === pages.length - 1" @click="move(i, 1)">
                <el-icon :size="12"><ArrowDown /></el-icon>
              </button>
              <button class="text-white hover:text-red-300" @click="remove(i)">
                <el-icon :size="12"><Close /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">模式</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="m in MODES"
            :key="m.key"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="mode === m.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="mode = m.key"
          >
            {{ m.label }}
          </button>
        </div>
        <p class="mt-1 text-[11px] text-gray-400">{{ MODES.find((m) => m.key === mode)?.desc }}</p>
      </div>

      <label class="flex items-center gap-2 text-xs text-gray-600">
        <el-checkbox v-model="autoCrop" /> 自动裁边校正（检测不到纸张边界时用整张图）
      </label>
    </div>

    <div class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="processing"
        :disabled="!pages.length"
        @click="generate"
      >
        {{ processing ? '处理中…' : `生成扫描件 PDF（${pages.length} 页）` }}
      </el-button>
    </div>
  </div>
</template>
