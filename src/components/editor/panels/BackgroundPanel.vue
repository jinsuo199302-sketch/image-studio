<script setup lang="ts">
const emit = defineEmits<{ (e: 'pick', color: string) }>()

const COLORS = [
  '#ffffff', '#f5f5f5', '#fef3c7', '#fde68a', '#fecaca', '#fca5a5',
  '#dbeafe', '#bfdbfe', '#dcfce7', '#bbf7d0', '#ede9fe', '#ddd6fe',
  '#fce7f3', '#fbcfe8', '#1f2937', '#111827',
]
</script>

<template>
  <div class="p-3">
    <p class="mb-2 text-xs font-medium text-gray-600">背景颜色</p>
    <div class="grid grid-cols-4 gap-2">
      <button
        v-for="c in COLORS"
        :key="c"
        class="h-10 w-10 rounded-lg border border-gray-200"
        :style="{ background: c }"
        @click="emit('pick', c)"
      />
    </div>
    <p class="mt-4 text-xs text-gray-400">更多背景图片 / 渐变素材开发中，敬请期待</p>
  </div>
</template>
