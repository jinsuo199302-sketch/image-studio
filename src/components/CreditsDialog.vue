<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { authToken } from '../services/httpClient'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const authStore = useAuthStore()
interface Info {
  packages: { credits: number; price: number }[]
  qr_url: string
  contact: string
  membership_price: number
  membership_monthly_credits: number
}
const info = ref<Info | null>(null)
const tab = ref<'member' | 'credits'>('member')
const qrOk = ref(true)

const paidOpen = ref(false)
const paid = ref({ amount_yuan: '', want: '', note: '' })
const submitting = ref(false)

async function load() {
  try {
    info.value = await fetch('/api/billing/info', {
      headers: { Authorization: `Bearer ${authToken()}` },
    }).then((r) => r.json())
  } catch {
    /* ignore */
  }
}
onMounted(load)
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      load()
      authStore.refreshMe()
      qrOk.value = true
      paidOpen.value = false
    }
  },
)

async function submitPaid() {
  submitting.value = true
  try {
    const res = await fetch('/api/billing/recharge-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({
        kind: tab.value === 'member' ? 'membership' : 'credits',
        amount_yuan: paid.value.amount_yuan,
        want: paid.value.want || (tab.value === 'member' ? '会员' : ''),
        note: paid.value.note,
      }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d?.detail || '提交失败')
    ElMessage.success('已提交，客服核对到账后会加到你账上')
    paidOpen.value = false
    paid.value = { amount_yuan: '', want: '', note: '' }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="会员 / 次数"
    width="380"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="space-y-3">
      <div class="rounded-lg bg-violet-50 p-3 text-sm text-violet-700">
        <span v-if="authStore.user?.is_member">👑 会员至 {{ (authStore.user?.membership_until || '').slice(0, 10) }} · </span>
        剩余 <span class="font-semibold">{{ authStore.user?.credits ?? 0 }}</span> 次
      </div>

      <div class="flex gap-1.5">
        <button
          v-for="t in (['member', 'credits'] as const)"
          :key="t"
          class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
          :class="tab === t ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="tab = t"
        >
          {{ t === 'member' ? '开通会员' : '单买次数' }}
        </button>
      </div>

      <template v-if="tab === 'member' && info">
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div class="flex items-baseline justify-between">
            <span class="font-semibold text-gray-800">月度会员</span>
            <span class="text-lg font-bold text-amber-600">¥{{ info.membership_price }}<span class="text-xs font-normal">/月</span></span>
          </div>
          <ul class="mt-2 space-y-0.5 text-[11px] text-gray-600">
            <li>· 所有本地工具无限用、无广告</li>
            <li>· 批量处理 / 高清导出 / 优先生成</li>
            <li>· 每月赠送 {{ info.membership_monthly_credits }} 次 AI 生成</li>
          </ul>
        </div>
      </template>

      <template v-else-if="tab === 'credits' && info">
        <div class="grid grid-cols-3 gap-2">
          <div v-for="p in info.packages" :key="p.credits" class="rounded-lg border border-gray-200 p-2.5 text-center">
            <div class="text-base font-semibold text-gray-800">{{ p.credits }} 次</div>
            <div class="text-xs text-violet-600">¥{{ p.price }}</div>
          </div>
        </div>
        <p class="text-[11px] text-gray-400">次数用于 AI 生图等消耗资源的功能；抠图、证件照、PDF、排版等本地工具永久免费。</p>
      </template>

      <div class="border-t border-gray-100 pt-3">
        <div v-if="info?.qr_url && qrOk" class="flex flex-col items-center gap-1">
          <img :src="info.qr_url" class="h-44 w-44 rounded border border-gray-200 object-contain" @error="qrOk = false" />
          <span class="text-[11px] text-gray-400">微信扫码支付</span>
        </div>
        <p class="mt-1 text-[11px] leading-relaxed text-gray-500">{{ info?.contact }}</p>

        <button
          v-if="!paidOpen"
          class="mt-2 w-full rounded-md border border-violet-300 py-1.5 text-xs text-violet-600 hover:bg-violet-50"
          @click="paidOpen = true"
        >
          我已付款，提交给客服
        </button>
        <div v-else class="mt-2 space-y-1.5">
          <el-input v-model="paid.amount_yuan" size="small" placeholder="付款金额（元）" />
          <el-input v-model="paid.want" size="small" :placeholder="tab === 'member' ? '开通几个月（如 1）' : '买哪个套餐（如 100次）'" />
          <el-input v-model="paid.note" size="small" placeholder="付款微信昵称 / 备注（可选）" />
          <el-button size="small" type="primary" class="!w-full" :loading="submitting" @click="submitPaid">提交</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>
