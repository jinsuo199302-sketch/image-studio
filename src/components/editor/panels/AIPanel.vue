<script setup lang="ts">
import { ref } from 'vue'
import AIImageTab from './ai/AIImageTab.vue'
import AIWriteTab from './ai/AIWriteTab.vue'
import AITranslateTab from './ai/AITranslateTab.vue'
import AIVideoTab from './ai/AIVideoTab.vue'
import AIPdfTab from './ai/AIPdfTab.vue'
import AICutoutTab from './ai/AICutoutTab.vue'
import AIEraseTab from './ai/AIEraseTab.vue'
import AITextReplaceTab from './ai/AITextReplaceTab.vue'
import AIOcrTab from './ai/AIOcrTab.vue'
import AIIdPhotoTab from './ai/AIIdPhotoTab.vue'
import AIScreenshotStitchTab from './ai/AIScreenshotStitchTab.vue'
import AIAvatarFrameTab from './ai/AIAvatarFrameTab.vue'

type TabKey =
  | 'image'
  | 'write'
  | 'translate'
  | 'video'
  | 'pdf'
  | 'cutout'
  | 'erase'
  | 'textreplace'
  | 'ocr'
  | 'idphoto'
  | 'stitch'
  | 'avatarframe'

const props = defineProps<{ selectedText: string | null; initialTab?: TabKey }>()
const emit = defineEmits<{
  (e: 'insert-image', url: string): void
  (e: 'insert-text', text: string): void
  (e: 'replace-selected-text', text: string): void
}>()

const activeTab = ref<TabKey>(props.initialTab ?? 'image')
function pickTab(key: string) {
  activeTab.value = key as TabKey
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex overflow-x-auto border-b border-gray-100 px-2 pt-2">
      <button
        v-for="tab in [
          { key: 'image', label: '生图' },
          { key: 'write', label: '文案' },
          { key: 'translate', label: '翻译' },
          { key: 'video', label: '视频' },
          { key: 'pdf', label: 'PDF' },
          { key: 'cutout', label: '抠图' },
          { key: 'erase', label: '消除' },
          { key: 'textreplace', label: '改字' },
          { key: 'ocr', label: '提字' },
          { key: 'idphoto', label: '证件照' },
          { key: 'stitch', label: '长截图' },
          { key: 'avatarframe', label: '头像框' },
        ]"
        :key="tab.key"
        class="flex-1 shrink-0 rounded-t-md px-1 py-2 text-xs transition"
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
      <AIVideoTab v-else-if="activeTab === 'video'" />
      <AIPdfTab v-else-if="activeTab === 'pdf'" />
      <AICutoutTab v-else-if="activeTab === 'cutout'" />
      <AIEraseTab v-else-if="activeTab === 'erase'" />
      <AITextReplaceTab v-else-if="activeTab === 'textreplace'" />
      <AIOcrTab v-else-if="activeTab === 'ocr'" />
      <AIIdPhotoTab v-else-if="activeTab === 'idphoto'" />
      <AIScreenshotStitchTab v-else-if="activeTab === 'stitch'" />
      <AIAvatarFrameTab v-else />
    </div>
  </div>
</template>
