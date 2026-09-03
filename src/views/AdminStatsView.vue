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

const grantEmail = ref('')
const grantAmount = ref(10)
const grantNote = ref('')
const grantMsg = ref('')
async function grant() {
  grantMsg.value = ''
  try {
    const res = await fetch('/api/admin/grant-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ email: grantEmail.value.trim(), amount: grantAmount.value, note: grantNote.value.trim() }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d?.detail || '失败')
    grantMsg.value = `${d.email} 现在有 ${d.balance} 次（${d.delta > 0 ? '+' : ''}${d.delta}）`
    grantEmail.value = ''
    grantNote.value = ''
  } catch (e) {
    grantMsg.value = e instanceof Error ? e.message : '失败'
  }
}

const memEmail = ref('')
const memMonths = ref(1)
const memMsg = ref('')

interface Recharge {
  id: number
  email: string
  kind: string
  amount_yuan: string
  want: string
  note: string
  at: string
}
const recharges = ref<Recharge[]>([])
async function loadRecharges() {
  try {
    const d = await fetch('/api/admin/recharge-requests', {
      headers: { Authorization: `Bearer ${authToken()}` },
    }).then((r) => r.json())
    recharges.value = d.list || []
  } catch {
    /* ignore */
  }
}
async function resolveRecharge(r: Recharge, action: string) {
  const body: Record<string, unknown> = { id: r.id, action }
  if (action === 'confirm_credits') {
    const n = Number(window.prompt(`给 ${r.email} 加几次？（TA想买：${r.want || '未填'}，付了 ¥${r.amount_yuan || '?'}）`, '100'))
    if (!n || n <= 0) return
    body.credits = n
  } else if (action === 'confirm_membership') {
    const m = Number(window.prompt(`给 ${r.email} 开几个月会员？`, r.want.replace(/\D/g, '') || '1'))
    if (!m || m <= 0) return
    body.months = m
  }
  try {
    const res = await fetch('/api/admin/resolve-recharge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json())?.detail || '失败')
    await loadRecharges()
  } catch (e) {
    window.alert(e instanceof Error ? e.message : '失败')
  }
}
async function grantMember() {
  memMsg.value = ''
  try {
    const res = await fetch('/api/admin/grant-membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ email: memEmail.value.trim(), months: memMonths.value }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d?.detail || '失败')
    memMsg.value = `${d.email} 会员至 ${d.membership_until.slice(0, 10)}，当前 ${d.credits} 次`
    memEmail.value = ''
  } catch (e) {
    memMsg.value = e instanceof Error ? e.message : '失败'
  }
}

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
onMounted(() => {
  load()
  loadRecharges()
})
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

        <div v-if="recharges.length" class="mb-4 overflow-hidden rounded-lg border border-amber-200 bg-white">
          <div class="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700">
            待确认充值 ({{ recharges.length }})
          </div>
          <div v-for="r in recharges" :key="r.id" class="flex flex-wrap items-center gap-2 border-b border-gray-50 px-4 py-2 text-xs last:border-0">
            <span class="font-medium text-gray-700">{{ r.email }}</span>
            <span class="text-gray-500">付 ¥{{ r.amount_yuan || '?' }} · 想要「{{ r.want || '未填' }}」</span>
            <span v-if="r.note" class="text-gray-400">备注：{{ r.note }}</span>
            <span class="text-gray-300">{{ r.at.slice(5, 16).replace('T', ' ') }}</span>
            <div class="ml-auto flex gap-1.5">
              <button class="rounded border border-violet-300 px-2 py-0.5 text-violet-600" @click="resolveRecharge(r, 'confirm_credits')">确认→加次数</button>
              <button class="rounded border border-amber-300 px-2 py-0.5 text-amber-600" @click="resolveRecharge(r, 'confirm_membership')">确认→开会员</button>
              <button class="rounded border border-gray-200 px-2 py-0.5 text-gray-400" @click="resolveRecharge(r, 'reject')">驳回</button>
            </div>
          </div>
        </div>

        <div class="mb-4 space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <div>
            <div class="mb-2 text-xs font-medium text-gray-500">收到充值付款 → 手动加次数</div>
            <div class="flex flex-wrap items-center gap-2">
              <el-input v-model="grantEmail" size="small" placeholder="用户邮箱" class="!w-48" />
              <el-input-number v-model="grantAmount" size="small" :step="5" class="!w-28" />
              <el-input v-model="grantNote" size="small" placeholder="备注（可选）" class="!w-40" />
              <el-button size="small" type="primary" @click="grant">加次数</el-button>
            </div>
            <p v-if="grantMsg" class="mt-2 text-xs text-gray-600">{{ grantMsg }}</p>
          </div>
          <div class="border-t border-gray-100 pt-3">
            <div class="mb-2 text-xs font-medium text-gray-500">收到会员付款 → 开通/续费会员（自动补每月赠送次数）</div>
            <div class="flex flex-wrap items-center gap-2">
              <el-input v-model="memEmail" size="small" placeholder="用户邮箱" class="!w-48" />
              <el-input-number v-model="memMonths" size="small" :min="1" :max="24" class="!w-24" />
              <span class="text-xs text-gray-400">个月</span>
              <el-button size="small" type="warning" @click="grantMember">开通会员</el-button>
            </div>
            <p v-if="memMsg" class="mt-2 text-xs text-gray-600">{{ memMsg }}</p>
          </div>
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
