<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatDoc, getDocTemplates, type DocTemplate } from '../../../../services/pdfApi'

const text = ref('')
const title = ref('')
const template = ref('general')
const templates = ref<DocTemplate[]>([
  { key: 'general', label: '通用文档' },
  { key: 'report', label: '工作报告' },
  { key: 'official', label: '公文格式' },
])
const busy = ref(false)

onMounted(async () => {
  try {
    templates.value = await getDocTemplates()
  } catch {
    // 拿不到就用内置的三个
  }
})

async function run() {
  if (!text.value.trim()) {
    ElMessage.warning('先粘贴要排版的文字')
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
        title="把豆包/DeepSeek 等 AI 写的、带 # ** 符号没排版的文字粘进来，自动识别标题层级、列表、表格，套正规格式导出 Word"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
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
