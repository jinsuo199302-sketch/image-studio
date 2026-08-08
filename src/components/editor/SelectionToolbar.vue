<script setup lang="ts">
import { Delete, Picture, Plus, Minus, MagicStick, Brush } from '@element-plus/icons-vue'
import type { SelectionInfo } from './CanvasStage.vue'

type TextProp = 'fontSize' | 'fill' | 'fontWeight' | 'fontStyle' | 'underline' | 'textAlign' | 'lineHeight' | 'charSpacing'

const props = defineProps<{ selection: SelectionInfo; removingBackground?: boolean }>()
const emit = defineEmits<{
  (e: 'text-prop', prop: TextProp, value: string | number | boolean): void
  (e: 'text-shadow', enabled: boolean): void
  (e: 'text-stroke', enabled: boolean): void
  (e: 'replace-image'): void
  (e: 'remove-background'): void
  (e: 'adjust-image'): void
  (e: 'delete'): void
}>()

const TEXT_COLORS = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#ffffff']

function bump(delta: number) {
  const size = Math.max(8, (props.selection.fontSize ?? 24) + delta)
  emit('text-prop', 'fontSize', size)
}

function bumpLineHeight(delta: number) {
  const lh = Math.round(Math.max(0.8, (props.selection.lineHeight ?? 1.16) + delta) * 100) / 100
  emit('text-prop', 'lineHeight', lh)
}

function bumpCharSpacing(delta: number) {
  const cs = Math.max(-100, (props.selection.charSpacing ?? 0) + delta)
  emit('text-prop', 'charSpacing', cs)
}
</script>

<template>
  <div class="flex max-w-[640px] flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-md">
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
      <button
        class="rounded px-2 py-1 text-xs italic transition"
        :class="selection.fontStyle === 'italic' ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        @click="emit('text-prop', 'fontStyle', selection.fontStyle === 'italic' ? 'normal' : 'italic')"
      >
        I
      </button>
      <button
        class="rounded px-2 py-1 text-xs underline transition"
        :class="selection.underline ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        @click="emit('text-prop', 'underline', !selection.underline)"
      >
        U
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
        v-for="align in ['left', 'center', 'right', 'justify']"
        :key="align"
        class="rounded px-1.5 py-1 text-xs transition"
        :class="selection.textAlign === align ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
        @click="emit('text-prop', 'textAlign', align)"
      >
        {{ align === 'left' ? '左' : align === 'center' ? '中' : align === 'right' ? '右' : '两端' }}
      </button>

      <div class="h-4 w-px bg-gray-200" />

      <div class="flex items-center gap-1" title="行高">
        <span class="text-[11px] text-gray-400">行高</span>
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpLineHeight(-0.1)">
          <el-icon :size="12"><Minus /></el-icon>
        </button>
        <span class="w-8 text-center text-xs text-gray-600">{{ selection.lineHeight?.toFixed(2) }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpLineHeight(0.1)">
          <el-icon :size="12"><Plus /></el-icon>
        </button>
      </div>

      <div class="flex items-center gap-1" title="字间距">
        <span class="text-[11px] text-gray-400">字距</span>
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpCharSpacing(-20)">
          <el-icon :size="12"><Minus /></el-icon>
        </button>
        <span class="w-8 text-center text-xs text-gray-600">{{ selection.charSpacing }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpCharSpacing(20)">
          <el-icon :size="12"><Plus /></el-icon>
        </button>
      </div>

      <div class="h-4 w-px bg-gray-200" />

      <button
        class="rounded px-2 py-1 text-xs transition"
        :class="selection.hasStroke ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        @click="emit('text-stroke', !selection.hasStroke)"
      >
        描边
      </button>
      <button
        class="rounded px-2 py-1 text-xs transition"
        :class="selection.hasShadow ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        @click="emit('text-shadow', !selection.hasShadow)"
      >
        阴影
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

      <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('adjust-image')">
        <el-icon :size="14"><Brush /></el-icon>
        调色
      </button>
    </template>

    <div class="h-4 w-px bg-gray-200" />

    <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50" @click="emit('delete')">
      <el-icon :size="14"><Delete /></el-icon>
      删除
    </button>
  </div>
</template>
