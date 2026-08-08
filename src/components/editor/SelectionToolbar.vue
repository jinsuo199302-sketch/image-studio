<script setup lang="ts">
import { Delete, Picture, Plus, Minus, MagicStick } from '@element-plus/icons-vue'
import type { SelectionInfo } from './CanvasStage.vue'

const props = defineProps<{ selection: SelectionInfo; removingBackground?: boolean }>()
const emit = defineEmits<{
  (e: 'text-prop', prop: 'fontSize' | 'fill' | 'fontWeight' | 'textAlign', value: string | number): void
  (e: 'replace-image'): void
  (e: 'remove-background'): void
  (e: 'delete'): void
}>()

const TEXT_COLORS = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#ffffff']

function bump(delta: number) {
  const size = Math.max(8, (props.selection.fontSize ?? 24) + delta)
  emit('text-prop', 'fontSize', size)
}
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-md">
    <template v-if="selection.type === 'text'">
      <div class="flex items-center gap-1">
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bump(-2)">
          <el-icon :size="12"><Minus /></el-icon>
        </button>
        <span class="w-6 text-center text-xs text-gray-600">{{ selection.fontSize }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bump(2)">
          <el-icon :size="12"><Plus /></el-icon>
        </button>
      </div>

      <div class="h-4 w-px bg-gray-200" />

      <button
        class="rounded px-2 py-1 text-xs font-bold transition"
        :class="selection.fontWeight === 'bold' ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        @click="emit('text-prop', 'fontWeight', selection.fontWeight === 'bold' ? 'normal' : 'bold')"
      >
        B
      </button>

      <div class="h-4 w-px bg-gray-200" />

      <div class="flex items-center gap-1">
        <button
          v-for="c in TEXT_COLORS"
          :key="c"
          class="h-5 w-5 rounded-full border border-gray-200"
          :style="{ background: c }"
          @click="emit('text-prop', 'fill', c)"
        />
      </div>

      <div class="h-4 w-px bg-gray-200" />

      <button
        v-for="align in ['left', 'center', 'right']"
        :key="align"
        class="rounded px-1.5 py-1 text-xs transition"
        :class="selection.textAlign === align ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
        @click="emit('text-prop', 'textAlign', align)"
      >
        {{ align === 'left' ? '左' : align === 'center' ? '中' : '右' }}
      </button>
    </template>

    <template v-else-if="selection.type === 'image'">
      <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('replace-image')">
        <el-icon :size="14"><Picture /></el-icon>
        替换图片
      </button>

      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        :disabled="removingBackground"
        @click="emit('remove-background')"
      >
        <el-icon :size="14"><MagicStick /></el-icon>
        {{ removingBackground ? '抠图中…' : 'AI 抠图' }}
      </button>
    </template>

    <div class="h-4 w-px bg-gray-200" />

    <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50" @click="emit('delete')">
      <el-icon :size="14"><Delete /></el-icon>
      删除
    </button>
  </div>
</template>
