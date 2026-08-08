<script setup lang="ts">
import { reactive, watch } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'change', value: { brightness: number; contrast: number; saturation: number }): void
  (e: 'commit'): void
}>()

const form = reactive({ brightness: 0, contrast: 0, saturation: 0 })

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.brightness = 0
      form.contrast = 0
      form.saturation = 0
    }
  },
)

/** 用 deep watch 而不是每个滑块单独挂 @input：拖动和点击跳转两种交互都会触发 v-model 更新，watch 能统一捕获，@input 在点击跳转时不一定触发 */
watch(form, () => emit('change', { ...form }), { deep: true })

function reset() {
  form.brightness = 0
  form.contrast = 0
  form.saturation = 0
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
