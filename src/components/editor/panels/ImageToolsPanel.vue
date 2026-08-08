<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { removeBackground } from '../../../services/backgroundRemovalApi'
import { upscaleImage } from '../../../services/upscaleApi'
import { useApiConfigStore } from '../../../stores/apiConfig'

const emit = defineEmits<{ (e: 'insert', url: string): void }>()
const apiConfigStore = useApiConfigStore()

const fileInput = ref<HTMLInputElement>()
const workingImage = ref<string | null>(null)
const processing = ref<'' | 'bg' | 'upscale'>('')

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    workingImage.value = reader.result as string
  }
  reader.readAsDataURL(file)
}

function reset() {
  workingImage.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function runRemoveBg() {
  if (!workingImage.value) return
  processing.value = 'bg'
  try {
    workingImage.value = await removeBackground(
      apiConfigStore.isImageConfigured ? apiConfigStore.image : null,
      workingImage.value,
    )
  } catch {
    ElMessage.error('抠图失败，请重试')
  } finally {
    processing.value = ''
  }
}

async function runUpscale() {
  if (!workingImage.value) return
  processing.value = 'upscale'
  try {
    workingImage.value = await upscaleImage(
      apiConfigStore.isImageConfigured ? apiConfigStore.image : null,
      workingImage.value,
    )
  } catch {
    ElMessage.error('放大失败，请重试')
  } finally {
    processing.value = ''
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-4 overflow-y-auto p-3">
      <el-alert
        :title="apiConfigStore.isImageConfigured ? '已接入图片处理接口' : '演示模式：处理结果为原图占位，接口接入后自动切换'"
        :type="apiConfigStore.isImageConfigured ? 'success' : 'info'"
        :closable="false"
        show-icon
      />

      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!workingImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传图片，进行 AI 抠图 / 高清放大</span>
      </div>

      <template v-else>
        <div class="relative overflow-hidden rounded-lg border border-gray-200 bg-[conic-gradient(#f3f4f6_0deg_90deg,#fff_90deg_180deg,#f3f4f6_180deg_270deg,#fff_270deg_360deg)] [background-size:16px_16px]">
          <img :src="workingImage" class="max-h-56 w-full object-contain" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click="reset"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <el-button size="small" :loading="processing === 'bg'" :disabled="!!processing" @click="runRemoveBg">
            AI 抠图
          </el-button>
          <el-button size="small" :loading="processing === 'upscale'" :disabled="!!processing" @click="runUpscale">
            高清放大
          </el-button>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          @click="emit('insert', workingImage)"
        >
          插入画布
        </el-button>
      </template>
    </div>
  </div>
</template>
