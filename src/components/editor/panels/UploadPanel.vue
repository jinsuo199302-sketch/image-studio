<script setup lang="ts">
import { ref } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'

const emit = defineEmits<{ (e: 'add', dataUrl: string) }>()
const fileInput = ref<HTMLInputElement>()
const recent = ref<string[]>([])

function onChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const url = reader.result as string
    recent.value.unshift(url)
    emit('add', url)
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div class="p-3">
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onChange" />
    <div
      class="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
      @click="fileInput?.click()"
    >
      <el-icon :size="24"><UploadFilled /></el-icon>
      <span class="text-xs">点击上传图片</span>
    </div>

    <template v-if="recent.length">
      <p class="mb-2 mt-4 text-xs font-medium text-gray-600">本次已上传</p>
      <div class="grid grid-cols-3 gap-2">
        <img
          v-for="(src, i) in recent"
          :key="i"
          :src="src"
          class="aspect-square cursor-pointer rounded-md object-cover"
          @click="emit('add', src)"
        />
      </div>
    </template>
  </div>
</template>
