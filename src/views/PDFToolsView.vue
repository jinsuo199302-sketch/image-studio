<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import { mergePdfs, splitPdf, type SplitMode } from '../services/pdfApi'

type Tab = 'merge' | 'split'
const activeTab = ref<Tab>('merge')

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
  mergeFiles.value.push(...picked)
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
    downloadBlob(blob, 'merged.pdf')
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
  splitFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
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
    downloadBlob(blob, 'split.zip')
    ElMessage.success('拆分完成，已开始下载')
  } catch (e) {
    splitError.value = e instanceof Error ? e.message : '拆分失败，请重试'
  } finally {
    splitting.value = false
  }
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-gray-50">
    <AppHeader />

    <div class="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div class="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-sm">
        <div class="border-b border-gray-100 px-4 py-3">
          <h1 class="text-sm font-semibold text-gray-800">PDF 工具</h1>
          <p class="text-xs text-gray-400">合并多个 PDF，或按页数/范围拆分成多份</p>
        </div>

        <div class="flex border-b border-gray-100 px-2 pt-2">
          <button
            v-for="tab in [
              { key: 'merge', label: '合并' },
              { key: 'split', label: '拆分' },
            ]"
            :key="tab.key"
            class="flex-1 rounded-t-md px-1 py-2 text-xs transition"
            :class="
              activeTab === tab.key
                ? 'border-b-2 border-violet-500 font-medium text-violet-600'
                : 'text-gray-500 hover:text-gray-700'
            "
            @click="activeTab = tab.key as Tab"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="space-y-4 p-4">
          <template v-if="activeTab === 'merge'">
            <input ref="mergeInput" type="file" accept="application/pdf" multiple class="hidden" @change="onMergePick" />
            <div
              class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
              @click="mergeInput?.click()"
            >
              <el-icon :size="22"><UploadFilled /></el-icon>
              <span class="text-xs">点击选择 PDF 文件（可多选，至少 2 个）</span>
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

            <el-button
              type="primary"
              class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
              :loading="merging"
              @click="doMerge"
            >
              {{ merging ? '合并中…' : '合并并下载' }}
            </el-button>
          </template>

          <template v-else>
            <input ref="splitInput" type="file" accept="application/pdf" class="hidden" @change="onSplitPick" />
            <div
              class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
              @click="splitInput?.click()"
            >
              <el-icon :size="22"><UploadFilled /></el-icon>
              <span class="text-xs">{{ splitFile ? splitFile.name : '点击选择要拆分的 PDF 文件' }}</span>
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

            <el-button
              type="primary"
              class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
              :loading="splitting"
              @click="doSplit"
            >
              {{ splitting ? '拆分中…' : '拆分并下载' }}
            </el-button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
