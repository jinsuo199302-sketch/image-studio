<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { imageToXlsx } from '../../../../services/tableRecognizeApi'

const authStore = useAuthStore()
const fileInput = ref<HTMLInputElement>()
const workingImage = ref<string | null>(null)
const processing = ref(false)

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => (workingImage.value = reader.result as string)
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function convert() {
  if (!workingImage.value) return
  processing.value = true
  try {
    const blob = await imageToXlsx(authStore.isAuthenticated, workingImage.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '表格.xlsx'
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('已转换，Excel 文件开始下载')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '转换失败，请重试')
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，可识别真实表格' : '请先登录后使用'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
      <p class="mt-2 text-[11px] text-gray-400">
        拍/传表格照片转成 Excel。适合报销单、记账本、清单等；拍歪、无框线也能识别，复杂合并单元格可能需要手动微调。
      </p>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!workingImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传表格照片 / 截图</span>
      </div>

      <template v-else>
        <div class="relative overflow-hidden rounded-lg border border-gray-200">
          <img :src="workingImage" class="max-h-64 w-full object-contain" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click="workingImage = null"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>
      </template>
    </div>

    <div v-if="workingImage" class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="processing"
        @click="convert"
      >
        {{ processing ? '识别中…' : '转成 Excel 并下载' }}
      </el-button>
    </div>
  </div>
</template>
