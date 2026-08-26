<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { extractTextFromImage } from '../../../../services/ocrApi'

const authStore = useAuthStore()

const fileInput = ref<HTMLInputElement>()
const workingImage = ref<string | null>(null)
const extracting = ref(false)
const resultText = ref('')
const error = ref('')

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    workingImage.value = reader.result as string
    resultText.value = ''
    error.value = ''
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

function reset() {
  workingImage.value = null
  resultText.value = ''
}

async function runExtract() {
  if (!workingImage.value) return
  extracting.value = true
  error.value = ''
  try {
    resultText.value = await extractTextFromImage(authStore.isAuthenticated, workingImage.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '提取失败，请重试'
  } finally {
    extracting.value = false
  }
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(resultText.value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选中文字复制')
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，使用真实文字提取接口' : '演示模式：提取结果为示例文字，登录后自动切换'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
      <p class="mt-2 text-[11px] text-gray-400">适合截图/名片/文档拍照等轻量场景快速提取一段文字，不是专业票据识别工具</p>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!workingImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传图片，提取图中的文字</span>
      </div>

      <template v-else>
        <div class="relative overflow-hidden rounded-lg border border-gray-200">
          <img :src="workingImage" class="max-h-48 w-full object-contain" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click="reset"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>

        <el-button class="!w-full" :loading="extracting" @click="runExtract"> 提取文字 </el-button>

        <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

        <template v-if="resultText">
          <el-input v-model="resultText" type="textarea" :rows="6" readonly />
          <el-button class="!w-full" @click="copyResult">复制文字</el-button>
        </template>
      </template>
    </div>
  </div>
</template>
