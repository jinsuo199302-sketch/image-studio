<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { evalExpr, mortgage, incomeTax, vatSplit, daysBetween, dateAdd } from '../../../../utils/calc'

type Mode = 'basic' | 'loan' | 'tax' | 'vat' | 'date'
const mode = ref<Mode>('basic')
const MODES: { key: Mode; label: string }[] = [
  { key: 'basic', label: '计算器' },
  { key: 'loan', label: '房贷' },
  { key: 'tax', label: '个税' },
  { key: 'vat', label: '价税分离' },
  { key: 'date', label: '日期' },
]

const fmt = (n: number, d = 2) =>
  n.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d })

async function copy(t: string) {
  try {
    await navigator.clipboard.writeText(t)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

// ---- 计算器 ----
const expr = ref('')
const exprResult = computed(() => {
  const r = evalExpr(expr.value)
  return r === null ? '' : String(r)
})
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '%', '+']
function press(k: string) {
  expr.value += k
}

// ---- 房贷 ----
const loanAmount = ref(100)
const loanRate = ref(3.5)
const loanYears = ref(30)
const loanMethod = ref<'equal-payment' | 'equal-principal'>('equal-payment')
const loanResult = computed(() => mortgage(loanAmount.value, loanRate.value, loanYears.value, loanMethod.value))

// ---- 个税 ----
const salary = ref(15000)
const insurance = ref(2000)
const special = ref(1000)
const taxResult = computed(() => incomeTax(salary.value, insurance.value, special.value))

// ---- 价税分离 ----
const vatAmount = ref(11300)
const vatRate = ref(13)
const vatMode = ref<'incl' | 'excl'>('incl')
const vatResult = computed(() => vatSplit(vatAmount.value, vatRate.value, vatMode.value))

// ---- 日期 ----
const dateA = ref('')
const dateB = ref('')
const dateBase = ref('')
const dateOffset = ref(30)
const diffResult = computed(() => (dateA.value && dateB.value ? daysBetween(dateA.value, dateB.value) : null))
const addResult = computed(() => (dateBase.value ? dateAdd(dateBase.value, dateOffset.value) : null))
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert title="普通计算 + 房贷、个税、发票价税分离、日期推算。全部本地即时算" type="info" :closable="false" show-icon />
    </div>

    <div class="flex flex-wrap gap-1.5 px-3 pt-3">
      <button
        v-for="m in MODES"
        :key="m.key"
        class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
        :class="mode === m.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m.key"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <!-- 计算器 -->
      <template v-if="mode === 'basic'">
        <el-input v-model="expr" size="large" placeholder="0" clearable />
        <div class="text-right text-lg font-semibold text-violet-600">{{ exprResult || '—' }}</div>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="k in KEYS"
            :key="k"
            class="rounded-lg border border-gray-200 py-2.5 text-sm hover:bg-violet-50 hover:text-violet-600"
            @click="press(k)"
          >
            {{ k }}
          </button>
          <button class="col-span-2 rounded-lg border border-gray-200 py-2.5 text-sm hover:bg-gray-50" @click="expr = expr.slice(0, -1)">
            ⌫
          </button>
          <button class="col-span-2 rounded-lg border border-gray-200 py-2.5 text-sm hover:bg-gray-50" @click="expr = ''">
            清空
          </button>
        </div>
      </template>

      <!-- 房贷 -->
      <template v-else-if="mode === 'loan'">
        <label class="block text-xs text-gray-500">贷款金额（万元）</label>
        <el-input-number v-model="loanAmount" :min="1" :max="10000" :step="10" size="small" class="!w-full" />
        <label class="block text-xs text-gray-500">年利率（%）</label>
        <el-input-number v-model="loanRate" :min="0" :max="30" :step="0.05" :precision="2" size="small" class="!w-full" />
        <label class="block text-xs text-gray-500">贷款年限</label>
        <el-input-number v-model="loanYears" :min="1" :max="30" size="small" class="!w-full" />
        <div class="flex gap-1.5">
          <button
            v-for="opt in ([['equal-payment', '等额本息'], ['equal-principal', '等额本金']] as const)"
            :key="opt[0]"
            class="flex-1 rounded-full border px-2 py-1 text-[11px]"
            :class="loanMethod === opt[0] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="loanMethod = opt[0]"
          >
            {{ opt[1] }}
          </button>
        </div>
        <div v-if="loanResult" class="space-y-1.5 rounded-lg border border-gray-200 p-3 text-sm">
          <div v-if="loanMethod === 'equal-payment'" class="flex justify-between">
            <span class="text-gray-500">每月月供</span><span class="font-semibold">¥{{ fmt(loanResult.firstMonth) }}</span>
          </div>
          <template v-else>
            <div class="flex justify-between"><span class="text-gray-500">首月月供</span><span class="font-semibold">¥{{ fmt(loanResult.firstMonth) }}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">末月月供</span><span>¥{{ fmt(loanResult.lastMonth) }}</span></div>
            <div class="flex justify-between"><span class="text-gray-500">每月递减</span><span>¥{{ fmt((loanResult.firstMonth - loanResult.lastMonth) / (loanResult.months - 1)) }}</span></div>
          </template>
          <div class="flex justify-between"><span class="text-gray-500">支付利息</span><span>¥{{ fmt(loanResult.totalInterest) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">还款总额</span><span>¥{{ fmt(loanResult.totalPayment) }}</span></div>
          <div class="flex justify-between text-[11px] text-gray-400"><span>共 {{ loanResult.months }} 期</span></div>
        </div>
      </template>

      <!-- 个税 -->
      <template v-else-if="mode === 'tax'">
        <label class="block text-xs text-gray-500">税前月薪（元）</label>
        <el-input-number v-model="salary" :min="0" :step="500" size="small" class="!w-full" />
        <label class="block text-xs text-gray-500">五险一金个人月缴（元）</label>
        <el-input-number v-model="insurance" :min="0" :step="100" size="small" class="!w-full" />
        <label class="block text-xs text-gray-500">专项附加扣除月合计（元）</label>
        <el-input-number v-model="special" :min="0" :step="100" size="small" class="!w-full" />
        <div v-if="taxResult" class="space-y-1.5 rounded-lg border border-gray-200 p-3 text-sm">
          <div class="flex justify-between"><span class="text-gray-500">全年个税</span><span class="font-semibold">¥{{ fmt(taxResult.yearTax) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">月均到手</span><span class="font-semibold">¥{{ fmt(taxResult.avgNet) }}</span></div>
          <div class="mt-1 border-t border-gray-100 pt-1.5 text-[11px] text-gray-400">按累计预扣法，每月个税前低后高：</div>
          <div class="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
            <span v-for="r in taxResult.monthly" :key="r.month">{{ r.month }}月 ¥{{ fmt(r.tax, 0) }}</span>
          </div>
        </div>
        <p class="text-[11px] text-gray-400">起征点 5000 元/月，2024 年七级预扣率表。假设全年工资、扣除不变</p>
      </template>

      <!-- 价税分离 -->
      <template v-else-if="mode === 'vat'">
        <div class="flex gap-1.5">
          <button
            v-for="opt in ([['incl', '含税→不含税'], ['excl', '不含税→含税']] as const)"
            :key="opt[0]"
            class="flex-1 rounded-full border px-2 py-1 text-[11px]"
            :class="vatMode === opt[0] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="vatMode = opt[0]"
          >
            {{ opt[1] }}
          </button>
        </div>
        <label class="block text-xs text-gray-500">{{ vatMode === 'incl' ? '含税金额' : '不含税金额' }}（元）</label>
        <el-input-number v-model="vatAmount" :min="0" :step="100" size="small" class="!w-full" />
        <label class="block text-xs text-gray-500">税率（%）</label>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="r in [13, 9, 6, 3, 1]"
            :key="r"
            class="rounded border px-2 py-0.5 text-[11px]"
            :class="vatRate === r ? 'border-violet-500 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="vatRate = r"
          >
            {{ r }}%
          </button>
          <el-input-number v-model="vatRate" :min="0" :max="100" :step="1" size="small" controls-position="right" class="!w-20" />
        </div>
        <div v-if="vatResult" class="space-y-1.5 rounded-lg border border-gray-200 p-3 text-sm">
          <div class="flex justify-between"><span class="text-gray-500">不含税金额</span><span class="font-semibold">¥{{ fmt(vatResult.exclusive) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">税额</span><span>¥{{ fmt(vatResult.tax) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">含税金额</span><span class="font-semibold">¥{{ fmt(vatResult.inclusive) }}</span></div>
        </div>
      </template>

      <!-- 日期 -->
      <template v-else>
        <div class="rounded-lg border border-gray-200 p-3">
          <p class="mb-2 text-xs font-medium text-gray-600">相差天数</p>
          <div class="flex items-center gap-2">
            <el-date-picker v-model="dateA" type="date" size="small" value-format="YYYY-MM-DD" placeholder="开始" class="!w-full" />
            <span class="text-gray-400">→</span>
            <el-date-picker v-model="dateB" type="date" size="small" value-format="YYYY-MM-DD" placeholder="结束" class="!w-full" />
          </div>
          <p v-if="diffResult !== null" class="mt-2 text-sm">
            相差 <span class="font-semibold text-violet-600">{{ Math.abs(diffResult) }}</span> 天
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 p-3">
          <p class="mb-2 text-xs font-medium text-gray-600">推算日期</p>
          <div class="flex items-center gap-2">
            <el-date-picker v-model="dateBase" type="date" size="small" value-format="YYYY-MM-DD" placeholder="基准日" class="!w-full" />
            <el-input-number v-model="dateOffset" size="small" :step="1" controls-position="right" class="!w-24" />
            <span class="whitespace-nowrap text-xs text-gray-500">天后</span>
          </div>
          <p v-if="addResult" class="mt-2 text-sm">
            = <span class="font-semibold text-violet-600">{{ addResult }}</span>
            <button class="ml-2 text-[11px] text-violet-500 hover:underline" @click="copy(addResult)">复制</button>
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
