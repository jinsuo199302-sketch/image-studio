<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { colorizePhoto } from '../../../../services/colorizeApi'
import { prepareUpload } from '../../../../utils/prepImage'
import { useAuthStore } from '../../../../stores/auth'

const emit = defineEmits<{ (e: 'insert-image', url: string): void }>()

const authStore = useAuthStore()

const fileInput = ref<HTMLInputElement>()
const originalImage = ref<string | null>(null)
const colorizedImage = ref<string | null>(null)
const processing = ref(false)
const saturation = ref(1.25)
// 对比滑块：0 = 全是原始黑白，100 = 全是上色结果
const wipe = ref(60)

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  const prepped = await prepareUpload(file)
  const reader = new FileReader()
  reader.onload = () => {
    originalImage.value = reader.result as string
    colorizedImage.value = null
  }
  reader.readAsDataURL(prepped)
}

function reset() {
  originalImage.value = null
  colorizedImage.value = null
}

async function run() {
  if (!originalImage.value) return
  processing.value = true
  try {
    colorizedImage.value = await colorizePhoto(authStore.isAuthenticated, originalImage.value, saturation.value)
    wipe.value = 60
    ElMessage.success('上色完成')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '上色失败，请重试')
  } finally {
    processing.value = false
  }
}

function download() {
  if (!colorizedImage.value) return
  const a = document.createElement('a')
  a.href = colorizedImage.value
  a.download = '上色照片.jpg'
  a.click()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="
          authStore.isAuthenticated
            ? '已登录，使用真实上色模型（首次调用要下载模型，会慢一次）'
            : '演示模式：结果为原图占位，登录后自动切换为真实上色'
        "
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
      <p class="mt-2 text-[11px] text-gray-400">
        黑白/褪色老照片转彩色，自动修一下对比。翻拍的照片也能处理。跟"黑白遗像"是相反的两件事。
      </p>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!originalImage"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传一张黑白照片</span>
      </div>

      <template v-else>
        <div class="relative overflow-hidden rounded-lg border border-gray-200">
          <template v-if="colorizedImage">
            <!-- 底层：上色结果；上层：按 wipe 宽度裁出的原始黑白，拖滑块左右对比 -->
            <img :src="colorizedImage" class="block max-h-56 w-full object-contain" />
            <img
              :src="originalImage"
              class="absolute inset-0 block max-h-56 w-full object-contain"
              :style="{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }"
            />
            <div class="absolute bottom-0 left-0 top-0 w-px bg-white/80" :style="{ left: `${wipe}%` }" />
          </template>
          <img v-else :src="originalImage" class="block max-h-56 w-full object-contain" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click="reset"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>

        <div v-if="colorizedImage">
          <label class="mb-1 block text-xs font-medium text-gray-600">对比（左：原图 / 右：上色）</label>
          <el-slider v-model="wipe" :min="0" :max="100" :show-tooltip="false" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">
            鲜艳度 <span class="text-gray-400">{{ saturation.toFixed(1) }}</span>
          </label>
          <el-slider v-model="saturation" :min="0.5" :max="2" :step="0.1" :show-tooltip="false" />
          <p class="mt-1 text-[11px] text-gray-400">颜色偏淡就往右调，调完点"重新上色"</p>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="processing"
          @click="run"
        >
          {{ colorizedImage ? '重新上色' : '开始上色' }}
        </el-button>
      </template>
    </div>

    <div v-if="colorizedImage" class="space-y-2 border-t border-gray-100 p-3">
      <el-button class="!w-full" @click="emit('insert-image', colorizedImage)">插入画布</el-button>
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
