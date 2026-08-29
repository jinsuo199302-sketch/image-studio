<script setup lang="ts">
import { ref, reactive, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close } from '@element-plus/icons-vue'
import { prepareUpload } from '../../../../utils/prepImage'
import { makeStoreZip } from '../../../../utils/storeZip'
import { applyWatermark, loadImageEl, DEFAULT_WM, type WatermarkOpts, type WmLayout } from '../../../../utils/imageWatermark'

const files = ref<{ file: File; url: string }[]>([])
const fileInput = ref<HTMLInputElement>()
const logoInput = ref<HTMLInputElement>()
const busy = ref(false)
const previewUrl = ref('')

const opts = reactive<WatermarkOpts>({ ...DEFAULT_WM })
const logoUrl = ref('')

const LAYOUTS: { key: WmLayout; label: string }[] = [
  { key: 'tile', label: '平铺' },
  { key: 'center', label: '居中' },
  { key: 'tl', label: '左上' },
  { key: 'tr', label: '右上' },
  { key: 'bl', label: '左下' },
  { key: 'br', label: '右下' },
]

async function onPick(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  for (const f of picked) {
    if (files.value.length >= 50) {
      ElMessage.warning('最多 50 张')
      break
    }
    const prepped = await prepareUpload(f)
    files.value.push({ file: prepped, url: URL.createObjectURL(prepped) })
  }
  renderPreview()
}
function removeFile(i: number) {
  URL.revokeObjectURL(files.value[i].url)
  files.value.splice(i, 1)
  renderPreview()
}
async function onLogo(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  const prepped = await prepareUpload(f)
  logoUrl.value = URL.createObjectURL(prepped)
  opts.logo = await loadImageEl(logoUrl.value)
  opts.type = 'image'
  renderPreview()
}

let renderTimer: ReturnType<typeof setTimeout> | undefined
function renderPreview() {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(async () => {
    if (!files.value.length) {
      previewUrl.value = ''
      return
    }
    try {
      const blob = await applyWatermark(files.value[0].file, { ...opts })
      if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = URL.createObjectURL(blob)
    } catch {
      /* ignore preview errors */
    }
  }, 250)
}
watch(opts, renderPreview)

async function download() {
  if (!files.value.length) return
  busy.value = true
  try {
    if (files.value.length === 1) {
      const blob = await applyWatermark(files.value[0].file, { ...opts })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = '水印_' + files.value[0].file.name.replace(/\.\w+$/, '') + (blob.type === 'image/png' ? '.png' : '.jpg')
      a.click()
      URL.revokeObjectURL(a.href)
    } else {
      const entries: { name: string; data: Uint8Array }[] = []
      for (let i = 0; i < files.value.length; i++) {
        const blob = await applyWatermark(files.value[i].file, { ...opts })
        const ext = blob.type === 'image/png' ? 'png' : 'jpg'
        entries.push({
          name: `水印_${String(i + 1).padStart(2, '0')}.${ext}`,
          data: new Uint8Array(await blob.arrayBuffer()),
        })
      }
      const zip = makeStoreZip(entries)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(zip)
      a.download = '加水印.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    }
    ElMessage.success('已导出')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '导出失败')
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  files.value.forEach((f) => URL.revokeObjectURL(f.url))
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert title="给图片加文字/logo 水印，可平铺防盗图。本地处理，不上传" type="info" :closable="false" show-icon />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
      <div
        v-if="!files.length"
        class="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传图片（可多选，最多 50 张，统一加同一个水印）</span>
      </div>

      <template v-else>
        <div v-if="previewUrl" class="overflow-hidden rounded-lg border border-gray-200">
          <img :src="previewUrl" class="max-h-52 w-full object-contain" />
        </div>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="(f, i) in files"
            :key="f.url"
            class="group relative h-12 w-12 overflow-hidden rounded border border-gray-200"
          >
            <img :src="f.url" class="h-full w-full object-cover" />
            <button
              class="absolute right-0 top-0 hidden bg-black/50 text-white group-hover:block"
              @click="removeFile(i)"
            >
              <el-icon :size="12"><Close /></el-icon>
            </button>
          </div>
          <button
            class="h-12 w-12 rounded border border-dashed border-gray-300 text-gray-400 hover:border-violet-400"
            @click="fileInput?.click()"
          >
            +
          </button>
        </div>

        <div class="flex gap-1.5">
          <button
            v-for="t in (['text', 'image'] as const)"
            :key="t"
            class="flex-1 rounded-full border px-2.5 py-1 text-xs transition"
            :class="opts.type === t ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="opts.type = t"
          >
            {{ t === 'text' ? '文字水印' : 'logo 水印' }}
          </button>
        </div>

        <template v-if="opts.type === 'text'">
          <el-input v-model="opts.text" size="small" placeholder="水印文字" />
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-gray-500">颜色</span>
            <input type="color" v-model="opts.color" class="h-7 w-10 rounded border border-gray-200" />
            <el-checkbox v-model="opts.stroke" size="small">描边（花背景上更清晰）</el-checkbox>
          </div>
          <div>
            <label class="text-[11px] text-gray-500">字号 {{ (opts.fontScale * 100).toFixed(1) }}%</label>
            <el-slider v-model="opts.fontScale" :min="0.02" :max="0.12" :step="0.005" :show-tooltip="false" />
          </div>
        </template>
        <template v-else>
          <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogo" />
          <el-button size="small" class="!w-full" @click="logoInput?.click()">
            {{ opts.logo ? '重新选择 logo' : '上传 logo（建议透明 PNG）' }}
          </el-button>
          <div v-if="opts.logo">
            <label class="text-[11px] text-gray-500">logo 大小 {{ (opts.logoScale * 100).toFixed(0) }}%</label>
            <el-slider v-model="opts.logoScale" :min="0.05" :max="0.5" :step="0.01" :show-tooltip="false" />
          </div>
        </template>

        <div>
          <label class="mb-1 block text-[11px] text-gray-500">位置</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="l in LAYOUTS"
              :key="l.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="opts.layout === l.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="opts.layout = l.key"
            >
              {{ l.label }}
            </button>
          </div>
        </div>
        <div>
          <label class="text-[11px] text-gray-500">透明度 {{ Math.round(opts.opacity * 100) }}%</label>
          <el-slider v-model="opts.opacity" :min="0.05" :max="1" :step="0.05" :show-tooltip="false" />
        </div>
        <div>
          <label class="text-[11px] text-gray-500">旋转 {{ opts.rotation }}°</label>
          <el-slider v-model="opts.rotation" :min="-90" :max="90" :step="5" :show-tooltip="false" />
        </div>
        <div v-if="opts.layout === 'tile'">
          <label class="text-[11px] text-gray-500">疏密 {{ opts.gap.toFixed(1) }}</label>
          <el-slider v-model="opts.gap" :min="1" :max="4" :step="0.1" :show-tooltip="false" />
        </div>
      </template>
    </div>

    <div v-if="files.length" class="border-t border-gray-100 p-3">
      <el-button
        type="primary"
        class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
        :loading="busy"
        @click="download"
      >
        {{ files.length > 1 ? `导出 ${files.length} 张（ZIP）` : '导出' }}
      </el-button>
    </div>
  </div>
</template>
