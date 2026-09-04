<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close } from '@element-plus/icons-vue'
import { makePayslips, mergeSheets } from '../../../../services/pdfApi'
import { saveFile } from '../../../../utils/saveFile'

type Mode = 'payslip' | 'merge'
const mode = ref<Mode>('payslip')
const busy = ref(false)

function saveBlob(blob: Blob, name: string) {
  return saveFile(name, blob)
}
async function run(fn: () => Promise<Blob>, name: string, ok: string) {
  busy.value = true
  try {
    await saveBlob(await fn(), name)
    ElMessage.success(ok)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '处理失败，请重试')
  } finally {
    busy.value = false
  }
}

// 工资条
const payFile = ref<File | null>(null)
const slipTitle = ref('')
const perPage = ref(12)

// 合并去重
const mergeFiles = ref<File[]>([])
const mergeInput = ref<HTMLInputElement>()
const dedupe = ref(false)
const keyColumn = ref('')
function pickMerge(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  mergeFiles.value.push(...picked.slice(0, 30 - mergeFiles.value.length))
}

function pickFile(e: Event, set: (f: File) => void) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (f) set(f)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="工资条拆分、多个 Excel 合并去重。本地处理（openpyxl），不上传第三方"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="flex gap-1.5 px-3 pt-3">
      <button
        v-for="m in ([['payslip', '工资条拆分'], ['merge', '多表合并去重']] as const)"
        :key="m[0]"
        class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
        :class="mode === m[0] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m[0]"
      >
        {{ m[1] }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <template v-if="mode === 'payslip'">
        <input type="file" accept=".xlsx" class="hidden" ref="payInput" @change="(e) => pickFile(e, (f) => (payFile = f))" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="($refs.payInput as HTMLInputElement)?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ payFile ? payFile.name : '选择工资总表（.xlsx，第一行为表头）' }}</span>
        </div>
        <el-input v-model="slipTitle" size="small" placeholder="每条工资条的标题，如：2026年3月工资条（可选）" />
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">每页 {{ perPage }} 条</label>
          <el-slider v-model="perPage" :min="4" :max="30" :show-tooltip="false" />
          <p class="mt-1 text-[11px] text-gray-400">导出一个 xlsx，每人一小块，打印后按线裁开</p>
        </div>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!payFile"
          @click="run(() => makePayslips(payFile!, slipTitle.trim(), perPage), 'payslips.xlsx', '工资条已生成')"
        >
          生成工资条
        </el-button>
      </template>

      <template v-else>
        <input ref="mergeInput" type="file" accept=".xlsx" multiple class="hidden" @change="pickMerge" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="mergeInput?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">选择多个 Excel（.xlsx，表头需一致，最多 30 个）</span>
        </div>
        <div v-if="mergeFiles.length" class="space-y-1">
          <div
            v-for="(f, i) in mergeFiles"
            :key="i"
            class="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-600"
          >
            <span class="truncate">{{ f.name }}</span>
            <button class="text-gray-400 hover:text-red-400" @click="mergeFiles.splice(i, 1)">
              <el-icon :size="12"><Close /></el-icon>
            </button>
          </div>
        </div>
        <el-checkbox v-model="dedupe" size="small">去除重复行</el-checkbox>
        <el-input
          v-if="dedupe"
          v-model="keyColumn"
          size="small"
          placeholder="按哪一列判重（表头名或列号，留空=整行一致才算重复）"
        />
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="mergeFiles.length < 2"
          @click="run(() => mergeSheets(mergeFiles, dedupe, keyColumn.trim()), 'merged.xlsx', '已合并')"
        >
          合并{{ dedupe ? '并去重' : '' }}
        </el-button>
      </template>
    </div>
  </div>
</template>
