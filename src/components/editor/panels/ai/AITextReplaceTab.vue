<script setup lang="ts">
import { ref } from 'vue'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import TextReplaceDialog from '../../TextReplaceDialog.vue'

const authStore = useAuthStore()

const fileInput = ref<HTMLInputElement>()
const workingImage = ref<string | null>(null)
const dialogOpen = ref(false)

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    workingImage.value = reader.result as string
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

function reset() {
  workingImage.value = null
}

function download() {
  if (!workingImage.value) return
  const a = document.createElement('a')
  a.href = workingImage.value
  a.download = 'text-replaced.png'
  a.click()
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
        v-if="!workingImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传图片，改日期/价格/品牌名等文字内容</span>
      </div>

      <template v-else>
        <div
          class="relative overflow-hidden rounded-lg border border-gray-200 bg-[conic-gradient(#f3f4f6_0deg_90deg,#fff_90deg_180deg,#f3f4f6_180deg_270deg,#fff_270deg_360deg)] [background-size:16px_16px]"
        >
          <img :src="workingImage" class="max-h-56 w-full object-contain" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click="reset"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>

        <el-button class="!w-full" @click="dialogOpen = true"> 文字替换 </el-button>
      </template>
    </div>

    <div v-if="workingImage" class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        @click="download"
      >
        下载
      </el-button>
    </div>

    <TextReplaceDialog v-model="dialogOpen" :image-src="workingImage ?? ''" @result="(url) => (workingImage = url)" />
  </div>
</template>
