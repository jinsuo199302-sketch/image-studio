<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { PROMPT_LIBRARY } from '../../data/promptLibrary'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'use', text: string): void }>()

const activeCategory = ref(PROMPT_LIBRARY[0].category)

function currentPrompts() {
  return PROMPT_LIBRARY.find((c) => c.category === activeCategory.value)?.prompts ?? []
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选中文字复制')
  }
}

function use(text: string) {
  emit('use', text)
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="提示词库"
    width="720px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="flex h-[420px] gap-4">
      <div class="w-32 shrink-0 space-y-1 overflow-y-auto border-r border-gray-100 pr-2">
        <button
          v-for="c in PROMPT_LIBRARY"
          :key="c.category"
          class="w-full rounded-md px-2 py-1.5 text-left text-xs transition"
          :class="
            activeCategory === c.category
              ? 'bg-violet-50 font-medium text-violet-600'
              : 'text-gray-600 hover:bg-gray-100'
          "
          @click="activeCategory = c.category"
        >
          {{ c.category }}
        </button>
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pr-1">
        <div
          v-for="p in currentPrompts()"
          :key="p.title"
          class="rounded-lg border border-gray-200 p-3"
        >
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-800">{{ p.title }}</span>
            <div class="flex gap-2">
              <el-button size="small" text @click="copy(p.text)">复制</el-button>
              <el-button size="small" type="primary" class="!bg-violet-500 !border-none" @click="use(p.text)">
                使用
              </el-button>
            </div>
          </div>
          <p class="text-xs leading-relaxed text-gray-500">{{ p.text }}</p>
        </div>
      </div>
    </div>
  </el-dialog>
</template>
