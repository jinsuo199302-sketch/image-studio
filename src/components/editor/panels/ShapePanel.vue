<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'

const emit = defineEmits<{ (e: 'add', color: string); (e: 'add-image', url: string) }>()

const SWATCHES = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed']

const qrText = ref('')
const qrColor = ref('#1f2937')
const generating = ref(false)

async function generateQrcode() {
  const text = qrText.value.trim()
  if (!text) {
    ElMessage.warning('请输入链接或文本内容')
    return
  }
  generating.value = true
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 400,
      margin: 1,
      color: { dark: qrColor.value, light: '#ffffff' },
    })
    emit('add-image', dataUrl)
  } catch {
    ElMessage.error('二维码生成失败，请检查输入内容')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="p-3">
    <p class="mb-2 text-xs font-medium text-gray-600">矩形色块</p>
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="c in SWATCHES"
        :key="c"
        class="flex h-14 items-center justify-center rounded-md text-xs text-white"
        :style="{ background: c }"
        @click="emit('add', c)"
      >
        +
      </button>
    </div>

    <div class="mt-5 border-t border-gray-100 pt-4">
      <p class="mb-2 text-xs font-medium text-gray-600">二维码生成</p>
      <el-input
        v-model="qrText"
        type="textarea"
        :rows="2"
        placeholder="输入网址或文字内容，生成后可直接拖拽调整大小"
      />
      <div class="mt-2 flex items-center gap-2">
        <span class="text-xs text-gray-500">颜色</span>
        <input v-model="qrColor" type="color" class="h-6 w-8 cursor-pointer rounded border border-gray-200" />
        <el-button
          size="small"
          type="primary"
          class="ml-auto !bg-violet-500 !border-none"
          :loading="generating"
          @click="generateQrcode"
        >
          生成并插入
        </el-button>
      </div>
    </div>

    <p class="mt-4 text-xs text-gray-400">更多图形 / 线条 / 图标组件开发中，敬请期待</p>
  </div>
</template>
