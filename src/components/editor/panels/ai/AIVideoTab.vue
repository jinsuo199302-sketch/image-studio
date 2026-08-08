<script setup lang="ts">
import { ref } from 'vue'
import type { VideoParams } from '../../../../services/videoApi'
import { useApiConfigStore } from '../../../../stores/apiConfig'
import { useVideoStore } from '../../../../stores/video'

const apiConfigStore = useApiConfigStore()
const store = useVideoStore()

const prompt = ref('')
const duration = ref<VideoParams['duration']>(5)
const ratio = ref<VideoParams['ratio']>('16:9')
const videoUrl = ref('')

async function generate() {
  videoUrl.value = ''
  const url = await store.generate({ prompt: prompt.value.trim(), duration: duration.value, ratio: ratio.value })
  if (url) videoUrl.value = url
}

function download() {
  if (!videoUrl.value) return
  const a = document.createElement('a')
  a.href = videoUrl.value
  a.download = 'ai-video.mp4'
  a.target = '_blank'
  a.rel = 'noreferrer'
  a.click()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-4 overflow-y-auto p-3">
      <el-alert
        :title="apiConfigStore.isVideoConfigured ? '已接入视频生成接口' : '演示模式：生成结果为示例视频，接口接入后自动切换'"
        :type="apiConfigStore.isVideoConfigured ? 'success' : 'info'"
        :closable="false"
        show-icon
      />

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">视频描述</label>
        <el-input v-model="prompt" type="textarea" :rows="3" placeholder="描述想生成的视频画面，例如：海边日落延时摄影" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">时长</label>
        <div class="flex gap-1.5">
          <button
            v-for="d in [5, 10] as const"
            :key="d"
            class="rounded-full border px-3 py-0.5 text-[11px] transition"
            :class="duration === d ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="duration = d"
          >
            {{ d }} 秒
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">画面比例</label>
        <div class="flex gap-1.5">
          <button
            v-for="r in ['16:9', '9:16', '1:1'] as const"
            :key="r"
            class="rounded-full border px-3 py-0.5 text-[11px] transition"
            :class="ratio === r ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="ratio = r"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <p v-if="store.error" class="text-xs text-red-500">{{ store.error }}</p>

      <div v-if="store.isGenerating" class="flex aspect-video items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
        视频生成中，请稍候…
      </div>
      <div v-else-if="videoUrl" class="space-y-2">
        <video :src="videoUrl" controls class="w-full rounded-lg bg-black" />
        <el-button size="small" class="w-full" @click="download">下载视频</el-button>
      </div>
    </div>

    <div class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="store.isGenerating"
        @click="generate"
      >
        {{ store.isGenerating ? '生成中…' : '生成视频' }}
      </el-button>
    </div>
  </div>
</template>
