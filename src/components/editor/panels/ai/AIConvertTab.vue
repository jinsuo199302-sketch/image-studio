<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { toRmbUpper, toChineseNumber } from '../../../../utils/numberToChinese'
import { toPinyin } from '../../../../services/pdfApi'

type Mode = 'number' | 'pinyin'
const mode = ref<Mode>('number')

// ---- 数字大写（纯前端，即时）----
const numInput = ref('')
const numResults = computed(() => {
  const v = numInput.value.trim()
  if (!v) return null
  return {
    rmb: toRmbUpper(v),
    upper: toChineseNumber(v, true),
    lower: toChineseNumber(v, false),
  }
})

// ---- 汉字转拼音 ----
const pyInput = ref('')
const pyStyle = ref('tone')
const pyResult = ref('')
const pyBusy = ref(false)
const PY_STYLES = [
  { key: 'tone', label: '带声调' },
  { key: 'plain', label: '不带声调' },
  { key: 'tone_num', label: '数字声调' },
  { key: 'first', label: '首字母' },
  { key: 'first_cap', label: '首字母大写' },
]
let pyTimer: ReturnType<typeof setTimeout> | undefined
watch([pyInput, pyStyle], () => {
  clearTimeout(pyTimer)
  if (!pyInput.value.trim()) {
    pyResult.value = ''
    return
  }
  pyTimer = setTimeout(runPinyin, 400)
})
async function runPinyin() {
  pyBusy.value = true
  try {
    pyResult.value = await toPinyin(pyInput.value, pyStyle.value)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '转换失败')
  } finally {
    pyBusy.value = false
  }
}

async function copy(t: string) {
  try {
    await navigator.clipboard.writeText(t)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert title="数字转中文大写、汉字转拼音。都是小工具，本地即时转" type="info" :closable="false" show-icon />
    </div>

    <div class="flex gap-1.5 px-3 pt-3">
      <button
        v-for="m in ([['number', '数字大写'], ['pinyin', '汉字转拼音']] as const)"
        :key="m[0]"
        class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
        :class="mode === m[0] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m[0]"
      >
        {{ m[1] }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <template v-if="mode === 'number'">
        <el-input v-model="numInput" size="large" placeholder="输入数字，如 12345.67" clearable />
        <div v-if="numResults" class="space-y-2">
          <div
            v-for="row in [
              ['人民币大写', numResults.rmb],
              ['中文大写', numResults.upper],
              ['中文小写', numResults.lower],
            ]"
            :key="row[0]"
            class="rounded-lg border border-gray-200 p-2.5"
          >
            <div class="mb-0.5 flex items-center justify-between">
              <span class="text-[11px] text-gray-400">{{ row[0] }}</span>
              <button class="text-[11px] text-violet-500 hover:underline" @click="copy(row[1])">复制</button>
            </div>
            <p class="break-all text-sm text-gray-800">{{ row[1] }}</p>
          </div>
        </div>
        <p class="text-[11px] text-gray-400">支持小数、负数；金额自动按元角分处理（如 100.05 → 壹佰元零伍分）</p>
      </template>

      <template v-else>
        <el-input
          v-model="pyInput"
          type="textarea"
          :rows="4"
          resize="none"
          placeholder="输入汉字，如：重庆银行"
        />
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in PY_STYLES"
            :key="s.key"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="pyStyle === s.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="pyStyle = s.key"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="rounded-lg border border-gray-200 p-2.5">
          <div class="mb-0.5 flex items-center justify-between">
            <span class="text-[11px] text-gray-400">{{ pyBusy ? '转换中…' : '结果' }}</span>
            <button
              v-if="pyResult"
              class="text-[11px] text-violet-500 hover:underline"
              @click="copy(pyResult)"
            >
              复制
            </button>
          </div>
          <p class="min-h-[1.25rem] break-all text-sm text-gray-800">{{ pyResult }}</p>
        </div>
      </template>
    </div>
  </div>
</template>
