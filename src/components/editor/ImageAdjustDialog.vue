<script setup lang="ts">
import { reactive, watch } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (
    e: 'change',
    value: { brightness: number; contrast: number; saturation: number; preset: 'none' | 'grayscale' | 'sepia' },
  ): void
  (e: 'commit'): void
}>()

const PRESETS: { label: string; value: 'none' | 'grayscale' | 'sepia' }[] = [
  { label: '原图', value: 'none' },
  { label: '黑白', value: 'grayscale' },
  { label: '复古', value: 'sepia' },
]

const form = reactive<{ brightness: number; contrast: number; saturation: number; preset: 'none' | 'grayscale' | 'sepia' }>({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  preset: 'none',
})

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.brightness = 0
      form.contrast = 0
      form.saturation = 0
      form.preset = 'none'
    }
  },
)

/** 用 deep watch 而不是每个滑块单独挂 @input：拖动和点击跳转两种交互都会触发 v-model 更新，watch 能统一捕获，@input 在点击跳转时不一定触发 */
watch(form, () => emit('change', { ...form }), { deep: true })

function reset() {
  form.brightness = 0
  form.contrast = 0
  form.saturation = 0
  form.preset = 'none'
}

function close() {
  emit('commit')
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="调色"
    width="360px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="space-y-4">
      <div class="flex gap-2">
        <button
          v-for="p in PRESETS"
          :key="p.value"
          class="flex-1 rounded-lg border py-1.5 text-xs transition"
          :class="
            form.preset === p.value
              ? 'border-violet-500 bg-violet-50 text-violet-600'
              : 'border-gray-200 text-gray-600 hover:border-violet-300'
          "
          @click="form.preset = p.value"
        >
          {{ p.label }}
        </button>
      </div>

      <div>
        <div class="mb-1 flex justify-between text-xs text-gray-600">
          <span>亮度</span>
          <span>{{ form.brightness.toFixed(2) }}</span>
        </div>
        <el-slider v-model="form.brightness" :min="-1" :max="1" :step="0.01" />
      </div>
      <div>
        <div class="mb-1 flex justify-between text-xs text-gray-600">
          <span>对比度</span>
          <span>{{ form.contrast.toFixed(2) }}</span>
        </div>
        <el-slider v-model="form.contrast" :min="-1" :max="1" :step="0.01" />
      </div>
      <div>
        <div class="mb-1 flex justify-between text-xs text-gray-600">
          <span>饱和度</span>
          <span>{{ form.saturation.toFixed(2) }}</span>
        </div>
        <el-slider v-model="form.saturation" :min="-1" :max="1" :step="0.01" />
      </div>
    </div>

    <template #footer>
      <el-button @click="reset">重置</el-button>
      <el-button type="primary" @click="close">完成</el-button>
    </template>
  </el-dialog>
</template>
