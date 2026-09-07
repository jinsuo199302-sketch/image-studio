<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'
import { saveFile } from '../../../../utils/saveFile'

/**
 * 二维码生成器。纯前端（qrcode 库），内容原样编码——不做"存后端换短链"那套：
 * 桌面版后端是本机 127.0.0.1，换出来的短链别的设备打不开。
 *
 * 关键坑：微信「扫一扫」只认网址，扫到纯文本会直接显示"微信暂不支持展示二维码中的
 * 文本内容"。所以默认就是「网址」模式，逼用户填链接；纯文本单独一个模式并挂红字警告。
 *
 * 生成透明留白 PNG，插入画布后是普通图片，拖角手柄就能改大小；"尺寸"滑块控制导出
 * PNG 的像素分辨率，调大在画布上放大也不糊。
 */
const emit = defineEmits<{ (e: 'insert-image', url: string): void }>()

type Mode = 'url' | 'text' | 'card'
const mode = ref<Mode>('url')
const MODES: { key: Mode; label: string }[] = [
  { key: 'url', label: '网址链接' },
  { key: 'text', label: '纯文本' },
  { key: 'card', label: '电子名片' },
]

const qrUrl = ref('')
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

/** 域名/网址补全：填 "picflowlab.cn/abc" 自动补成 "https://picflowlab.cn/abc" */
function normalizeUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(mailto:|tel:|WEIXIN:)/i.test(s)) return s
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(s)) return 'https://' + s
  return s
}

const normalizedUrl = computed(() => normalizeUrl(qrUrl.value))
const urlLooksValid = computed(() => /^https?:\/\/[^\s]+\.[^\s]+/i.test(normalizedUrl.value))

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

/** 当前要编码进二维码的内容；不合法返回 null 并提示 */
function resolveContent(): string | null {
  if (mode.value === 'card') {
    if (!cardName.value.trim() || !cardPhone.value.trim()) {
      ElMessage.warning('请至少填写姓名和电话')
      return null
    }
    return buildVCard()
  }
  if (mode.value === 'url') {
    if (!normalizedUrl.value) {
      ElMessage.warning('请输入网址')
      return null
    }
    return normalizedUrl.value
  }
  const t = qrText.value.trim()
  if (!t) {
    ElMessage.warning('请输入文本内容')
    return null
  }
  return t
}

async function render(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    width: qrSize.value,
    margin: 4,
    errorCorrectionLevel: ecLevel.value,
    color: { dark: qrColor.value, light: '#ffffff' },
  })
}

async function refreshPreview() {
  let content = ''
  if (mode.value === 'card') {
    if (cardName.value.trim() && cardPhone.value.trim()) content = buildVCard()
  } else if (mode.value === 'url') {
    content = normalizedUrl.value
  } else {
    content = qrText.value.trim()
  }
  previewUrl.value = content ? await render(content) : ''
}
watch(
  [mode, qrUrl, qrText, qrColor, qrSize, ecLevel, cardName, cardPhone, cardOrg, cardAddress],
  () => nextTick(refreshPreview),
)
onMounted(refreshPreview)

async function build(): Promise<string | null> {
  generating.value = true
  try {
    const content = resolveContent()
    if (!content) return null
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
        title="微信「扫一扫」只能打开网址。要让别人扫码跳转，请用「网址链接」填完整链接（公众号文章、报名表单、网站等）"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="flex gap-1.5 px-3 pt-3">
      <button
        v-for="m in MODES"
        :key="m.key"
        class="rounded-full border px-2.5 py-1 text-xs transition"
        :class="mode === m.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m.key"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <template v-if="mode === 'url'">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">网址</label>
          <el-input v-model="qrUrl" placeholder="picflowlab.cn 或 https://mp.weixin.qq.com/s/..." />
          <p v-if="qrUrl.trim() && !urlLooksValid" class="mt-1 text-[11px] text-amber-600">
            这看起来不像网址，确认一下；纯文字请切到「纯文本」模式
          </p>
          <p v-else-if="normalizedUrl && normalizedUrl !== qrUrl.trim()" class="mt-1 text-[11px] text-gray-400">
            将编码为：{{ normalizedUrl }}
          </p>
        </div>
      </template>

      <template v-else-if="mode === 'text'">
        <div
          class="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700"
        >
          ⚠️ 微信「扫一扫」不显示纯文本，会提示"暂不支持展示二维码中的文本内容"。
          纯文本只有支付宝、系统相机、专门的扫码 App 能看到。<br />
          要发给别人扫，请改用「网址链接」。
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">文本内容</label>
          <el-input
            v-model="qrText"
            type="textarea"
            :rows="4"
            placeholder="任意文字、WIFI:S:名称;T:WPA;P:密码;; 等"
          />
        </div>
      </template>

      <template v-else>
        <p class="rounded bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500">
          生成 vCard 电子名片码，微信扫一扫会弹"保存到通讯录"
        </p>
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
