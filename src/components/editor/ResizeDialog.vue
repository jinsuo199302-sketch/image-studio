<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { PAPER_SIZES, paperDims, type Orientation } from '../../data/paperSizes'

const props = defineProps<{ modelValue: boolean; width: number; height: number }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'resize', width: number, height: number): void }>()

const PRESETS = [
  { label: '正方形 1:1', w: 800, h: 800 },
  { label: '海报 3:4', w: 750, h: 1000 },
  { label: '横版 16:9', w: 1280, h: 720 },
  { label: '竖版 9:16', w: 720, h: 1280 },
  { label: '电商主图', w: 800, h: 800 },
  { label: '公众号封面', w: 900, h: 500 },
]

const form = reactive({ width: props.width, height: props.height })
const orientation = ref<Orientation>('portrait')

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.width = props.width
      form.height = props.height
      orientation.value = props.width > props.height ? 'landscape' : 'portrait'
    }
  },
)

function pick(w: number, h: number) {
  form.width = w
  form.height = h
}

function pickPaper(key: string) {
  const p = PAPER_SIZES.find((s) => s.key === key)
  if (!p) return
  const { width, height } = paperDims(p, orientation.value)
  form.width = width
  form.height = height
}

function setOrientation(o: Orientation) {
  if (orientation.value === o) return
  orientation.value = o
  // 已经选了纸张的话跟着转向
  ;[form.width, form.height] = [form.height, form.width]
}

function apply() {
  if (form.width < 50 || form.height < 50) return
  emit('resize', Math.round(form.width), Math.round(form.height))
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="尺寸调整"
    width="460px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="mb-3 text-xs text-gray-500">
      调整画布的宽高，已有元素位置不会自动缩放，可能需要手动重新摆放。
    </p>

    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-gray-600">纸张（打印用）</span>
      <div class="flex items-center gap-1">
        <button
          class="rounded px-2 py-0.5 text-[11px] transition"
          :class="orientation === 'portrait' ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
          @click="setOrientation('portrait')"
        >
          竖版
        </button>
        <button
          class="rounded px-2 py-0.5 text-[11px] transition"
          :class="orientation === 'landscape' ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
          @click="setOrientation('landscape')"
        >
          横版
        </button>
      </div>
    </div>
    <div class="mb-4 grid grid-cols-4 gap-1.5">
      <button
        v-for="p in PAPER_SIZES"
        :key="p.key"
        class="rounded-md border px-2 py-1.5 text-center text-[11px] transition"
        :class="
          (orientation === 'portrait' ? form.width === p.w && form.height === p.h : form.width === p.h && form.height === p.w)
            ? 'border-violet-500 bg-violet-50 text-violet-600'
            : 'border-gray-200 text-gray-600 hover:border-gray-300'
        "
        @click="pickPaper(p.key)"
      >
        {{ p.label }}
      </button>
    </div>

    <p class="mb-2 text-xs font-medium text-gray-600">常用尺寸</p>
    <div class="mb-4 grid grid-cols-3 gap-2">
      <button
        v-for="p in PRESETS"
        :key="p.label"
        class="rounded-lg border px-3 py-2 text-left text-xs transition"
        :class="
          form.width === p.w && form.height === p.h
            ? 'border-violet-500 bg-violet-50 text-violet-600'
            : 'border-gray-200 text-gray-600 hover:border-gray-300'
        "
        @click="pick(p.w, p.h)"
      >
        <div class="font-medium">{{ p.label }}</div>
        <div class="text-[11px] text-gray-400">{{ p.w }} × {{ p.h }}</div>
      </button>
    </div>

    <div class="flex items-center gap-2">
      <el-input-number v-model="form.width" :min="50" :max="4000" size="small" controls-position="right" />
      <span class="text-gray-400">×</span>
      <el-input-number v-model="form.height" :min="50" :max="4000" size="small" controls-position="right" />
      <span class="text-xs text-gray-400">px</span>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="apply">应用</el-button>
    </template>
  </el-dialog>
</template>
