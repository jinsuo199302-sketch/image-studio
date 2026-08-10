<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'
import { createSnippet } from '../../../services/snippetApi'

const emit = defineEmits<{
  (e: 'add', color: string): void
  (e: 'add-image', url: string): void
  (e: 'add-chart'): void
  (e: 'add-legend'): void
  (e: 'add-table'): void
}>()

const SWATCHES = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed']

type QrMode = 'text' | 'card'
const qrMode = ref<QrMode>('text')
const qrText = ref('')
const qrColor = ref('#1f2937')
const generating = ref(false)

const cardName = ref('')
const cardPhone = ref('')
const cardOrg = ref('')
const cardAddress = ref('')

/** 微信扫一扫不支持直接展示纯文本内容（会提示"暂不支持展示文本内容"），
 * 但支持识别 vCard 电子名片格式，扫完能弹出"保存到通讯录"。 */
function buildVCard(): string {
  const name = cardName.value.trim()
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${name};;;`,
    `FN:${name}`,
  ]
  if (cardOrg.value.trim()) lines.push(`ORG:${cardOrg.value.trim()}`)
  if (cardPhone.value.trim()) lines.push(`TEL;TYPE=CELL:${cardPhone.value.trim()}`)
  if (cardAddress.value.trim()) lines.push(`ADR;TYPE=WORK:;;${cardAddress.value.trim()};;;;`)
  lines.push('END:VCARD')
  return lines.join('\n')
}

async function generateQrcode() {
  let content = ''
  if (qrMode.value === 'text') {
    const input = qrText.value.trim()
    if (!input) {
      ElMessage.warning('请输入链接或文本内容')
      return
    }
    if (/^https?:\/\//i.test(input)) {
      content = input
    } else {
      // 微信扫一扫不展示纯文本，把内容存到后端，二维码里放一个短链接代替
      generating.value = true
      try {
        const snippet = await createSnippet(input)
        content = `${window.location.origin}/s/${snippet.id}`
      } catch (e) {
        ElMessage.error(e instanceof Error ? e.message : '内容保存失败，请重试')
        generating.value = false
        return
      }
    }
  } else {
    if (!cardName.value.trim() || !cardPhone.value.trim()) {
      ElMessage.warning('请至少填写姓名和电话')
      return
    }
    content = buildVCard()
  }
  generating.value = true
  try {
    const dataUrl = await QRCode.toDataURL(content, {
      width: 400,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: qrColor.value, light: '#ffffff' },
    })
    emit('add-image', dataUrl)
  } catch {
    ElMessage.error('二维码生成失败，请检查输入内容')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="p-3">
    <p class="mb-2 text-xs font-medium text-gray-600">矩形色块</p>
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="c in SWATCHES"
        :key="c"
        class="flex h-14 items-center justify-center rounded-md text-xs text-white"
        :style="{ background: c }"
        @click="emit('add', c)"
      >
        +
      </button>
    </div>

    <div class="mt-5 border-t border-gray-100 pt-4">
      <p class="mb-2 text-xs font-medium text-gray-600">数据组件</p>
      <div class="grid grid-cols-3 gap-2">
        <button
          class="flex flex-col items-center gap-1 rounded-md border border-gray-200 py-2.5 text-[11px] text-gray-600 hover:border-violet-300 hover:text-violet-600"
          @click="emit('add-chart')"
        >
          <span class="text-lg">📊</span>
          图表
        </button>
        <button
          class="flex flex-col items-center gap-1 rounded-md border border-gray-200 py-2.5 text-[11px] text-gray-600 hover:border-violet-300 hover:text-violet-600"
          @click="emit('add-legend')"
        >
          <span class="text-lg">🎨</span>
          图例
        </button>
        <button
          class="flex flex-col items-center gap-1 rounded-md border border-gray-200 py-2.5 text-[11px] text-gray-600 hover:border-violet-300 hover:text-violet-600"
          @click="emit('add-table')"
        >
          <span class="text-lg">▦</span>
          表格
        </button>
      </div>
    </div>

    <div class="mt-5 border-t border-gray-100 pt-4">
      <p class="mb-2 text-xs font-medium text-gray-600">二维码生成</p>

      <div class="mb-2 flex gap-1.5">
        <button
          class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
          :class="qrMode === 'text' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="qrMode = 'text'"
        >
          网址 / 文本
        </button>
        <button
          class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
          :class="qrMode === 'card' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="qrMode = 'card'"
        >
          名片（电话/地址）
        </button>
      </div>

      <template v-if="qrMode === 'text'">
        <el-input
          v-model="qrText"
          type="textarea"
          :rows="2"
          placeholder="输入网址或文字内容，生成后可直接拖拽调整大小"
        />
        <p class="mt-1 text-[11px] text-amber-600">
          提示：微信扫一扫不支持展示纯文本内容，只有网址链接能正常跳转；电话/地址请用上面的"名片"模式。
        </p>
      </template>
      <template v-else>
        <div class="space-y-1.5">
          <el-input v-model="cardName" placeholder="姓名（必填）" size="small" />
          <el-input v-model="cardPhone" placeholder="电话（必填）" size="small" />
          <el-input v-model="cardOrg" placeholder="公司 / 门店名（选填）" size="small" />
          <el-input v-model="cardAddress" placeholder="地址（选填）" size="small" />
        </div>
        <p class="mt-1 text-[11px] text-gray-400">生成后用微信扫一扫，会提示"保存到通讯录"</p>
      </template>

      <div class="mt-2 flex items-center gap-2">
        <span class="text-xs text-gray-500">颜色</span>
        <input v-model="qrColor" type="color" class="h-6 w-8 cursor-pointer rounded border border-gray-200" />
        <el-button
          size="small"
          type="primary"
          class="ml-auto !bg-violet-500 !border-none"
          :loading="generating"
          @click="generateQrcode"
        >
          生成并插入
        </el-button>
      </div>
    </div>

    <p class="mt-4 text-xs text-gray-400">更多图形 / 线条 / 图标组件开发中，敬请期待</p>
  </div>
</template>
