<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Plus,
  HomeFilled,
  MagicStick,
  Grid,
  UserFilled,
  Location,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const active = ref('home')

const NAV = [
  { key: 'home', label: '首页', icon: HomeFilled },
  { key: 'ai', label: 'AI 设计', icon: MagicStick, comingSoon: true },
  { key: 'templates', label: '模板中心', icon: Grid },
]
</script>

<template>
  <aside class="flex w-44 shrink-0 flex-col gap-1 border-r border-gray-200 bg-white p-3">
    <el-button
      type="primary"
      class="!mb-3 !w-full !justify-start !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
      :icon="Plus"
    >
      创建设计
    </el-button>

    <button
      v-for="item in NAV"
      :key="item.key"
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
      :class="
        active === item.key
          ? 'bg-violet-50 font-medium text-violet-600'
          : 'text-gray-600 hover:bg-gray-100'
      "
      @click="active = item.key"
    >
      <el-icon :size="16"><component :is="item.icon" /></el-icon>
      {{ item.label }}
      <el-tag v-if="item.comingSoon" size="small" type="info" class="ml-auto scale-90">敬请期待</el-tag>
    </button>

    <div class="my-2 border-t border-gray-100" />

    <button
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
      :class="
        route.path === '/mine'
          ? 'bg-violet-50 font-medium text-violet-600'
          : 'text-gray-600 hover:bg-gray-100'
      "
      @click="router.push('/mine')"
    >
      <el-icon :size="16"><UserFilled /></el-icon>
      我的
    </button>
    <button
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
    >
      <el-icon :size="16"><Location /></el-icon>
      区域合作
    </button>
  </aside>
</template>
