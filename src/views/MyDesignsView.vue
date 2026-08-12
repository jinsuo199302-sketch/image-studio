<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppHeader from '../components/AppHeader.vue'
import Sidebar from '../components/home/Sidebar.vue'
import LoginDialog from '../components/LoginDialog.vue'
import { useAuthStore } from '../stores/auth'
import { useTemplateStore } from '../stores/templates'

const router = useRouter()
const authStore = useAuthStore()
const templateStore = useTemplateStore()
const loginOpen = ref(false)

const list = computed(() => templateStore.mine)

watch(
  () => authStore.isAuthenticated,
  (ok) => {
    if (ok) templateStore.fetchMine()
    else templateStore.resetMine()
  },
  { immediate: true },
)

function openTemplate(id: string) {
  router.push(`/design/${id}`)
}

async function removeDesign(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`确定删除"${name}"吗？删除后无法恢复。`, '删除设计', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await templateStore.removeTemplate(id)
    ElMessage.success('已删除')
  } catch {
    ElMessage.error('删除失败，请重试')
  }
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden">
      <Sidebar />

      <main class="flex-1 overflow-y-auto px-8 py-8">
        <h1 class="mb-1 text-xl font-semibold text-gray-800">我的设计</h1>
        <p class="mb-6 text-sm text-gray-400">
          这里只有你自己保存的设计，其他人看不到，也不会出现在公共模板库里
        </p>

        <div v-if="!authStore.isAuthenticated" class="flex flex-col items-center justify-center py-24 text-center">
          <p class="mb-4 text-sm text-gray-500">登录后才能查看和保存你自己的设计</p>
          <el-button type="primary" class="!bg-violet-500 !border-none" @click="loginOpen = true">
            登录 / 注册
          </el-button>
        </div>

        <template v-else>
          <el-alert
            v-if="templateStore.mineError"
            :title="templateStore.mineError"
            type="error"
            :closable="false"
            show-icon
            class="mb-4"
          />

          <div v-if="templateStore.mineLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div v-for="n in 5" :key="n" class="animate-pulse overflow-hidden rounded-xl border border-gray-200">
              <div class="aspect-[3/4] bg-gray-100" />
              <div class="p-2"><div class="h-3 w-2/3 rounded bg-gray-100" /></div>
            </div>
          </div>

          <div
            v-else-if="!list.length"
            class="flex flex-col items-center justify-center py-24 text-center text-sm text-gray-400"
          >
            还没有保存过设计，在编辑器里点"另存为模板"就会出现在这里
          </div>

          <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div
              v-for="t in list"
              :key="t.id"
              class="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
              @click="openTemplate(t.id)"
            >
              <div
                class="relative overflow-hidden bg-gray-100"
                :style="{ aspectRatio: `${t.canvasWidth}/${t.canvasHeight}` }"
              >
                <img :src="t.thumbnail" class="h-full w-full object-cover" loading="lazy" />
                <div
                  class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"
                >
                  <span class="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-800">继续编辑</span>
                </div>
                <button
                  class="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-500 opacity-0 shadow transition hover:text-red-500 group-hover:opacity-100"
                  title="删除"
                  @click.stop="removeDesign(t.id, t.name)"
                >
                  ✕
                </button>
              </div>
              <div class="p-2">
                <p class="truncate text-xs text-gray-600">{{ t.name }}</p>
              </div>
            </div>
          </div>
        </template>
      </main>
    </div>

    <LoginDialog v-model="loginOpen" />
  </div>
</template>
