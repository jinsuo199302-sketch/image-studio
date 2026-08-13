<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../../stores/auth'
import { useDesignStore } from '../../../stores/design'
import type { GeneratedDesign } from '../../../services/designApi'

const props = defineProps<{ canvasWidth: number; canvasHeight: number }>()
const emit = defineEmits<{ (e: 'apply-design', design: GeneratedDesign): void }>()

const authStore = useAuthStore()
const store = useDesignStore()
const prompt = ref('')

const EXAMPLES = ['儿童绘画班招生海报', '奶茶店周年庆促销海报', '公司年会邀请函', '读书分享会活动预告']

async function generate() {
  await store.generate(prompt.value, props.canvasWidth, props.canvasHeight)
}

function useExample(example: string) {
  prompt.value = example
}

function apply() {
  if (store.lastResult) emit('apply-design', store.lastResult)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="space-y-3 p-3">
      <el-alert
        :title="authStore.isAuthenticated ? '已登录，使用真实设计生成接口' : '演示模式：生成示例版式，登录后自动切换'"
        :type="authStore.isAuthenticated ? 'success' : 'info'"
        :closable="false"
        show-icon
      />

      <p class="text-xs font-medium text-gray-600">描述你想要的设计</p>
      <el-input
        v-model="prompt"
        type="textarea"
        :rows="4"
        placeholder="例如：儿童绘画班招生海报，风格活泼可爱"
        @keyup.enter.ctrl="generate"
      />

      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="example in EXAMPLES"
          :key="example"
          class="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 transition hover:border-violet-300 hover:text-violet-600"
          @click="useExample(example)"
        >
          {{ example }}
        </button>
      </div>

      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="store.isGenerating"
        @click="generate"
      >
        生成设计
      </el-button>

      <p v-if="store.error" class="text-xs text-red-500">{{ store.error }}</p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto border-t border-gray-100 p-3">
      <div v-if="store.isGenerating" class="space-y-2">
        <div v-for="n in 4" :key="n" class="h-6 animate-pulse rounded bg-gray-100" />
      </div>

      <div v-else-if="store.lastResult" class="space-y-3">
        <p class="text-xs font-medium text-gray-600">
          已生成 {{ store.lastResult.elements.length }} 个元素，应用后会替换当前画布内容
        </p>
        <div class="flex gap-2">
          <el-button class="!flex-1" :loading="store.isGenerating" @click="generate">重新生成</el-button>
          <el-button
            type="primary"
            class="!flex-1 !bg-violet-500 !border-none"
            @click="apply"
          >
            应用到画布
          </el-button>
        </div>
      </div>

      <div v-else class="flex h-full items-center justify-center text-center text-xs text-gray-400">
        输入一句描述，AI 会自动安排图片、字体和版式
      </div>
    </div>
  </div>
</template>
