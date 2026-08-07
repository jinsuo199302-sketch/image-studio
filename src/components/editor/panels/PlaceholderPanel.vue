<script setup lang="ts">
import { Tools } from '@element-plus/icons-vue'

defineProps<{ label: string }>()
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-gray-400">
    <el-icon :size="28"><Tools /></el-icon>
    <p class="text-sm">{{ label }}功能开发中</p>
    <p class="text-xs">敬请期待后续更新</p>
  </div>
</template>
