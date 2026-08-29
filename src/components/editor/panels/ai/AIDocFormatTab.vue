<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { formatDoc, getDocTemplates, type DocTemplate } from '../../../../services/pdfApi'
import { extractTextFromImage } from '../../../../services/ocrApi'
import { prepareUpload } from '../../../../utils/prepImage'
import { useAuthStore } from '../../../../stores/auth'

const authStore = useAuthStore()

const source = ref<'text' | 'image'>('text')
const text = ref('')
const title = ref('')
const template = ref('general')
const templates = ref<DocTemplate[]>([
  { key: 'general', label: '通用文档' },
  { key: 'report', label: '工作报告' },
  { key: 'official', label: '公文格式' },
])
const busy = ref(false)
const ocrBusy = ref(false)
const imgInput = ref<HTMLInputElement>()

onMounted(async () => {
  try {
    templates.value = await getDocTemplates()
  } catch {
    // 拿不到就用内置的三个
  }
})

async function onPickImages(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  if (!picked.length) return
  ocrBusy.value = true
  try {
    const parts: string[] = []
    for (const f of picked) {
      const prepped = await prepareUpload(f)
      const dataUrl = await new Promise<string>((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.readAsDataURL(prepped)
      })
      parts.push((await extractTextFromImage(authStore.isAuthenticated, dataUrl)).trim())
    }
    const joined = parts.filter(Boolean).join('\n\n')
    text.value = text.value.trim() ? `${text.value.trim()}\n\n${joined}` : joined
    ElMessage.success(`已提取 ${picked.length} 张图片的文字`)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '文字提取失败')
  } finally {
    ocrBusy.value = false
  }
}

async function run() {
  if (!text.value.trim()) {
    ElMessage.warning('先粘贴或提取要排版的文字')
    return
  }
  busy.value = true
  try {
    const blob = await formatDoc(text.value, template.value, title.value.trim())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.value.trim() || '排版文档'}.docx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('Word 已生成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '排版失败，请重试')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="AI 写的、带 # ** 符号没排版的文字，自动识别标题层级、列表、表格，套正规格式导出 Word。也能直接传文档图片提取文字后排版"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div class="flex gap-1.5">
        <button
          v-for="s in (['text', 'image'] as const)"
          :key="s"
          class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
          :class="source === s ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
          @click="source = s"
        >
          {{ s === 'text' ? '粘贴文字' : '图片提取' }}
        </button>
      </div>

      <div v-if="source === 'image'">
        <input ref="imgInput" type="file" accept="image/*" multiple class="hidden" @change="onPickImages" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          :class="ocrBusy && 'pointer-events-none opacity-60'"
          @click="imgInput?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ ocrBusy ? '识别中…' : '选择文档图片（可多选，多页按顺序）' }}</span>
        </div>
        <p class="mt-1 text-[11px] text-gray-400">提取的文字会填进下面，可再修改后排版</p>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">标题（可选，留空则用正文第一行）</label>
        <el-input v-model="title" size="small" placeholder="如：2026年第一季度工作总结" />
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">格式模板</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in templates"
            :key="t.key"
            class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
            :class="template === t.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="template = t.key"
          >
            {{ t.label }}
          </button>
        </div>
        <p class="mt-1 text-[11px] text-gray-400">
          通用=黑体标题+宋体正文；工作报告/公文=仿宋正文、三号字、分级标题
        </p>
      </div>

      <div>
        <label class="mb-1 block text-xs font-medium text-gray-600">正文内容</label>
        <el-input
          v-model="text"
          type="textarea"
          :rows="12"
          resize="none"
          placeholder="# 一级标题&#10;## 二级标题&#10;- 列表项&#10;正文段落……&#10;&#10;也支持「一、」「（一）」「1.」这种中文写法"
        />
        <p class="mt-1 text-[11px] text-gray-400">{{ text.length }} 字 · 一次最多 20 万字</p>
      </div>
    </div>

    <div class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="busy"
        @click="run"
      >
        排版并导出 Word
      </el-button>
    </div>
  </div>
</template>
