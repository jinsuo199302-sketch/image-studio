<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useApiConfigStore } from '../../../../stores/apiConfig'
import { useWritingStore } from '../../../../stores/writing'

const emit = defineEmits<{ (e: 'insert', text: string): void }>()
const apiConfigStore = useApiConfigStore()
const store = useWritingStore()

const message = ref('')
const threadRef = ref<HTMLDivElement>()

function scrollToBottom() {
  nextTick(() => {
    if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight
  })
}

watch(() => store.sessions.length, scrollToBottom)

async function send() {
  if (!message.value.trim()) {
    store.error = '请先输入想写的内容'
    return
  }
  const text = message.value.trim()
  message.value = ''
  await store.generate(text)
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
        像聊天一样描述你想要的文案，例如"写一条促销标题，语气专业一点"
      </div>

      <template v-for="session in store.sessions" :key="session.id">
        <div class="flex justify-end">
          <div class="max-w-[85%] rounded-lg rounded-tr-sm bg-violet-500 px-2.5 py-1.5 text-xs text-white">
            {{ session.message }}
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

    <div class="flex gap-2 border-t border-gray-100 p-3">
      <el-input
        v-model="message"
        placeholder="发消息，例如：写一条秋季新品连衣裙的标题"
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
</template>
