<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginDialog from './LoginDialog.vue'

const router = useRouter()
const authStore = useAuthStore()
const loginOpen = ref(false)

authStore.restoreSession()
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
      <span class="cursor-pointer hover:text-violet-600" @click="router.push({ name: 'help' })">使用教程</span>
      <span class="cursor-pointer hover:text-violet-600">模板中心</span>
      <span class="cursor-pointer hover:text-violet-600" @click="router.push({ name: 'ai-tools' })">AI 工具</span>
    </nav>

    <div class="flex items-center gap-3">
      <template v-if="authStore.isAuthenticated">
        <el-button size="small" round class="!border-amber-300 !bg-amber-50 !text-amber-600">
          开通会员
        </el-button>
        <el-dropdown>
          <span class="flex cursor-pointer items-center gap-2">
            <el-avatar :size="30" class="!bg-violet-500">
              {{ authStore.user?.email?.[0]?.toUpperCase() }}
            </el-avatar>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ authStore.user?.email }}</el-dropdown-item>
              <el-dropdown-item divided @click="authStore.logout()">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
      <el-button v-else type="primary" size="small" class="!bg-violet-500 !border-none" @click="loginOpen = true">
        登录 / 注册
      </el-button>
    </div>

    <LoginDialog v-model="loginOpen" />
  </header>
</template>
