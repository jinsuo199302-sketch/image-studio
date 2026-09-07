<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'
import { saveFile } from '../../../../utils/saveFile'

/**
 * 二维码生成器。纯前端（qrcode 库），内容原样编码——不做"存后端换短链"那套：
 * 桌面版的后端是本机 127.0.0.1，换出来的短链别的设备根本打不开。
 * 想让微信「扫一扫」直接跳转，让用户自己填完整网址即可。
 * 生成透明留白 PNG，插入画布后是普通图片，拖角手柄就能改大小；"尺寸"滑块控制导出
 * PNG 的像素分辨率，调大在画布上放大也不糊。
 */
const emit = defineEmits<{ (e: 'insert-image', url: string): void }>()

type Mode = 'text' | 'card'
const mode = ref<Mode>('text')

const qrText = ref('')
const qrColor = ref('#1f2937')
const qrSize = ref(480)
const ecLevel = ref<'M' | 'H'>('M')
const COLORS = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed']

const cardName = ref('')
const cardPhone = ref('')
const cardOrg = ref('')
const cardAddress = ref('')

const previewUrl = ref('')
const generating = ref(false)

/** 微信扫一扫不识别纯文本，但识别 vCard——扫完能"保存到通讯录" */
function buildVCard(): string {
  const name = cardName.value.trim()
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:;${name};;;`, `FN:${name}`]
  if (cardOrg.value.trim()) lines.push(`ORG:${cardOrg.value.trim()}`)
  if (cardPhone.value.trim()) lines.push(`TEL;TYPE=CELL:${cardPhone.value.trim()}`)
  if (cardAddress.value.trim()) lines.push(`ADR;TYPE=WORK:;;${cardAddress.value.trim()};;;;`)
  lines.push('END:VCARD')
  return lines.join('\n')
}

/** 是否是"手机扫码能直接跳转"的内容（完整网址 / 电话 / 邮件等 scheme） */
function isActionableUri(s: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|smsto:|WEIXIN:|upi:\/\/|HTTP)/i.test(s)
}

/** 拿到要编码进二维码的最终内容——原样返回，不做短链转换 */
function resolveContent(): string | null {
  if (mode.value === 'card') {
    if (!cardName.value.trim() || !cardPhone.value.trim()) {
      ElMessage.warning('请至少填写姓名和电话')
      return null
    }
    return buildVCard()
  }
  const input = qrText.value.trim()
  if (!input) {
    ElMessage.warning('请输入链接或文本内容')
    return null
  }
  return input
}

async function render(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    width: qrSize.value,
    margin: 3,
    errorCorrectionLevel: ecLevel.value,
    color: { dark: qrColor.value, light: '#ffffff' },
  })
}

/** 预览用：本地直接编码当前输入（纯文本的短链转换留到真正生成时做，预览只求即时反馈） */
async function refreshPreview() {
  let content = ''
  if (mode.value === 'card') {
    if (cardName.value.trim() && cardPhone.value.trim()) content = buildVCard()
  } else {
    content = qrText.value.trim()
  }
  previewUrl.value = content ? await render(content) : ''
}
watch([mode, qrText, qrColor, qrSize, ecLevel, cardName, cardPhone, cardOrg, cardAddress], () =>
  nextTick(refreshPreview),
)
onMounted(refreshPreview)

async function build(): Promise<string | null> {
  generating.value = true
  try {
    const content = resolveContent()
    if (!content) return null
    if (mode.value === 'text' && !isActionableUri(content)) {
      ElMessage.info('已按纯文本编码——微信扫一扫只会显示文字，想直接跳转请填完整网址（https://…）')
    }
    return await render(content)
  } catch {
    ElMessage.error('二维码生成失败，请检查输入内容')
    return null
  } finally {
    generating.value = false
  }
}

async function insertToCanvas() {
  const url = await build()
  if (url) emit('insert-image', url)
}
async function download() {
  const url = await build()
  if (url) saveFile('二维码.png', url)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="内容原样编码。想让微信扫一扫能直接打开，请填完整网址（https://…）；纯文字扫出来只显示文本"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="flex gap-1.5 px-3 pt-3">
      <button
        v-for="m in [
          { key: 'text', label: '链接 / 文字' },
          { key: 'card', label: '电子名片' },
        ]"
        :key="m.key"
        class="rounded-full border px-2.5 py-1 text-xs transition"
        :class="mode === m.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m.key as Mode"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <template v-if="mode === 'text'">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">链接或文字内容</label>
          <el-input
            v-model="qrText"
            type="textarea"
            :rows="3"
            placeholder="https://picflowlab.cn&#10;或公众号链接、表单链接、一段文字…"
          />
        </div>
      </template>

      <template v-else>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">姓名 *</label>
          <el-input v-model="cardName" placeholder="张伟" maxlength="20" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">电话 *</label>
          <el-input v-model="cardPhone" placeholder="13800000000" maxlength="20" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">单位 / 职务</label>
          <el-input v-model="cardOrg" placeholder="XX公司 · 市场部" maxlength="40" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">地址</label>
          <el-input v-model="cardAddress" placeholder="选填" maxlength="60" />
        </div>
      </template>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">颜色</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="c in COLORS"
            :key="c"
            class="h-6 w-6 rounded-full border-2 transition"
            :class="qrColor === c ? 'border-violet-500' : 'border-transparent'"
            :style="{ background: c }"
            @click="qrColor = c"
          />
        </div>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">尺寸 {{ qrSize }}px</label>
        <el-slider v-model="qrSize" :min="200" :max="1200" :step="20" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">容错级别</label>
        <div class="flex gap-1.5">
          <button
            v-for="l in [
              { key: 'M', label: '标准' },
              { key: 'H', label: '高（可裁切 / 加 logo）' },
            ]"
            :key="l.key"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="ecLevel === l.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="ecLevel = l.key as 'M' | 'H'"
          >
            {{ l.label }}
          </button>
        </div>
      </div>

      <div
        v-if="previewUrl"
        class="rounded-lg border border-gray-200 bg-[conic-gradient(#f3f4f6_0deg_90deg,#fff_90deg_180deg,#f3f4f6_180deg_270deg,#fff_270deg_360deg)] [background-size:14px_14px] p-2"
      >
        <img :src="previewUrl" class="mx-auto max-h-44 object-contain" />
      </div>
    </div>

    <div class="space-y-2 border-t border-gray-100 p-3">
      <el-button class="!w-full" :loading="generating" @click="insertToCanvas">插入画布</el-button>
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="generating"
        @click="download"
      >
        下载 PNG
      </el-button>
    </div>
  </div>
</template>
