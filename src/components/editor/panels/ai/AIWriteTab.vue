<script setup lang="ts">
import { ref } from 'vue'
import { generateCopy, TYPE_LABEL, type CopyType } from '../../../../services/writingApi'
import { useApiConfigStore } from '../../../../stores/apiConfig'

const emit = defineEmits<{ (e: 'insert', text: string) }>()
const apiConfigStore = useApiConfigStore()

const topic = ref('')
const type = ref<CopyType>('headline')
const tone = ref('专业')
const results = ref<string[]>([])
const loading = ref(false)
const error = ref('')

const TONES = ['专业', '活泼', '温馨', '简约']

function pickType(key: string) {
  type.value = key as CopyType
}

async function generate() {
  if (!topic.value.trim()) {
    error.value = '请先输入主题或产品名称'
    return
  }
  error.value = ''
  loading.value = true
  results.value = []
  try {
    results.value = await generateCopy(
      apiConfigStore.isConfigured ? apiConfigStore.config : null,
      { topic: topic.value.trim(), type: type.value, tone: tone.value },
    )
  } catch {
    error.value = '生成失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-4 overflow-y-auto p-3">
      <el-alert
        :title="apiConfigStore.isConfigured ? '已接入写作接口' : '演示模式：文案为模板示例，接口接入后自动切换'"
        :type="apiConfigStore.isConfigured ? 'success' : 'info'"
        :closable="false"
        show-icon
      />

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">主题 / 产品名称</label>
        <el-input v-model="topic" placeholder="例如：秋季新品连衣裙" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">文案类型</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="(label, key) in TYPE_LABEL"
            :key="key"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="type === key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="pickType(key)"
          >
            {{ label }}
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">语气</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in TONES"
            :key="t"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="tone === t ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="tone = t"
          >
            {{ t }}
          </button>
        </div>
      </div>

      <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

      <div v-if="loading" class="space-y-2">
        <div v-for="n in 3" :key="n" class="h-14 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div v-else-if="results.length" class="space-y-2">
        <p class="text-xs font-medium text-gray-600">点击插入画布</p>
        <div
          v-for="(r, i) in results"
          :key="i"
          class="cursor-pointer rounded-lg border border-gray-200 p-2.5 text-xs leading-relaxed text-gray-700 transition hover:border-violet-300 hover:bg-violet-50"
          @click="emit('insert', r)"
        >
          {{ r }}
        </div>
      </div>
    </div>

    <div class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="loading"
        @click="generate"
      >
        {{ loading ? '生成中…' : '生成文案' }}
      </el-button>
    </div>
  </div>
</template>
