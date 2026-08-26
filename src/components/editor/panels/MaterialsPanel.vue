<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Delete, Loading, Picture } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '../../../stores/auth'
import { deleteGeneratedAsset, listGeneratedAssets, type GeneratedAsset } from '../../../services/assetsApi'

const emit = defineEmits<{ (e: 'insert', url: string): void }>()

const authStore = useAuthStore()
const assets = ref<GeneratedAsset[]>([])
const loading = ref(false)
const deletingId = ref('')

async function load() {
  if (!authStore.isAuthenticated) return
  loading.value = true
  try {
    assets.value = await listGeneratedAssets()
  } finally {
    loading.value = false
  }
}

async function remove(asset: GeneratedAsset) {
  try {
    await ElMessageBox.confirm('删除后不能恢复，确定删除这张素材吗？', '删除素材', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  deletingId.value = asset.id
  try {
    await deleteGeneratedAsset(asset.id)
    assets.value = assets.value.filter((a) => a.id !== asset.id)
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="flex h-full flex-col p-3">
    <p class="mb-2 text-xs text-gray-400">"参考图生成"产出的背景图会自动存在这里，仅你自己可见</p>

    <div v-if="!authStore.isAuthenticated" class="flex flex-1 items-center justify-center text-center text-xs text-gray-400">
      登录后可以查看/管理自己生成过的素材
    </div>
    <div v-else-if="loading" class="flex flex-1 items-center justify-center text-gray-300">
      <el-icon :size="20" class="animate-spin"><Loading /></el-icon>
    </div>
    <div v-else-if="assets.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 text-center text-xs text-gray-400">
      <el-icon :size="24"><Picture /></el-icon>
      还没有生成过素材，去"AI设计 → 参考图生成"试试
    </div>
    <div v-else class="grid grid-cols-2 gap-2 overflow-y-auto">
      <div
        v-for="asset in assets"
        :key="asset.id"
        class="group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-lg border border-gray-100"
        @click="emit('insert', asset.url)"
      >
        <img :src="asset.url" class="h-full w-full object-cover" />
        <button
          class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-500"
          :disabled="deletingId === asset.id"
          @click.stop="remove(asset)"
        >
          <el-icon :size="12"><Delete /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>
