<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { removeBackground, type CutoutEdge } from '../../../../services/backgroundRemovalApi'
import { useAuthStore } from '../../../../stores/auth'

const authStore = useAuthStore()

const fileInput = ref<HTMLInputElement>()
const workingImage = ref<string | null>(null)
const originalImage = ref<string | null>(null)
const processing = ref(false)
const edge = ref<CutoutEdge>('soft')

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    workingImage.value = reader.result as string
    originalImage.value = reader.result as string
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

function reset() {
  workingImage.value = null
  originalImage.value = null
}

async function runRemoveBg() {
  // 始终基于原图抠，这样切换"边缘"档位重新抠不会在已抠结果上叠加处理
  if (!originalImage.value) return
  processing.value = true
  try {
    workingImage.value = await removeBackground(authStore.isAuthenticated, originalImage.value, edge.value)
    ElMessage.success('抠图完成')
  } catch {
    ElMessage.error('抠图失败，请重试')
  } finally {
    processing.value = false
  }
}

function download() {
  if (!workingImage.value) return
  const a = document.createElement('a')
  a.href = workingImage.value
  a.download = 'cutout.png'
  a.click()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="
          authStore.isAuthenticated
            ? '已登录，使用真实抠图接口（首次调用会稍慢，之后更快）'
            : '演示模式：处理结果为原图占位，登录后自动切换为真实抠图'
        "
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
        <span class="text-xs">上传图片，一键去背景</span>
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

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">边缘</label>
          <div class="flex gap-1.5">
            <button
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="edge === 'soft' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="edge = 'soft'"
            >
              自然（留发丝）
            </button>
            <button
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="edge === 'hard' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="edge = 'hard'"
            >
              锐利（照相馆硬边）
            </button>
          </div>
          <p class="mt-1 text-[11px] text-gray-400">边缘发虚、像贴上去的，就切"锐利"重抠一次</p>
        </div>

        <el-button class="!w-full" :loading="processing" :disabled="processing" @click="runRemoveBg"> AI 抠图 </el-button>
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
  </div>
</template>
