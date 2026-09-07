<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'
import { createSnippetLink } from '../../../../services/snippetApi'
import { saveFile } from '../../../../utils/saveFile'

/**
 * 二维码生成器。
 *
 * 关键事实：微信「扫一扫」只能打开网址，不支持纯文本、vCard 名片、WiFi 码——
 * 扫到这些一律提示"微信暂不支持展示二维码中的文本内容"。所以：
 * - 「网址」模式：直接编码链接，微信扫直接跳
 * - 「扫码看文字」模式：把文字存到 picflowlab.cn 变成一个网页，二维码指向那个网页，
 *   微信扫能打开看到（未备案域名会先弹一次"继续访问"）
 * - 「电子名片」模式：vCard，只有手机相机 / 支付宝扫能存通讯录，微信不认
 */
const emit = defineEmits<{ (e: 'insert-image', url: string): void }>()

type Mode = 'url' | 'page' | 'card'
const mode = ref<Mode>('url')
const MODES: { key: Mode; label: string }[] = [
  { key: 'url', label: '网址链接' },
  { key: 'page', label: '扫码看文字' },
  { key: 'card', label: '电子名片' },
]

const qrUrl = ref('')
const pageText = ref('')
const qrColor = ref('#1f2937')
const qrSize = ref(480)
const ecLevel = ref<'M' | 'H'>('M')
const COLORS = ['#1f2937', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed']

const cardName = ref('')
const cardPhone = ref('')
const cardOrg = ref('')
const cardAddress = ref('')
const cardEmail = ref('')
const cardNote = ref('')

/** vCard 字段值转义：反斜杠/分号/逗号/换行 */
function vEsc(s: string): string {
  return s.trim().replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[;,]/g, (m) => '\\' + m)
}

const previewUrl = ref('')
const generating = ref(false)
/** 「扫码看文字」上次生成的线上链接——内容没变就不重复上传 */
const pageLink = ref('')
const pageLinkFor = ref('')

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

function buildVCard(): string {
  const name = cardName.value.trim()
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:;${vEsc(name)};;;`, `FN:${vEsc(name)}`]
  if (cardOrg.value.trim()) lines.push(`ORG:${vEsc(cardOrg.value)}`)
  if (cardPhone.value.trim()) lines.push(`TEL;TYPE=CELL:${cardPhone.value.trim()}`)
  if (cardEmail.value.trim()) lines.push(`EMAIL:${cardEmail.value.trim()}`)
  if (cardAddress.value.trim()) lines.push(`ADR;TYPE=WORK:;;${vEsc(cardAddress.value)};;;;`)
  if (cardNote.value.trim()) lines.push(`NOTE:${vEsc(cardNote.value)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

async function render(content: string): Promise<string> {
  return QRCode.toDataURL(content, {
    width: qrSize.value,
    margin: 4,
    errorCorrectionLevel: ecLevel.value,
    color: { dark: qrColor.value, light: '#ffffff' },
  })
}

/** 预览：card / url 本地即时渲染；page 模式预览用占位（真链接生成时才上传） */
async function refreshPreview() {
  let content = ''
  if (mode.value === 'card') {
    if (cardName.value.trim() && cardPhone.value.trim()) content = buildVCard()
  } else if (mode.value === 'url') {
    content = normalizedUrl.value
  } else {
    content = pageLink.value && pageLinkFor.value === pageText.value.trim() ? pageLink.value : ''
  }
  previewUrl.value = content ? await render(content) : ''
}
watch(
  [mode, qrUrl, pageText, pageLink, qrColor, qrSize, ecLevel, cardName, cardPhone, cardOrg, cardAddress, cardEmail, cardNote],
  () => nextTick(refreshPreview),
)
onMounted(refreshPreview)

/** 返回最终要编码进二维码的字符串；page 模式会先上传拿线上链接 */
async function resolveContent(): Promise<string | null> {
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
  // page
  const t = pageText.value.trim()
  if (!t) {
    ElMessage.warning('请输入要展示的文字')
    return null
  }
  if (pageLink.value && pageLinkFor.value === t) return pageLink.value
  try {
    const link = await createSnippetLink(t)
    pageLink.value = link
    pageLinkFor.value = t
    return link
  } catch {
    ElMessage.error('生成网页链接失败，请检查网络后重试')
    return null
  }
}

async function build(): Promise<string | null> {
  generating.value = true
  try {
    const content = await resolveContent()
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
        title="微信「扫一扫」只能打开网址。发给别人扫的码，用「网址链接」或「扫码看文字」"
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
            这看起来不像网址；想让人扫码看文字，请切到「扫码看文字」
          </p>
          <p v-else-if="normalizedUrl && normalizedUrl !== qrUrl.trim()" class="mt-1 text-[11px] text-gray-400">
            将编码为：{{ normalizedUrl }}
          </p>
        </div>
        <p class="text-[11px] leading-relaxed text-gray-400">
          微信里最稳的是公众号文章链接（mp.weixin.qq.com）、腾讯问卷/腾讯文档链接、已备案的网站。
        </p>
      </template>

      <template v-else-if="mode === 'page'">
        <div class="rounded-md border border-blue-100 bg-blue-50 px-2.5 py-2 text-[11px] leading-relaxed text-blue-700">
          文字会存到 picflowlab.cn 变成一个网页，二维码指向它，微信扫一扫能打开查看。<br />
          需要联网生成；该域名若未备案，微信会先弹一次"继续访问"再进。
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">要展示的文字</label>
          <el-input
            v-model="pageText"
            type="textarea"
            :rows="5"
            maxlength="2000"
            show-word-limit
            placeholder="活动说明、注意事项、简介… 扫码的人会看到这段文字"
          />
          <p v-if="pageLink && pageLinkFor === pageText.trim()" class="mt-1 break-all text-[11px] text-gray-400">
            链接：{{ pageLink }}
          </p>
        </div>
      </template>

      <template v-else>
        <div class="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700">
          ⚠️ 名片码用<b>手机相机 / 支付宝</b>扫，能一键存通讯录。<b>微信「扫一扫」不支持名片</b>，
          会当成文本提示"暂不支持展示"。要发微信群，请用「扫码看文字」。
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">姓名 *</label>
          <el-input v-model="cardName" placeholder="张伟" maxlength="30" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">电话 *</label>
          <el-input v-model="cardPhone" placeholder="13800000000" maxlength="20" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">单位 / 职务</label>
          <el-input v-model="cardOrg" placeholder="XX公司 · 市场部（选填）" maxlength="40" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">邮箱</label>
          <el-input v-model="cardEmail" placeholder="选填" maxlength="60" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">地址</label>
          <el-input v-model="cardAddress" placeholder="选填" maxlength="80" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">备注</label>
          <el-input v-model="cardNote" type="textarea" :rows="3" maxlength="800" show-word-limit placeholder="选填" />
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
      <p v-else-if="mode === 'page' && pageText.trim()" class="text-center text-[11px] text-gray-400">
        点下面按钮生成（会先上传文字换取链接）
      </p>
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
