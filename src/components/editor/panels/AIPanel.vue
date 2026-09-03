<script setup lang="ts">
import { ref } from 'vue'
import { logView } from '../../../services/analytics'
import AIImageTab from './ai/AIImageTab.vue'
import AIWriteTab from './ai/AIWriteTab.vue'
import AITranslateTab from './ai/AITranslateTab.vue'
import AIPdfTab from './ai/AIPdfTab.vue'
import AIPdfConvertTab from './ai/AIPdfConvertTab.vue'
import AIDocFormatTab from './ai/AIDocFormatTab.vue'
import AIPptTab from './ai/AIPptTab.vue'
import AIExcelTab from './ai/AIExcelTab.vue'
import AIConvertTab from './ai/AIConvertTab.vue'
import AICalcTab from './ai/AICalcTab.vue'
import AIImageWatermarkTab from './ai/AIImageWatermarkTab.vue'
import AICutoutTab from './ai/AICutoutTab.vue'
import AIEraseTab from './ai/AIEraseTab.vue'
import AITextReplaceTab from './ai/AITextReplaceTab.vue'
import AIOcrTab from './ai/AIOcrTab.vue'
import AIIdPhotoTab from './ai/AIIdPhotoTab.vue'
import AIMemorialPhotoTab from './ai/AIMemorialPhotoTab.vue'
import AIColorizeTab from './ai/AIColorizeTab.vue'
import AIScreenshotStitchTab from './ai/AIScreenshotStitchTab.vue'
import AIAvatarFrameTab from './ai/AIAvatarFrameTab.vue'
import AISignatureTab from './ai/AISignatureTab.vue'
import AIScanTab from './ai/AIScanTab.vue'
import AITableTab from './ai/AITableTab.vue'
import AICompressTab from './ai/AICompressTab.vue'

type TabKey =
  | 'image'
  | 'write'
  | 'translate'
  | 'pdf'
  | 'pdfconvert'
  | 'docformat'
  | 'ppt'
  | 'excel'
  | 'convert'
  | 'calc'
  | 'imgwatermark'
  | 'cutout'
  | 'erase'
  | 'textreplace'
  | 'ocr'
  | 'idphoto'
  | 'memorial'
  | 'colorize'
  | 'stitch'
  | 'avatarframe'
  | 'signature'
  | 'scan'
  | 'table'
  | 'compress'

const props = defineProps<{ selectedText: string | null; initialTab?: TabKey }>()
const emit = defineEmits<{
  (e: 'insert-image', url: string): void
  (e: 'insert-text', text: string): void
  (e: 'replace-selected-text', text: string): void
}>()

const activeTab = ref<TabKey>(props.initialTab ?? 'image')
logView('tab:' + activeTab.value)
function pickTab(key: string) {
  activeTab.value = key as TabKey
  logView('tab:' + key)
}

// 「签名」→「PDF 签名」的跨 tab 交接：签名 tab 生成的 PNG 直接塞进 PDF tab 的签名流程，
// 不用先下载再上传
const pdfPresetSignature = ref<string | null>(null)
function useSignatureInPdf(dataUrl: string) {
  pdfPresetSignature.value = dataUrl
  activeTab.value = 'pdf'
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex overflow-x-auto border-b border-gray-100 px-2 pt-2">
      <button
        v-for="tab in [
          { key: 'image', label: '生图' },
          { key: 'write', label: '文案' },
          { key: 'translate', label: '翻译' },
          { key: 'pdf', label: 'PDF' },
          { key: 'pdfconvert', label: 'PDF转换' },
          { key: 'docformat', label: '排版Word' },
          { key: 'ppt', label: 'PPT' },
          { key: 'excel', label: 'Excel' },
          { key: 'convert', label: '数字拼音' },
          { key: 'calc', label: '计算器' },
          { key: 'imgwatermark', label: '图片水印' },
          { key: 'cutout', label: '抠图' },
          { key: 'erase', label: '消除' },
          { key: 'textreplace', label: '改字' },
          { key: 'ocr', label: '提字' },
          { key: 'idphoto', label: '证件照' },
          { key: 'memorial', label: '黑白遗像' },
          { key: 'colorize', label: '老照片上色' },
          { key: 'stitch', label: '长截图' },
          { key: 'avatarframe', label: '头像框' },
          { key: 'signature', label: '签名' },
          { key: 'scan', label: '扫描件' },
          { key: 'table', label: '表格识别' },
          { key: 'compress', label: '压缩转换' },
        ]"
        :key="tab.key"
        class="flex-1 shrink-0 rounded-t-md px-1 py-2 text-xs transition"
        :class="
          activeTab === tab.key
            ? 'border-b-2 border-violet-500 font-medium text-violet-600'
            : 'text-gray-500 hover:text-gray-700'
        "
        @click="pickTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1">
      <AIImageTab v-if="activeTab === 'image'" @insert="(url) => emit('insert-image', url)" />
      <AIWriteTab v-else-if="activeTab === 'write'" @insert="(text) => emit('insert-text', text)" />
      <AITranslateTab
        v-else-if="activeTab === 'translate'"
        :selected-text="selectedText"
        @insert="(text) => emit('insert-text', text)"
        @replace-selected="(text) => emit('replace-selected-text', text)"
      />
      <AIPdfTab v-else-if="activeTab === 'pdf'" :preset-signature="pdfPresetSignature" />
      <AIPdfConvertTab v-else-if="activeTab === 'pdfconvert'" />
      <AIDocFormatTab v-else-if="activeTab === 'docformat'" />
      <AIPptTab v-else-if="activeTab === 'ppt'" />
      <AIExcelTab v-else-if="activeTab === 'excel'" />
      <AIConvertTab v-else-if="activeTab === 'convert'" />
      <AICalcTab v-else-if="activeTab === 'calc'" />
      <AIImageWatermarkTab v-else-if="activeTab === 'imgwatermark'" />
      <AICutoutTab v-else-if="activeTab === 'cutout'" />
      <AIEraseTab v-else-if="activeTab === 'erase'" />
      <AITextReplaceTab v-else-if="activeTab === 'textreplace'" />
      <AIOcrTab v-else-if="activeTab === 'ocr'" />
      <AIIdPhotoTab v-else-if="activeTab === 'idphoto'" />
      <AIMemorialPhotoTab v-else-if="activeTab === 'memorial'" />
      <AIColorizeTab v-else-if="activeTab === 'colorize'" @insert-image="(url) => emit('insert-image', url)" />
      <AIScreenshotStitchTab v-else-if="activeTab === 'stitch'" />
      <AIAvatarFrameTab v-else-if="activeTab === 'avatarframe'" />
      <AISignatureTab
        v-else-if="activeTab === 'signature'"
        @insert-image="(url) => emit('insert-image', url)"
        @use-in-pdf="useSignatureInPdf"
      />
      <AIScanTab v-else-if="activeTab === 'scan'" />
      <AITableTab v-else-if="activeTab === 'table'" />
      <AICompressTab v-else />
    </div>
  </div>
</template>
