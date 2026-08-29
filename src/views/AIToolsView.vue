<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppHeader from '../components/AppHeader.vue'
import AIPanel from '../components/editor/panels/AIPanel.vue'

const route = useRoute()
const VALID_TABS = [
  'image',
  'write',
  'translate',
  'video',
  'pdf',
  'pdfconvert',
  'docformat',
  'cutout',
  'erase',
  'textreplace',
  'ocr',
  'idphoto',
  'memorial',
  'colorize',
  'stitch',
  'avatarframe',
  'signature',
  'scan',
  'table',
  'compress',
] as const
const initialTab = computed(() => {
  const tab = route.query.tab
  return VALID_TABS.includes(tab as (typeof VALID_TABS)[number]) ? (tab as (typeof VALID_TABS)[number]) : 'image'
})

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选中文字复制')
  }
}

function downloadImage(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = 'ai-image.png'
  a.target = '_blank'
  a.rel = 'noreferrer'
  a.click()
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-gray-50">
    <AppHeader />

    <div class="flex flex-1 items-center justify-center overflow-hidden p-6">
      <div class="flex h-full w-full max-w-sm flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div class="border-b border-gray-100 px-4 py-3">
          <h1 class="text-sm font-semibold text-gray-800">工具箱</h1>
          <p class="text-xs text-gray-400">生图 / 文案 / 翻译 / 视频 / PDF / 抠图 / 消除 / 改字 / 提字，结果可直接复制或下载</p>
        </div>
        <div class="min-h-0 flex-1">
          <AIPanel
            :selected-text="null"
            :initial-tab="initialTab"
            @insert-image="downloadImage"
            @insert-text="copyText"
            @replace-selected-text="copyText"
          />
        </div>
      </div>
    </div>
  </div>
</template>
