<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { textToPptx, imagesToPptx } from '../../../../services/pdfApi'
import { prepareUpload } from '../../../../utils/prepImage'

type Mode = 'text' | 'image'
const mode = ref<Mode>('text')
const busy = ref(false)

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
async function run(fn: () => Promise<Blob>, name: string) {
  busy.value = true
  try {
    saveBlob(await fn(), name)
    ElMessage.success('PPT 已生成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '生成失败，请重试')
  } finally {
    busy.value = false
  }
}

const text = ref('')
const title = ref('')

const imgs = ref<{ file: File; url: string }[]>([])
const imgInput = ref<HTMLInputElement>()
async function pickImgs(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  for (const f of picked) {
    if (imgs.value.length >= 60) {
      ElMessage.warning('最多 60 张')
      break
    }
    const prepped = await prepareUpload(f)
    imgs.value.push({ file: prepped, url: URL.createObjectURL(prepped) })
  }
}
function moveImg(i: number, d: -1 | 1) {
  const j = i + d
  if (j < 0 || j >= imgs.value.length) return
  ;[imgs.value[i], imgs.value[j]] = [imgs.value[j], imgs.value[i]]
}
function rmImg(i: number) {
  URL.revokeObjectURL(imgs.value[i].url)
  imgs.value.splice(i, 1)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="把大纲文字或一组图片做成 PPT。本地生成，不调模型。（PPT 转 PDF 暂未支持）"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="flex gap-1.5 px-3 pt-3">
      <button
        v-for="m in (['text', 'image'] as const)"
        :key="m"
        class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
        :class="mode === m ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
        @click="mode = m"
      >
        {{ m === 'text' ? '文字转PPT' : '图片转PPT' }}
      </button>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <template v-if="mode === 'text'">
        <el-input v-model="title" size="small" placeholder="演示标题（可选）" />
        <el-input
          v-model="text"
          type="textarea"
          :rows="12"
          resize="none"
          placeholder="# 演示标题&#10;&#10;## 第一部分&#10;- 要点一&#10;- 要点二&#10;&#10;## 第二部分&#10;..."
        />
        <p class="text-[11px] text-gray-400">一级标题（# 或「一、」）= 一页，其下的段落/条目 = 该页要点</p>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!text.trim()"
          @click="run(() => textToPptx(text, title.trim()), 'outline.pptx')"
        >
          生成 PPT
        </el-button>
      </template>

      <template v-else>
        <input ref="imgInput" type="file" accept="image/*" multiple class="hidden" @change="pickImgs" />
        <div
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="imgInput?.click()"
        >
          <el-icon :size="22"><UploadFilled /></el-icon>
          <span class="text-xs">选择图片，每张一页（可多选，最多 60 张）</span>
        </div>
        <div v-if="imgs.length" class="grid grid-cols-3 gap-2">
          <div v-for="(p, i) in imgs" :key="p.url" class="group relative overflow-hidden rounded-md border border-gray-200">
            <img :src="p.url" class="h-24 w-full object-cover" />
            <div class="absolute inset-x-0 top-0 flex justify-between bg-black/40 px-1 py-0.5 opacity-0 transition group-hover:opacity-100">
              <span class="text-[11px] text-white">{{ i + 1 }}</span>
              <div class="flex gap-1">
                <button class="text-white disabled:opacity-30" :disabled="i === 0" @click="moveImg(i, -1)">
                  <el-icon :size="12"><ArrowUp /></el-icon>
                </button>
                <button class="text-white disabled:opacity-30" :disabled="i === imgs.length - 1" @click="moveImg(i, 1)">
                  <el-icon :size="12"><ArrowDown /></el-icon>
                </button>
                <button class="text-white hover:text-red-300" @click="rmImg(i)">
                  <el-icon :size="12"><Close /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!imgs.length"
          @click="run(() => imagesToPptx(imgs.map((x) => x.file)), 'slides.pptx')"
        >
          生成 PPT
        </el-button>
      </template>
    </div>
  </div>
</template>
