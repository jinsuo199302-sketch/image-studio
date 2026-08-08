<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import ApiConfigDialog from './ApiConfigDialog.vue'

const router = useRouter()
const settingsOpen = ref(false)
</script>

<template>
  <header class="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5">
    <div class="flex cursor-pointer items-center gap-1.5" @click="router.push('/')">
      <div
        class="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white"
      >
        画
      </div>
      <span class="text-base font-semibold text-gray-800">万能画图</span>
    </div>

    <nav class="hidden items-center gap-6 text-sm text-gray-600 md:flex">
      <span class="cursor-pointer hover:text-violet-600">使用教程</span>
      <span class="cursor-pointer hover:text-violet-600">模板中心</span>
      <span class="cursor-pointer hover:text-violet-600" @click="router.push({ name: 'ai-tools' })">AI 工具</span>
    </nav>

    <div class="flex items-center gap-3">
      <el-button size="small" round class="!border-amber-300 !bg-amber-50 !text-amber-600">
        开通会员
      </el-button>
      <el-avatar :size="30" class="!bg-violet-500">用</el-avatar>
      <el-button :icon="Setting" circle size="small" title="生成接口设置" @click="settingsOpen = true" />
    </div>

    <ApiConfigDialog v-model="settingsOpen" />
  </header>
</template>
