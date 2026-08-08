<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getSnippet } from '../services/snippetApi'

const route = useRoute()
const content = ref('')
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const snippet = await getSnippet(route.params.id as string)
    content.value = snippet.content
  } catch {
    error.value = '内容不存在或已被删除'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="flex min-h-screen items-start justify-center bg-gray-50 p-6">
    <div class="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div v-if="loading" class="text-sm text-gray-400">加载中…</div>
      <div v-else-if="error" class="text-sm text-red-500">{{ error }}</div>
      <p v-else class="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{{ content }}</p>
    </div>
  </div>
</template>
