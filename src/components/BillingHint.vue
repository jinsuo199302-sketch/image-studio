<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { authToken } from '../services/httpClient'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{ feature: string }>()
const authStore = useAuthStore()

interface Status {
  metered: boolean
  cost?: number
  credits?: number
  free_left?: number
}
const s = ref<Status | null>(null)

async function load() {
  try {
    s.value = await fetch(`/api/billing/status?feature=${encodeURIComponent(props.feature)}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    }).then((r) => r.json())
  } catch {
    /* ignore */
  }
}
onMounted(load)
defineExpose({ load })
</script>

<template>
  <p v-if="s?.metered && authStore.isAuthenticated" class="text-[11px] text-gray-400">
    <template v-if="(s.free_left ?? 0) > 0">今日还可免费 {{ s.free_left }} 次</template>
    <template v-else>本次消耗 {{ s.cost }} 次（剩余 {{ s.credits }} 次）</template>
  </p>
  <p v-else-if="s?.metered" class="text-[11px] text-gray-400">登录后每天可免费使用</p>
</template>
