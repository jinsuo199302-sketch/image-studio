<script setup lang="ts">
import { ref } from 'vue'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { stitchScreenshots } from '../../../../services/screenshotStitch'

const fileInput = ref<HTMLInputElement>()
const files = ref<File[]>([])
const previewUrls = ref<string[]>([])
const stitching = ref(false)
const error = ref('')
const resultUrl = ref('')

function onPick(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  files.value.push(...picked)
  previewUrls.value.push(...picked.map((f) => URL.createObjectURL(f)))
  resultUrl.value = ''
  ;(e.target as HTMLInputElement).value = ''
}

function removeFile(i: number) {
  files.value.splice(i, 1)
  URL.revokeObjectURL(previewUrls.value[i])
  previewUrls.value.splice(i, 1)
}

function moveFile(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= files.value.length) return
  const arr = files.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  const urls = previewUrls.value
  ;[urls[i], urls[j]] = [urls[j], urls[i]]
}

async function doStitch() {
  if (files.value.length < 2) {
    error.value = '至少上传 2 张按顺序截的长截图片段'
    return
  }
  error.value = ''
  stitching.value = true
  resultUrl.value = ''
  try {
    resultUrl.value = await stitchScreenshots(files.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '拼接失败，请重试'
  } finally {
    stitching.value = false
  }
}

function download() {
  if (!resultUrl.value) return
  const a = document.createElement('a')
  a.href = resultUrl.value
  a.download = 'stitched.png'
  a.click()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert title="纯本地处理，图片不会上传到服务器——按滑动顺序依次上传几张有重叠内容的截图，自动识别重叠区域拼成一张长图" type="info" :closable="false" show-icon />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
      <div
        class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="20"><UploadFilled /></el-icon>
        <span class="text-xs">点击添加截图（可多选，按顺序，从上往下滑动截的那几张）</span>
      </div>

      <div v-if="files.length" class="space-y-1.5">
        <div
          v-for="(f, i) in files"
          :key="`${f.name}-${i}`"
          class="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 text-xs"
        >
          <span class="w-4 shrink-0 text-center text-gray-400">{{ i + 1 }}</span>
          <img :src="previewUrls[i]" class="h-8 w-8 shrink-0 rounded object-cover" />
          <span class="min-w-0 flex-1 truncate text-gray-700" :title="f.name">{{ f.name }}</span>
          <button class="text-gray-400 hover:text-gray-600" :disabled="i === 0" @click="moveFile(i, -1)">
            <el-icon :size="12"><ArrowUp /></el-icon>
          </button>
          <button class="text-gray-400 hover:text-gray-600" :disabled="i === files.length - 1" @click="moveFile(i, 1)">
            <el-icon :size="12"><ArrowDown /></el-icon>
          </button>
          <button class="text-gray-400 hover:text-red-500" @click="removeFile(i)">
            <el-icon :size="12"><Close /></el-icon>
          </button>
        </div>
      </div>

      <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

      <img v-if="resultUrl" :src="resultUrl" class="w-full rounded-lg border border-gray-200 object-contain" />
    </div>

    <div class="space-y-2 border-t border-gray-100 p-3">
      <el-button type="primary" class="!w-full !bg-violet-500 !border-none" :loading="stitching" @click="doStitch">
        {{ stitching ? '拼接中…' : '开始拼接' }}
      </el-button>
      <el-button v-if="resultUrl" class="!w-full" @click="download">下载长图</el-button>
    </div>
  </div>
</template>
