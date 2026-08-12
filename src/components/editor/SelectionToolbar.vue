<script setup lang="ts">
import { Delete, Picture, Plus, Minus, MagicStick, Brush, CopyDocument, Top, Bottom, Lock, Unlock } from '@element-plus/icons-vue'
import type { SelectionInfo } from './CanvasStage.vue'

type TextProp =
  | 'fontSize'
  | 'fill'
  | 'fontFamily'
  | 'fontWeight'
  | 'fontStyle'
  | 'underline'
  | 'textAlign'
  | 'lineHeight'
  | 'charSpacing'

const FONT_OPTIONS = [
  { label: '默认', value: 'sans-serif' },
  { label: '思源黑体', value: '"Noto Sans SC", sans-serif' },
  { label: '思源宋体（宋体风格）', value: '"Noto Serif SC", serif' },
  { label: '霞鹜文楷（楷体风格）', value: '"LXGW WenKai", serif' },
  { label: '志莽行书（行楷风格）', value: '"Zhi Mang Xing", cursive' },
  { label: '马善政毛笔字', value: '"Ma Shan Zheng", cursive' },
  { label: '龙藏体', value: '"Long Cang", cursive' },
  { label: '刘建毛草', value: '"Liu Jian Mao Cao", cursive' },
  { label: '站酷快乐体', value: '"ZCOOL KuaiLe", sans-serif' },
  { label: '站酷小薇', value: '"ZCOOL XiaoWei", serif' },
  { label: '站酷庆科黄油体', value: '"ZCOOL QingKe HuangYou", sans-serif' },
  { label: '得意黑', value: '"smiley-sans", sans-serif' },
]

const props = defineProps<{ selection: SelectionInfo; removingBackground?: boolean }>()
const emit = defineEmits<{
  (e: 'text-prop', prop: TextProp, value: string | number | boolean): void
  (e: 'text-shadow', enabled: boolean): void
  (e: 'text-stroke', enabled: boolean): void
  (e: 'text-stroke-width', width: number): void
  (e: 'text-stroke-color', color: string): void
  (e: 'text-gradient', colors: [string, string]): void
  (e: 'text-background', enabled: boolean): void
  (e: 'text-background-color', color: string): void
  (e: 'opacity', value: number): void
  (e: 'opacity-commit'): void
  (e: 'blend-mode', mode: string): void
  (e: 'toggle-lock'): void
  (e: 'toggle-vertical'): void
  (e: 'list-format', kind: 'bullet' | 'number' | 'none'): void
  (e: 'bring-forward'): void
  (e: 'send-backward'): void
  (e: 'duplicate'): void
  (e: 'replace-image'): void
  (e: 'remove-background'): void
  (e: 'erase-object'): void
  (e: 'adjust-image'): void
  (e: 'delete'): void
}>()

const TEXT_COLORS = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#ffffff']

const BLEND_MODES = [
  { label: '正常', value: 'source-over' },
  { label: '正片叠底', value: 'multiply' },
  { label: '滤色', value: 'screen' },
  { label: '叠加', value: 'overlay' },
  { label: '变暗', value: 'darken' },
  { label: '变亮', value: 'lighten' },
  { label: '差值', value: 'difference' },
]

const GRADIENT_PRESETS: [string, string][] = [
  ['#f87171', '#fbbf24'],
  ['#a855f7', '#ec4899'],
  ['#38bdf8', '#22c55e'],
  ['#facc15', '#f97316'],
]

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

function bumpStrokeWidth(delta: number) {
  const w = Math.min(6, Math.max(0.5, (props.selection.strokeWidth ?? 1) + delta))
  emit('text-stroke-width', Math.round(w * 10) / 10)
}
</script>

<template>
  <div class="flex max-w-[640px] flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-md">
    <template v-if="selection.type === 'text'">
      <el-select
        :model-value="selection.fontFamily"
        size="small"
        class="!w-28"
        @update:model-value="(v: string) => emit('text-prop', 'fontFamily', v)"
      >
        <el-option v-for="f in FONT_OPTIONS" :key="f.value" :label="f.label" :value="f.value" :style="{ fontFamily: f.value }" />
      </el-select>

      <div class="h-4 w-px bg-gray-200" />

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

      <div class="flex items-center gap-1" title="渐变色">
        <button
          v-for="(g, i) in GRADIENT_PRESETS"
          :key="i"
          class="h-5 w-5 rounded-full border border-gray-200"
          :style="{ background: `linear-gradient(90deg, ${g[0]}, ${g[1]})` }"
          @click="emit('text-gradient', g)"
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

      <button
        class="rounded px-2 py-1 text-xs transition"
        :class="selection.vertical ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        title="竖排文字"
        @click="emit('toggle-vertical')"
      >
        竖排
      </button>

      <div class="flex items-center gap-1" title="列表">
        <button class="rounded px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('list-format', 'bullet')">
          • 列表
        </button>
        <button class="rounded px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('list-format', 'number')">
          1. 列表
        </button>
        <button class="rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-gray-100" title="清除列表格式" @click="emit('list-format', 'none')">
          清除
        </button>
      </div>

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
      <div v-if="selection.hasStroke" class="flex items-center gap-1" title="描边粗细">
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpStrokeWidth(-0.5)">
          <el-icon :size="12"><Minus /></el-icon>
        </button>
        <span class="w-6 text-center text-xs text-gray-600">{{ selection.strokeWidth }}</span>
        <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpStrokeWidth(0.5)">
          <el-icon :size="12"><Plus /></el-icon>
        </button>
      </div>
      <div v-if="selection.hasStroke" class="flex items-center gap-1" title="描边颜色">
        <button
          v-for="c in TEXT_COLORS"
          :key="c"
          class="h-5 w-5 rounded-full border-2"
          :style="{ background: c }"
          :class="selection.strokeColor === c ? 'border-violet-500' : 'border-gray-200'"
          @click="emit('text-stroke-color', c)"
        />
      </div>
      <button
        class="rounded px-2 py-1 text-xs transition"
        :class="selection.hasShadow ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        @click="emit('text-shadow', !selection.hasShadow)"
      >
        阴影
      </button>

      <button
        class="rounded px-2 py-1 text-xs transition"
        :class="selection.hasTextBackground ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
        @click="emit('text-background', !selection.hasTextBackground)"
      >
        背景色
      </button>
      <div v-if="selection.hasTextBackground" class="flex items-center gap-1" title="背景颜色">
        <button
          v-for="c in ['#fde047', '#fca5a5', '#93c5fd', '#86efac', '#e9d5ff', '#1f2937']"
          :key="c"
          class="h-5 w-5 rounded-full border-2"
          :style="{ background: c }"
          :class="selection.textBackgroundColor === c ? 'border-violet-500' : 'border-gray-200'"
          @click="emit('text-background-color', c)"
        />
      </div>
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

      <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('erase-object')">
        <el-icon :size="14"><MagicStick /></el-icon>
        AI 消除/去水印
      </button>

      <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('adjust-image')">
        <el-icon :size="14"><Brush /></el-icon>
        调色
      </button>
    </template>

    <div class="h-4 w-px bg-gray-200" />

    <div class="flex items-center gap-1" title="透明度">
      <span class="text-[11px] text-gray-400">透明度</span>
      <el-slider
        :model-value="selection.opacity ?? 1"
        :min="0"
        :max="1"
        :step="0.01"
        :show-tooltip="false"
        style="width: 64px"
        @input="(v: number) => emit('opacity', v)"
        @change="emit('opacity-commit')"
      />
    </div>

    <div class="h-4 w-px bg-gray-200" />

    <el-select
      :model-value="selection.blendMode ?? 'source-over'"
      size="small"
      class="!w-20"
      title="混合模式"
      @update:model-value="(v: string) => emit('blend-mode', v)"
    >
      <el-option v-for="m in BLEND_MODES" :key="m.value" :label="m.label" :value="m.value" />
    </el-select>

    <div class="h-4 w-px bg-gray-200" />

    <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" title="上移一层" @click="emit('bring-forward')">
      <el-icon :size="13"><Top /></el-icon>
    </button>
    <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" title="下移一层" @click="emit('send-backward')">
      <el-icon :size="13"><Bottom /></el-icon>
    </button>
    <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" title="复制" @click="emit('duplicate')">
      <el-icon :size="14"><CopyDocument /></el-icon>
      复制
    </button>
    <button
      class="flex items-center gap-1 rounded px-2 py-1 text-xs transition"
      :class="selection.locked ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
      :title="selection.locked ? '解锁' : '锁定'"
      @click="emit('toggle-lock')"
    >
      <el-icon :size="14"><component :is="selection.locked ? Lock : Unlock" /></el-icon>
      {{ selection.locked ? '已锁定' : '锁定' }}
    </button>

    <div class="h-4 w-px bg-gray-200" />

    <button class="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50" @click="emit('delete')">
      <el-icon :size="14"><Delete /></el-icon>
      删除
    </button>
  </div>
</template>
