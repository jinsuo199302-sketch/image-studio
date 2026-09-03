<script setup lang="ts">
import { ref } from 'vue'
import { Notebook } from '@element-plus/icons-vue'
import { useGenerationStore, STYLE_PRESETS } from '../../../../stores/generation'
import { useAuthStore } from '../../../../stores/auth'
import PromptLibraryDialog from '../../PromptLibraryDialog.vue'
import BillingHint from '../../../BillingHint.vue'

const emit = defineEmits<{ (e: 'insert', url: string): void }>()
const store = useGenerationStore()
const authStore = useAuthStore()
const promptLibraryOpen = ref(false)

const ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const

function ratioStyle(ratio: string) {
  const [w, h] = ratio.split(':')
  return { aspectRatio: `${w} / ${h}` }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-4 overflow-y-auto p-3">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，使用真实生成接口' : '演示模式：生成结果为占位图，登录后自动切换'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />

      <div>
        <div class="mb-1 flex items-center justify-between">
          <label class="text-xs font-medium text-gray-600">画面描述</label>
          <button
            class="flex items-center gap-1 text-[11px] text-violet-500 hover:underline"
            @click="promptLibraryOpen = true"
          >
            <el-icon :size="12"><Notebook /></el-icon>
            提示词库
          </button>
        </div>
        <el-input v-model="store.params.prompt" type="textarea" :rows="3" placeholder="描述想生成的图片内容，或从提示词库里选一条" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">风格</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in STYLE_PRESETS"
            :key="s.key"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="
              store.params.style === s.key
                ? 'border-violet-500 bg-violet-50 text-violet-600'
                : 'border-gray-200 text-gray-500'
            "
            @click="store.params.style = s.key"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">画面比例</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="r in ASPECT_RATIOS"
            :key="r"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="
              store.params.aspectRatio === r
                ? 'border-violet-500 bg-violet-50 text-violet-600'
                : 'border-gray-200 text-gray-500'
            "
            @click="store.params.aspectRatio = r"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">数量</label>
        <div class="flex gap-1.5">
          <button
            v-for="n in [1, 2, 4]"
            :key="n"
            class="h-7 w-7 rounded-md border text-xs transition"
            :class="
              store.params.batchSize === n
                ? 'border-violet-500 bg-violet-50 text-violet-600'
                : 'border-gray-200 text-gray-500'
            "
            @click="store.params.batchSize = n as 1 | 2 | 4"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <p v-if="store.error" class="text-xs text-red-500">{{ store.error }}</p>

      <div v-if="store.currentResults.length || store.isGenerating">
        <p class="mb-1.5 text-xs font-medium text-gray-600">点击插入画布</p>
        <div v-if="store.isGenerating" class="grid grid-cols-2 gap-2">
          <div
            v-for="n in store.params.batchSize"
            :key="n"
            class="animate-pulse rounded-md bg-gray-200"
            :style="ratioStyle(store.params.aspectRatio)"
          />
        </div>
        <div v-else class="grid grid-cols-2 gap-2">
          <img
            v-for="img in store.currentResults"
            :key="img.id"
            :src="img.url"
            class="w-full cursor-pointer rounded-md object-cover transition hover:opacity-80"
            :style="ratioStyle(img.aspectRatio)"
            @click="emit('insert', img.url)"
          />
        </div>
      </div>
    </div>

    <div class="space-y-1.5 border-t border-gray-100 p-3">
      <BillingHint feature="AI生图" />
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="store.isGenerating"
        @click="store.generate"
      >
        {{ store.isGenerating ? '生成中…' : '生成图片' }}
      </el-button>
    </div>

    <PromptLibraryDialog v-model="promptLibraryOpen" @use="(text) => (store.params.prompt = text)" />
  </div>
</template>
