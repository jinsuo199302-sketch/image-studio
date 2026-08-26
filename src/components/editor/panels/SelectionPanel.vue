<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Close,
  ArrowDown,
  Delete,
  Picture,
  Plus,
  Minus,
  MagicStick,
  Brush,
  CopyDocument,
  Top,
  Bottom,
  Lock,
  Unlock,
  EditPen,
} from '@element-plus/icons-vue'
import type { SelectionInfo, WarpKind } from '../CanvasStage.vue'
import { FONT_OPTIONS } from '../../../data/fonts'

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

type ShadowDetail = { color: string; blur: number; offsetX: number; offsetY: number }
type EffectPreset = 'none' | 'outline' | 'emboss' | 'neon'

const props = defineProps<{ selection: SelectionInfo; removingBackground?: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'text-prop', prop: TextProp, value: string | number | boolean): void
  (e: 'text-shadow', enabled: boolean): void
  (e: 'text-shadow-detail', detail: ShadowDetail): void
  (e: 'text-stroke', enabled: boolean): void
  (e: 'text-stroke-width', width: number): void
  (e: 'text-stroke-color', color: string): void
  (e: 'text-gradient', colors: [string, string]): void
  (e: 'text-background', enabled: boolean): void
  (e: 'text-background-color', color: string): void
  (e: 'text-effect-preset', preset: EffectPreset): void
  (e: 'text-warp', kind: WarpKind, intensity: number): void
  (e: 'rect-fill', color: string): void
  (e: 'table-theme', theme: string): void
  (e: 'table-font', fontFamily: string): void
  (e: 'table-font-size', size: number): void
  (e: 'table-bold', enabled: boolean): void
  (e: 'table-italic', enabled: boolean): void
  (e: 'table-underline', enabled: boolean): void
  (e: 'table-align', align: 'left' | 'center' | 'right'): void
  (e: 'table-rows', count: number): void
  (e: 'table-cols', count: number): void
  (e: 'table-transpose'): void
  (e: 'table-clear-all'): void
  (e: 'table-merge', range: { r1: number; c1: number; r2: number; c2: number }): void
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
  (e: 'text-replace'): void
  (e: 'adjust-image'): void
  (e: 'delete'): void
}>()

const TEXT_COLORS = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#ffffff']
const BG_COLORS = ['#fde047', '#fca5a5', '#93c5fd', '#86efac', '#e9d5ff', '#1f2937']

/** 跟 CanvasStage.vue 里 TABLE_THEMES 的 key/表头色一一对应，仅用于展示色块 */
const TABLE_THEME_SWATCHES = [
  { key: 'violet', color: '#8b5cf6' },
  { key: 'gray', color: '#4b5563' },
  { key: 'pink', color: '#ec4899' },
  { key: 'orange', color: '#f97316' },
  { key: 'blue', color: '#2563eb' },
]

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

const EFFECT_PRESETS: { key: EffectPreset; label: string }[] = [
  { key: 'none', label: '无' },
  { key: 'outline', label: '描边强调' },
  { key: 'emboss', label: '阴影浮雕' },
  { key: 'neon', label: '霓虹发光' },
]

const WARP_KINDS: { key: WarpKind; label: string }[] = [
  { key: 'none', label: '无' },
  { key: 'arc-up', label: '拱形' },
  { key: 'arc-down', label: '下弧' },
  { key: 'fan', label: '扇形' },
  { key: 'wave', label: '波浪' },
  { key: 'flag', label: '旗帜' },
  { key: 'ring', label: '圆环' },
  { key: 'skew', label: '斜切' },
]

const title = computed(() =>
  props.selection.type === 'text' ? '文字编辑' : props.selection.type === 'image' ? '图片编辑' : '图形编辑',
)

const effectsOpen = ref(false)
const warpOpen = ref(false)
const shadowOpen = ref(false)
const bgOpen = ref(false)
const warpIntensity = ref(30)
const customGradientStart = ref('#f87171')
const customGradientEnd = ref('#fbbf24')

/** 合并单元格用：这个应用没有"框选一片单元格"的交互，用行列起止号（1-indexed，跟用户直觉一致）代替拖拽框选 */
const mergeR1 = ref(1)
const mergeC1 = ref(1)
const mergeR2 = ref(1)
const mergeC2 = ref(1)
function submitMerge() {
  emit('table-merge', { r1: mergeR1.value - 1, c1: mergeC1.value - 1, r2: mergeR2.value - 1, c2: mergeC2.value - 1 })
}

function applyCustomGradient() {
  emit('text-gradient', [customGradientStart.value, customGradientEnd.value])
}

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

function emitShadowDetail(partial: Partial<ShadowDetail>) {
  emit('text-shadow-detail', {
    color: props.selection.shadowColor ?? 'rgba(0,0,0,0.35)',
    blur: props.selection.shadowBlur ?? 6,
    offsetX: props.selection.shadowOffsetX ?? 2,
    offsetY: props.selection.shadowOffsetY ?? 2,
    ...partial,
  })
}

function pickWarp(kind: WarpKind) {
  emit('text-warp', kind, warpIntensity.value)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
      <p class="text-sm font-medium text-gray-700">{{ title }}</p>
      <button
        class="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        title="关闭"
        @click="emit('close')"
      >
        <el-icon :size="14"><Close /></el-icon>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      <template v-if="selection.type === 'text'">
        <div
          v-if="selection.source"
          class="mb-3 flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xs"
          :class="selection.source.confidence === 'verified' ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'"
        >
          <span class="mt-px shrink-0">{{ selection.source.confidence === 'verified' ? '✓' : '⚠' }}</span>
          <div class="min-w-0">
            <p class="font-medium">
              来源{{ selection.source.confidence === 'verified' ? '已核实' : '未核实，建议人工核对' }}
            </p>
            <a
              :href="selection.source.url"
              target="_blank"
              rel="noopener noreferrer"
              class="block truncate underline decoration-dotted underline-offset-2 hover:opacity-80"
              :title="selection.source.url"
            >
              {{ selection.source.siteName || selection.source.url }}
            </a>
          </div>
        </div>

        <p class="mb-2 text-xs font-medium text-gray-600">字体</p>
        <el-select
          :model-value="selection.fontFamily"
          size="small"
          class="!w-full"
          @update:model-value="(v: string) => emit('text-prop', 'fontFamily', v)"
        >
          <el-option v-for="f in FONT_OPTIONS" :key="f.value" :label="f.label" :value="f.value" :style="{ fontFamily: f.value }" />
        </el-select>

        <div class="mt-3 flex items-center justify-between">
          <div class="flex items-center gap-1">
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bump(-2)">
              <el-icon :size="12"><Minus /></el-icon>
            </button>
            <span class="w-7 text-center text-xs text-gray-600">{{ selection.fontSize }}</span>
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bump(2)">
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="flex h-7 w-7 items-center justify-center rounded text-xs font-bold transition"
              :class="selection.fontWeight === 'bold' ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
              @click="emit('text-prop', 'fontWeight', selection.fontWeight === 'bold' ? 'normal' : 'bold')"
            >
              B
            </button>
            <button
              class="flex h-7 w-7 items-center justify-center rounded text-xs italic transition"
              :class="selection.fontStyle === 'italic' ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
              @click="emit('text-prop', 'fontStyle', selection.fontStyle === 'italic' ? 'normal' : 'italic')"
            >
              I
            </button>
            <button
              class="flex h-7 w-7 items-center justify-center rounded text-xs underline transition"
              :class="selection.underline ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
              @click="emit('text-prop', 'underline', !selection.underline)"
            >
              U
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-center gap-1">
          <button
            v-for="align in ['left', 'center', 'right', 'justify']"
            :key="align"
            class="flex-1 rounded px-1.5 py-1 text-xs transition"
            :class="selection.textAlign === align ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
            @click="emit('text-prop', 'textAlign', align)"
          >
            {{ align === 'left' ? '左' : align === 'center' ? '中' : align === 'right' ? '右' : '两端' }}
          </button>
          <button
            class="flex-1 rounded px-1.5 py-1 text-xs transition"
            :class="selection.vertical ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
            title="竖排文字"
            @click="emit('toggle-vertical')"
          >
            竖排
          </button>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-xs font-medium text-gray-600">颜色</p>
          <div class="flex items-center gap-1.5">
            <button
              v-for="c in TEXT_COLORS"
              :key="c"
              class="h-5 w-5 rounded-full border border-gray-200"
              :style="{ background: c }"
              @click="emit('text-prop', 'fill', c)"
            />
            <el-color-picker
              :model-value="typeof selection.fill === 'string' ? selection.fill : undefined"
              size="small"
              @change="(c: string) => emit('text-prop', 'fill', c)"
            />
          </div>
        </div>

        <div class="mt-3">
          <p class="mb-1.5 text-xs font-medium text-gray-600">渐变色</p>
          <div class="flex items-center gap-1.5">
            <button
              v-for="(g, i) in GRADIENT_PRESETS"
              :key="i"
              class="h-5 w-5 rounded-full border border-gray-200"
              :style="{ background: `linear-gradient(90deg, ${g[0]}, ${g[1]})` }"
              @click="emit('text-gradient', g)"
            />
            <span class="text-[11px] text-gray-400">自定义</span>
            <el-color-picker v-model="customGradientStart" size="small" @change="applyCustomGradient" />
            <span class="text-[11px] text-gray-400">→</span>
            <el-color-picker v-model="customGradientEnd" size="small" @change="applyCustomGradient" />
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2">
          <div class="flex items-center gap-1" title="行高">
            <span class="text-[11px] text-gray-400">行高</span>
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpLineHeight(-0.1)">
              <el-icon :size="12"><Minus /></el-icon>
            </button>
            <span class="w-7 text-center text-xs text-gray-600">{{ selection.lineHeight?.toFixed(2) }}</span>
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpLineHeight(0.1)">
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </div>
          <div class="flex items-center gap-1" title="字间距">
            <span class="text-[11px] text-gray-400">字距</span>
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpCharSpacing(-20)">
              <el-icon :size="12"><Minus /></el-icon>
            </button>
            <span class="w-7 text-center text-xs text-gray-600">{{ selection.charSpacing }}</span>
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpCharSpacing(20)">
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-center gap-1" title="列表">
          <button class="flex-1 rounded px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('list-format', 'bullet')">
            • 列表
          </button>
          <button class="flex-1 rounded px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100" @click="emit('list-format', 'number')">
            1. 列表
          </button>
          <button class="flex-1 rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-gray-100" title="清除列表格式" @click="emit('list-format', 'none')">
            清除
          </button>
        </div>

        <div class="mt-3 flex items-center gap-2">
          <button
            class="flex-1 rounded px-2 py-1.5 text-xs transition"
            :class="selection.hasStroke ? 'bg-violet-50 text-violet-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'"
            @click="emit('text-stroke', !selection.hasStroke)"
          >
            描边
          </button>
          <button
            class="flex-1 rounded px-2 py-1.5 text-xs transition"
            :class="selection.hasTextBackground ? 'bg-violet-50 text-violet-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'"
            @click="emit('text-background', !selection.hasTextBackground)"
          >
            划重点
          </button>
        </div>
        <div v-if="selection.hasStroke" class="mt-2 flex items-center gap-2">
          <div class="flex items-center gap-1" title="描边粗细">
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpStrokeWidth(-0.5)">
              <el-icon :size="12"><Minus /></el-icon>
            </button>
            <span class="w-6 text-center text-xs text-gray-600">{{ selection.strokeWidth }}</span>
            <button class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100" @click="bumpStrokeWidth(0.5)">
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </div>
          <div class="flex items-center gap-1">
            <button
              v-for="c in TEXT_COLORS"
              :key="c"
              class="h-5 w-5 rounded-full border-2"
              :style="{ background: c }"
              :class="selection.strokeColor === c ? 'border-violet-500' : 'border-gray-200'"
              @click="emit('text-stroke-color', c)"
            />
          </div>
        </div>

        <!-- 特效 -->
        <div class="mt-4 border-t border-gray-100 pt-3">
          <button class="flex w-full items-center justify-between" @click="effectsOpen = !effectsOpen">
            <span class="text-xs font-medium text-gray-600">特效</span>
            <el-icon :size="12" class="text-gray-400 transition-transform" :class="{ 'rotate-180': effectsOpen }"><ArrowDown /></el-icon>
          </button>
          <div v-if="effectsOpen" class="mt-2 grid grid-cols-2 gap-2">
            <button
              v-for="p in EFFECT_PRESETS"
              :key="p.key"
              class="rounded-md border border-gray-200 py-2 text-[11px] text-gray-600 transition hover:border-violet-300 hover:text-violet-600"
              @click="emit('text-effect-preset', p.key)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <!-- 变形 -->
        <div class="mt-4 border-t border-gray-100 pt-3">
          <button class="flex w-full items-center justify-between" @click="warpOpen = !warpOpen">
            <span class="text-xs font-medium text-gray-600">变形</span>
            <el-icon :size="12" class="text-gray-400 transition-transform" :class="{ 'rotate-180': warpOpen }"><ArrowDown /></el-icon>
          </button>
          <div v-if="warpOpen" class="mt-2">
            <div class="grid grid-cols-4 gap-1.5">
              <button
                v-for="w in WARP_KINDS"
                :key="w.key"
                class="rounded-md border py-1.5 text-[11px] transition"
                :class="
                  (selection.warpKind ?? 'none') === w.key
                    ? 'border-violet-500 bg-violet-50 text-violet-600'
                    : 'border-gray-200 text-gray-600 hover:border-violet-300'
                "
                @click="pickWarp(w.key)"
              >
                {{ w.label }}
              </button>
            </div>
            <div v-if="(selection.warpKind ?? 'none') !== 'none'" class="mt-2 flex items-center gap-2" title="弯曲强度">
              <span class="text-[11px] text-gray-400 shrink-0">强度</span>
              <el-slider
                v-model="warpIntensity"
                :min="5"
                :max="80"
                :show-tooltip="false"
                @change="pickWarp(selection.warpKind ?? 'none')"
              />
            </div>
          </div>
        </div>

        <!-- 投影 -->
        <div class="mt-4 border-t border-gray-100 pt-3">
          <button class="flex w-full items-center justify-between" @click="shadowOpen = !shadowOpen">
            <span class="text-xs font-medium text-gray-600">投影</span>
            <el-icon :size="12" class="text-gray-400 transition-transform" :class="{ 'rotate-180': shadowOpen }"><ArrowDown /></el-icon>
          </button>
          <div v-if="shadowOpen" class="mt-2 space-y-2">
            <button
              class="w-full rounded px-2 py-1.5 text-xs transition"
              :class="selection.hasShadow ? 'bg-violet-50 text-violet-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'"
              @click="emit('text-shadow', !selection.hasShadow)"
            >
              {{ selection.hasShadow ? '已开启' : '开启投影' }}
            </button>
            <template v-if="selection.hasShadow">
              <div class="flex items-center justify-between">
                <span class="text-[11px] text-gray-400">颜色</span>
                <el-color-picker
                  :model-value="selection.shadowColor"
                  size="small"
                  show-alpha
                  @change="(c: string) => emitShadowDetail({ color: c })"
                />
              </div>
              <div class="flex items-center justify-between" title="模糊度">
                <span class="text-[11px] text-gray-400">模糊</span>
                <el-slider
                  :model-value="selection.shadowBlur ?? 6"
                  :min="0"
                  :max="40"
                  :show-tooltip="false"
                  style="width: 140px"
                  @change="(v: number) => emitShadowDetail({ blur: v })"
                />
              </div>
              <div class="flex items-center justify-between" title="横向偏移">
                <span class="text-[11px] text-gray-400">横偏移</span>
                <el-slider
                  :model-value="selection.shadowOffsetX ?? 2"
                  :min="-30"
                  :max="30"
                  :show-tooltip="false"
                  style="width: 140px"
                  @change="(v: number) => emitShadowDetail({ offsetX: v })"
                />
              </div>
              <div class="flex items-center justify-between" title="纵向偏移">
                <span class="text-[11px] text-gray-400">纵偏移</span>
                <el-slider
                  :model-value="selection.shadowOffsetY ?? 2"
                  :min="-30"
                  :max="30"
                  :show-tooltip="false"
                  style="width: 140px"
                  @change="(v: number) => emitShadowDetail({ offsetY: v })"
                />
              </div>
            </template>
          </div>
        </div>

        <!-- 背景 -->
        <div class="mt-4 border-t border-gray-100 pt-3">
          <button class="flex w-full items-center justify-between" @click="bgOpen = !bgOpen">
            <span class="text-xs font-medium text-gray-600">背景</span>
            <el-icon :size="12" class="text-gray-400 transition-transform" :class="{ 'rotate-180': bgOpen }"><ArrowDown /></el-icon>
          </button>
          <div v-if="bgOpen" class="mt-2 space-y-2">
            <div class="flex items-center gap-1.5">
              <button
                v-for="c in BG_COLORS"
                :key="c"
                class="h-5 w-5 rounded-full border-2"
                :style="{ background: c }"
                :class="selection.textBackgroundColor === c ? 'border-violet-500' : 'border-gray-200'"
                @click="emit('text-background-color', c)"
              />
              <el-color-picker
                :model-value="selection.textBackgroundColor"
                size="small"
                @change="(c: string) => emit('text-background-color', c)"
              />
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="selection.type === 'image'">
        <div class="space-y-1.5">
          <button
            class="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-gray-600 hover:bg-gray-100"
            @click="emit('replace-image')"
          >
            <el-icon :size="14"><Picture /></el-icon>
            替换图片
          </button>
          <button
            class="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            :disabled="removingBackground"
            @click="emit('remove-background')"
          >
            <el-icon :size="14"><MagicStick /></el-icon>
            {{ removingBackground ? '抠图中…' : 'AI 抠图' }}
          </button>
          <button
            class="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-gray-600 hover:bg-gray-100"
            @click="emit('erase-object')"
          >
            <el-icon :size="14"><MagicStick /></el-icon>
            AI 消除/去水印
          </button>
          <button
            class="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-gray-600 hover:bg-gray-100"
            @click="emit('text-replace')"
          >
            <el-icon :size="14"><EditPen /></el-icon>
            文字替换
          </button>
          <button
            class="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-gray-600 hover:bg-gray-100"
            @click="emit('adjust-image')"
          >
            <el-icon :size="14"><Brush /></el-icon>
            调色
          </button>
        </div>
      </template>

      <template v-else-if="selection.type === 'rect'">
        <p class="mb-1.5 text-xs font-medium text-gray-600">填充颜色</p>
        <div class="flex items-center gap-1.5">
          <button
            v-for="c in TEXT_COLORS"
            :key="c"
            class="h-5 w-5 rounded-full border-2"
            :style="{ background: c }"
            :class="selection.fill === c ? 'border-violet-500' : 'border-gray-200'"
            @click="emit('rect-fill', c)"
          />
          <el-color-picker :model-value="selection.fill" size="small" @change="(c: string) => emit('rect-fill', c)" />
        </div>
      </template>

      <template v-if="selection.tableStyle">
        <p class="mb-1.5 text-xs font-medium text-gray-600">样式</p>
        <div class="flex items-center gap-1.5">
          <el-select
            :model-value="selection.tableStyle.fontFamily"
            size="small"
            class="!flex-1"
            @update:model-value="(v: string) => emit('table-font', v)"
          >
            <el-option v-for="f in FONT_OPTIONS" :key="f.value" :label="f.label" :value="f.value" :style="{ fontFamily: f.value }" />
          </el-select>
          <div class="flex items-center gap-0.5 shrink-0">
            <button
              class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              @click="emit('table-font-size', Math.max(8, selection.tableStyle.fontSize - 1))"
            >
              <el-icon :size="12"><Minus /></el-icon>
            </button>
            <span class="w-5 text-center text-xs text-gray-600">{{ selection.tableStyle.fontSize }}</span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              @click="emit('table-font-size', selection.tableStyle.fontSize + 1)"
            >
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </div>
        </div>

        <div class="mt-2 flex items-center gap-1">
          <button
            class="flex-1 rounded px-1.5 py-1 text-xs font-bold transition"
            :class="selection.tableStyle.bold ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
            @click="emit('table-bold', !selection.tableStyle.bold)"
          >
            B
          </button>
          <button
            class="flex-1 rounded px-1.5 py-1 text-xs italic transition"
            :class="selection.tableStyle.italic ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
            @click="emit('table-italic', !selection.tableStyle.italic)"
          >
            I
          </button>
          <button
            class="flex-1 rounded px-1.5 py-1 text-xs underline transition"
            :class="selection.tableStyle.underline ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
            @click="emit('table-underline', !selection.tableStyle.underline)"
          >
            U
          </button>
          <button
            v-for="align in (['left', 'center', 'right'] as const)"
            :key="align"
            class="flex-1 rounded px-1.5 py-1 text-xs transition"
            :class="selection.tableStyle.align === align ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
            @click="emit('table-align', align)"
          >
            {{ align === 'left' ? '左' : align === 'center' ? '中' : '右' }}
          </button>
        </div>

        <p class="mb-1.5 mt-3 text-xs font-medium text-gray-600">表格配色</p>
        <div class="flex items-center gap-1.5">
          <button
            v-for="t in TABLE_THEME_SWATCHES"
            :key="t.key"
            class="h-5 w-5 rounded-full border-2"
            :style="{ background: t.color }"
            :class="selection.tableStyle.theme === t.key ? 'border-violet-500' : 'border-gray-200'"
            @click="emit('table-theme', t.key)"
          />
        </div>

        <p class="mb-1.5 mt-3 text-xs font-medium text-gray-600">行列数</p>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1" title="行数">
            <span class="text-[11px] text-gray-400">行</span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              @click="emit('table-rows', Math.max(1, selection.tableStyle.rows - 1))"
            >
              <el-icon :size="12"><Minus /></el-icon>
            </button>
            <span class="w-6 text-center text-xs text-gray-600">{{ selection.tableStyle.rows }}</span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              @click="emit('table-rows', selection.tableStyle.rows + 1)"
            >
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </div>
          <div class="flex items-center gap-1" title="列数">
            <span class="text-[11px] text-gray-400">列</span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              @click="emit('table-cols', Math.max(1, selection.tableStyle.cols - 1))"
            >
              <el-icon :size="12"><Minus /></el-icon>
            </button>
            <span class="w-6 text-center text-xs text-gray-600">{{ selection.tableStyle.cols }}</span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
              @click="emit('table-cols', selection.tableStyle.cols + 1)"
            >
              <el-icon :size="12"><Plus /></el-icon>
            </button>
          </div>
          <button class="text-[11px] text-violet-600 hover:underline" title="把行和列互换" @click="emit('table-transpose')">
            行列转换
          </button>
        </div>

        <p class="mb-1.5 mt-3 text-xs font-medium text-gray-600">合并单元格</p>
        <p class="mb-1.5 text-[11px] text-gray-400">按行号/列号（从1开始）指定要合并的范围</p>
        <div class="grid grid-cols-4 gap-1.5">
          <el-input-number v-model="mergeR1" :min="1" :max="selection.tableStyle.rows" size="small" controls-position="right" />
          <el-input-number v-model="mergeC1" :min="1" :max="selection.tableStyle.cols" size="small" controls-position="right" />
          <el-input-number v-model="mergeR2" :min="1" :max="selection.tableStyle.rows" size="small" controls-position="right" />
          <el-input-number v-model="mergeC2" :min="1" :max="selection.tableStyle.cols" size="small" controls-position="right" />
        </div>
        <p class="mb-1.5 mt-1 text-[11px] text-gray-400">起始行 / 起始列 / 结束行 / 结束列</p>
        <el-button size="small" class="!w-full" @click="submitMerge">合并单元格</el-button>

        <el-button size="small" class="!mt-2 !ml-0 !w-full" @click="emit('table-clear-all')">清空全部数据</el-button>
      </template>

      <div class="mt-5 border-t border-gray-100 pt-4">
        <p class="mb-2 text-xs font-medium text-gray-600">图层编辑</p>
        <div class="flex items-center justify-between" title="透明度">
          <span class="text-[11px] text-gray-400">透明度</span>
          <el-slider
            :model-value="selection.opacity ?? 1"
            :min="0"
            :max="1"
            :step="0.01"
            :show-tooltip="false"
            style="width: 140px"
            @input="(v: number) => emit('opacity', v)"
            @change="emit('opacity-commit')"
          />
        </div>

        <el-select
          class="mt-2 !w-full"
          size="small"
          :model-value="selection.blendMode ?? 'source-over'"
          title="混合模式"
          @update:model-value="(v: string) => emit('blend-mode', v)"
        >
          <el-option v-for="m in BLEND_MODES" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>

        <div class="mt-3 flex items-center gap-1">
          <button class="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100" title="上移一层" @click="emit('bring-forward')">
            <el-icon :size="13"><Top /></el-icon>
          </button>
          <button class="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100" title="下移一层" @click="emit('send-backward')">
            <el-icon :size="13"><Bottom /></el-icon>
          </button>
          <button class="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100" title="复制" @click="emit('duplicate')">
            <el-icon :size="14"><CopyDocument /></el-icon>
          </button>
          <button
            class="flex h-7 w-7 items-center justify-center rounded transition"
            :class="selection.locked ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-100'"
            :title="selection.locked ? '解锁' : '锁定'"
            @click="emit('toggle-lock')"
          >
            <el-icon :size="14"><component :is="selection.locked ? Lock : Unlock" /></el-icon>
          </button>
          <button
            class="ml-auto flex h-7 w-7 items-center justify-center rounded text-red-500 hover:bg-red-50"
            title="删除"
            @click="emit('delete')"
          >
            <el-icon :size="14"><Delete /></el-icon>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
