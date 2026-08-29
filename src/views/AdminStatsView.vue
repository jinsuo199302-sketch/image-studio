<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppHeader from '../components/AppHeader.vue'
import { authToken } from '../services/httpClient'

interface FeatureRow {
  feature: string
  views: number
  actions: number
  action_ok: number
}
interface Stats {
  days: number
  features: FeatureRow[]
  daily: { day: string; users: number; events: number }[]
  total_users: number
  new_users: number
}

const days = ref(7)
const stats = ref<Stats | null>(null)
const error = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/admin/stats?days=${days.value}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      throw new Error(d?.detail || `加载失败：${res.status}`)
    }
    stats.value = await res.json()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="flex min-h-screen flex-col bg-gray-50">
    <AppHeader />
    <div class="mx-auto w-full max-w-3xl p-6">
      <div class="mb-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold text-gray-800">使用数据</h1>
        <div class="flex gap-1.5">
          <button
            v-for="d in [7, 14, 30]"
            :key="d"
            class="rounded-full border px-3 py-1 text-xs"
            :class="days === d ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="((days = d), load())"
          >
            近 {{ d }} 天
          </button>
        </div>
      </div>

      <p v-if="error" class="rounded bg-red-50 p-3 text-sm text-red-600">{{ error }}</p>
      <p v-else-if="loading" class="text-sm text-gray-400">加载中…</p>

      <template v-else-if="stats">
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="text-xs text-gray-400">总用户</div>
            <div class="text-xl font-semibold">{{ stats.total_users }}</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="text-xs text-gray-400">近 {{ stats.days }} 天新增</div>
            <div class="text-xl font-semibold">{{ stats.new_users }}</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <div class="text-xs text-gray-400">近 {{ stats.days }} 天调用</div>
            <div class="text-xl font-semibold">
              {{ stats.daily.reduce((s, d) => s + d.events, 0) }}
            </div>
          </div>
        </div>

        <div class="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div class="border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">
            工具使用（打开次数 / 实际调用 / 成功）
          </div>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="f in stats.features" :key="f.feature" class="border-b border-gray-50 last:border-0">
                <td class="px-4 py-2 text-gray-700">{{ f.feature }}</td>
                <td class="px-3 py-2 text-right tabular-nums text-gray-400">{{ f.views || '—' }}</td>
                <td class="px-3 py-2 text-right tabular-nums font-medium text-gray-800">{{ f.actions || '—' }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-gray-400">{{ f.actions ? f.action_ok : '—' }}</td>
              </tr>
              <tr v-if="!stats.features.length">
                <td class="px-4 py-6 text-center text-sm text-gray-400" colspan="4">还没有数据</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div class="border-b border-gray-100 px-4 py-2 text-xs font-medium text-gray-500">每日活跃</div>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="d in stats.daily.slice().reverse()" :key="d.day" class="border-b border-gray-50 last:border-0">
                <td class="px-4 py-2 text-gray-600">{{ d.day }}</td>
                <td class="px-3 py-2 text-right tabular-nums text-gray-800">{{ d.users }} 人</td>
                <td class="px-4 py-2 text-right tabular-nums text-gray-400">{{ d.events }} 次</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </div>
</template>
