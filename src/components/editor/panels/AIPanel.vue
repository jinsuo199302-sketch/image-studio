<script setup lang="ts">
import { ref } from 'vue'
import AIImageTab from './ai/AIImageTab.vue'
import AIWriteTab from './ai/AIWriteTab.vue'
import AITranslateTab from './ai/AITranslateTab.vue'
import AIVideoTab from './ai/AIVideoTab.vue'

defineProps<{ selectedText: string | null }>()
const emit = defineEmits<{
  (e: 'insert-image', url: string): void
  (e: 'insert-text', text: string): void
  (e: 'replace-selected-text', text: string): void
}>()

type TabKey = 'image' | 'write' | 'translate' | 'video'
const activeTab = ref<TabKey>('image')
function pickTab(key: string) {
  activeTab.value = key as TabKey
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex border-b border-gray-100 px-2 pt-2">
      <button
        v-for="tab in [
          { key: 'image', label: '生图' },
          { key: 'write', label: '写作' },
          { key: 'translate', label: '翻译' },
          { key: 'video', label: '视频' },
        ]"
        :key="tab.key"
        class="flex-1 rounded-t-md px-1 py-2 text-xs transition"
        :class="
          activeTab === tab.key
            ? 'border-b-2 border-violet-500 font-medium text-violet-600'
            : 'text-gray-500 hover:text-gray-700'
        "
        @click="pickTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1">
      <AIImageTab v-if="activeTab === 'image'" @insert="(url) => emit('insert-image', url)" />
      <AIWriteTab v-else-if="activeTab === 'write'" @insert="(text) => emit('insert-text', text)" />
      <AITranslateTab
        v-else-if="activeTab === 'translate'"
        :selected-text="selectedText"
        @insert="(text) => emit('insert-text', text)"
        @replace-selected="(text) => emit('replace-selected-text', text)"
      />
      <AIVideoTab v-else />
    </div>
  </div>
</template>
