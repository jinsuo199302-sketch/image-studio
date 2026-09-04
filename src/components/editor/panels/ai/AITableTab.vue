<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { imageToXlsx, type Orient, type Paper } from '../../../../services/tableRecognizeApi'
import { prepareUpload } from '../../../../utils/prepImage'
import { saveFile } from '../../../../utils/saveFile'

const authStore = useAuthStore()
const fileInput = ref<HTMLInputElement>()
const workingImage = ref<string | null>(null)
const processing = ref(false)
const paper = ref<Paper>('A4')
const orientation = ref<Orient>('auto')

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  if (file.size > 30 * 1024 * 1024) {
    ElMessage.error('图片超过 30MB，请先压缩')
    return
  }
  const prepped = await prepareUpload(file)
  const reader = new FileReader()
  reader.onload = () => (workingImage.value = reader.result as string)
  reader.readAsDataURL(prepped)
}

async function convert() {
  if (!workingImage.value) return
  processing.value = true
  try {
    const blob = await imageToXlsx(authStore.isAuthenticated, workingImage.value, paper.value, orientation.value)
    await saveFile('表格.xlsx', blob)
    ElMessage.success('已转换')
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
        拍/传表格照片转成 Excel，带线框、还原合并单元格。适合报销单、验收单、记账本等；复杂表格可能需手动微调。
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
          <img :src="workingImage" class="max-h-56 w-full object-contain" />
          <button
            class="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-600 hover:bg-white"
            @click="workingImage = null"
          >
            <el-icon :size="13"><Delete /></el-icon>
          </button>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">纸张</label>
          <div class="flex gap-1.5">
            <button
              v-for="p in ['A4', 'A3'] as const"
              :key="p"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="paper === p ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="paper = p"
            >
              {{ p }}
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">方向</label>
          <div class="flex gap-1.5">
            <button
              v-for="o in [['auto', '自动'], ['portrait', '纵向'], ['landscape', '横向']] as const"
              :key="o[0]"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="orientation === o[0] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="orientation = o[0]"
            >
              {{ o[1] }}
            </button>
          </div>
          <p class="mt-1 text-[11px] text-gray-400">Excel 里已设"打印时缩放到 1 页宽"，打印/预览即按所选纸张比例</p>
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
