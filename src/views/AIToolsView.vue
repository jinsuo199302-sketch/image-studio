<script setup lang="ts">
import { ElMessage } from 'element-plus'
import AppHeader from '../components/AppHeader.vue'
import AIPanel from '../components/editor/panels/AIPanel.vue'

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
          <h1 class="text-sm font-semibold text-gray-800">AI 工具</h1>
          <p class="text-xs text-gray-400">生图 / 写作 / 翻译 / 视频，结果可直接复制或下载</p>
        </div>
        <div class="min-h-0 flex-1">
          <AIPanel
            :selected-text="null"
            @insert-image="downloadImage"
            @insert-text="copyText"
            @replace-selected-text="copyText"
          />
        </div>
      </div>
    </div>
  </div>
</template>
