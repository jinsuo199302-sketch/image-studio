<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { TYPE_LABEL, type CopyType } from '../../../../services/writingApi'
import { useApiConfigStore } from '../../../../stores/apiConfig'
import { useWritingStore } from '../../../../stores/writing'

const emit = defineEmits<{ (e: 'insert', text: string): void }>()
const apiConfigStore = useApiConfigStore()
const store = useWritingStore()

const topic = ref('')
const type = ref<CopyType>('headline')
const tone = ref('专业')

const TONES = ['专业', '活泼', '温馨', '简约']

const threadRef = ref<HTMLDivElement>()

function scrollToBottom() {
  nextTick(() => {
    if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight
  })
}

watch(() => store.sessions.length, scrollToBottom)

function pickType(key: string) {
  type.value = key as CopyType
}

async function send() {
  if (!topic.value.trim()) {
    store.error = '请先输入主题或产品名称'
    return
  }
  const t = topic.value.trim()
  topic.value = ''
  await store.generate({ topic: t, type: type.value, tone: tone.value })
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        :title="apiConfigStore.isTextConfigured ? '已接入写作接口' : '演示模式：文案为模板示例，接口接入后自动切换'"
        :type="apiConfigStore.isTextConfigured ? 'success' : 'info'"
        :closable="false"
        show-icon
      />
    </div>

    <div ref="threadRef" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div v-if="!store.sessions.length && !store.isGenerating" class="flex h-full items-center justify-center text-center text-xs text-gray-400">
        像聊天一样：填好主题和类型，发送后 AI 的回复会显示在这里，历史会一直保留
      </div>

      <template v-for="session in store.sessions" :key="session.id">
        <div class="flex justify-end">
          <div class="max-w-[85%] rounded-lg rounded-tr-sm bg-violet-500 px-2.5 py-1.5 text-xs text-white">
            写{{ TYPE_LABEL[session.type as CopyType] ?? session.type }}，主题：{{ session.topic }}，语气：{{ session.tone }}
          </div>
        </div>
        <div class="flex justify-start">
          <div class="max-w-[85%] space-y-1.5">
            <div
              v-for="(r, i) in session.results"
              :key="i"
              class="cursor-pointer rounded-lg rounded-tl-sm border border-gray-200 bg-gray-50 p-2 text-xs leading-relaxed text-gray-700 transition hover:border-violet-300 hover:bg-violet-50"
              @click="emit('insert', r)"
            >
              {{ r }}
            </div>
          </div>
        </div>
      </template>

      <div v-if="store.isGenerating" class="flex justify-start">
        <div class="max-w-[85%] space-y-1.5">
          <div v-for="n in 3" :key="n" class="h-8 w-40 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>

    <p v-if="store.error" class="px-3 text-xs text-red-500">{{ store.error }}</p>

    <div class="space-y-2 border-t border-gray-100 p-3">
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
        <span class="mx-0.5 w-px bg-gray-100" />
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

      <div class="flex gap-2">
        <el-input
          v-model="topic"
          placeholder="输入主题 / 产品名称，例如：秋季新品连衣裙"
          @keyup.enter="send"
        />
        <el-button
          type="primary"
          class="!shrink-0 !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          :loading="store.isGenerating"
          @click="send"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>
