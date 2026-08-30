<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { authToken } from '../services/httpClient'
import { useAuthStore } from '../stores/auth'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const authStore = useAuthStore()
interface Info {
  signup_free: number
  packages: { credits: number; price: number }[]
  qr_url: string
  contact: string
  metered: Record<string, number>
}
const info = ref<Info | null>(null)

onMounted(async () => {
  try {
    info.value = await fetch('/api/billing/info', { headers: { Authorization: `Bearer ${authToken()}` } }).then((r) =>
      r.json(),
    )
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="次数充值"
    width="360"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="space-y-3">
      <div class="rounded-lg bg-violet-50 p-3 text-sm text-violet-700">
        当前剩余 <span class="font-semibold">{{ authStore.user?.credits ?? 0 }}</span> 次
      </div>

      <div v-if="info && !Object.keys(info.metered).length" class="text-[11px] text-gray-400">
        目前所有工具免费使用，暂无需充值。
      </div>

      <div v-if="info" class="grid grid-cols-3 gap-2">
        <div
          v-for="p in info.packages"
          :key="p.credits"
          class="rounded-lg border border-gray-200 p-2.5 text-center"
        >
          <div class="text-base font-semibold text-gray-800">{{ p.credits }} 次</div>
          <div class="text-xs text-violet-600">¥{{ p.price }}</div>
        </div>
      </div>

      <div v-if="info?.qr_url" class="flex flex-col items-center gap-1">
        <img :src="info.qr_url" class="h-40 w-40 rounded border border-gray-200 object-contain" />
        <span class="text-[11px] text-gray-400">扫码支付</span>
      </div>

      <p class="text-[11px] leading-relaxed text-gray-500">{{ info?.contact }}</p>
    </div>
  </el-dialog>
</template>
