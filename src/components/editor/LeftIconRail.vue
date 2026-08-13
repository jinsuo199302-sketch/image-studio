<script setup lang="ts">
import { Files, Picture, Collection, Brush, MagicStick, Upload, Grid, EditPen, Sunny } from '@element-plus/icons-vue'

export type RailKey =
  | 'template'
  | 'image'
  | 'material'
  | 'background'
  | 'shape'
  | 'upload'
  | 'ai'
  | 'ai-design'

const props = defineProps<{ active: RailKey }>()
const emit = defineEmits<{ (e: 'select', key: RailKey): void; (e: 'add-text'): void }>()

const ITEMS: { key: RailKey; label: string; icon: any; ready: boolean }[] = [
  { key: 'template', label: '模板', icon: Files, ready: true },
  { key: 'ai-design', label: 'AI设计', icon: Sunny, ready: true },
  { key: 'image', label: '图片', icon: Picture, ready: true },
  { key: 'material', label: '素材', icon: Collection, ready: false },
  { key: 'background', label: '背景', icon: Brush, ready: true },
  { key: 'shape', label: '组件', icon: Grid, ready: true },
  { key: 'upload', label: '上传', icon: Upload, ready: true },
  { key: 'ai', label: 'AI工具', icon: MagicStick, ready: true },
]
</script>

<template>
  <nav class="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-3">
    <button
      v-for="item in ITEMS"
      :key="item.key"
      class="flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[11px] transition"
      :class="
        props.active === item.key
          ? 'bg-violet-50 text-violet-600'
          : 'text-gray-500 hover:bg-gray-100'
      "
      @click="emit('select', item.key)"
    >
      <el-icon :size="18"><component :is="item.icon" /></el-icon>
      {{ item.label }}
      <span v-if="!item.ready" class="-mt-1 text-[9px] text-gray-300">敬请期待</span>
    </button>

    <div class="my-1 h-px w-8 bg-gray-100" />

    <button
      class="flex w-14 flex-col items-center gap-1 rounded-lg py-2 text-[11px] text-gray-500 transition hover:bg-gray-100"
      @click="emit('add-text')"
    >
      <el-icon :size="18"><EditPen /></el-icon>
      文字
    </button>
  </nav>
</template>
