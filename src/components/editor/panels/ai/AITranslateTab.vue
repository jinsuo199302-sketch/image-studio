<script setup lang="ts">
import { ref, watch } from 'vue'
import { translateText } from '../../../../services/translateApi'
import { useApiConfigStore } from '../../../../stores/apiConfig'

const props = defineProps<{ selectedText: string | null }>()
const emit = defineEmits<{ (e: 'insert', text: string): void; (e: 'replace-selected', text: string): void }>()
const apiConfigStore = useApiConfigStore()

const LANGS = ['英语', '日语', '韩语', '法语', '德语', '中文']

const sourceText = ref('')
const targetLang = ref('英语')
const result = ref('')
const loading = ref(false)
const error = ref('')

watch(
  () => props.selectedText,
  (t) => {
    if (t) sourceText.value = t
  },
)

function useSelection() {
  if (props.selectedText) sourceText.value = props.selectedText
}

async function translate() {
  if (!sourceText.value.trim()) {
    error.value = '请先输入或选中要翻译的文字'
    return
  }
  error.value = ''
  loading.value = true
  result.value = ''
  try {
    result.value = await translateText(
      apiConfigStore.isTextConfigured ? apiConfigStore.text : null,
      { text: sourceText.value.trim(), targetLang: targetLang.value },
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : '翻译失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-4 overflow-y-auto p-3">
      <el-alert
        :title="apiConfigStore.isTextConfigured ? '已接入翻译接口' : '演示模式：译文为占位标记，接口接入后自动切换'"
        :type="apiConfigStore.isTextConfigured ? 'success' : 'info'"
        :closable="false"
        show-icon
      />

      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-xs font-medium text-gray-600">原文</label>
          <button
            v-if="selectedText"
            class="text-[11px] text-violet-500 hover:underline"
            @click="useSelection"
          >
            读取画布选中文字
          </button>
        </div>
        <el-input v-model="sourceText" type="textarea" :rows="3" placeholder="输入要翻译的文字，或先在画布上选中一段文字" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">目标语言</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="l in LANGS"
            :key="l"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="targetLang === l ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="targetLang = l"
          >
            {{ l }}
          </button>
        </div>
      </div>

      <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

      <div v-if="loading" class="h-16 animate-pulse rounded-lg bg-gray-100" />
      <div v-else-if="result" class="space-y-2">
        <p class="text-xs font-medium text-gray-600">译文</p>
        <div class="rounded-lg border border-gray-200 p-2.5 text-xs leading-relaxed text-gray-700">
          {{ result }}
        </div>
        <div class="flex gap-2">
          <el-button size="small" class="flex-1" @click="emit('insert', result)">插入为新文字</el-button>
          <el-button
            size="small"
            type="primary"
            class="flex-1 !bg-violet-500 !border-none"
            :disabled="!selectedText"
            @click="emit('replace-selected', result)"
          >
            替换选中文字
          </el-button>
        </div>
      </div>
    </div>

    <div class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="loading"
        @click="translate"
      >
        {{ loading ? '翻译中…' : '开始翻译' }}
      </el-button>
    </div>
  </div>
</template>
