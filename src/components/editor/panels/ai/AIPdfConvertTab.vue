<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Close, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { prepareUpload } from '../../../../utils/prepImage'
import { imagesToPdf, pdfToImages, securePdf, editPdfPages } from '../../../../services/pdfApi'
import { saveFile } from '../../../../utils/saveFile'

type Mode = 'img2pdf' | 'pdf2img' | 'secure' | 'pages'
const mode = ref<Mode>('img2pdf')
const MODES: { key: Mode; label: string }[] = [
  { key: 'img2pdf', label: '图片转PDF' },
  { key: 'pdf2img', label: 'PDF转图片' },
  { key: 'secure', label: '加密/解密' },
  { key: 'pages', label: '页面管理' },
]

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

// ---- 图片转 PDF ----
const imgs = ref<{ file: File; url: string }[]>([])
const imgInput = ref<HTMLInputElement>()
const pageSize = ref<'auto' | 'a4'>('auto')
async function pickImgs(e: Event) {
  const picked = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  for (const f of picked) {
    if (imgs.value.length >= 100) {
      ElMessage.warning('最多 100 张')
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

// ---- PDF 转图片 ----
const pdf2imgFile = ref<File | null>(null)
const outFmt = ref<'png' | 'jpg'>('png')
const dpi = ref(150)

// ---- 加密/解密 ----
const secureFile = ref<File | null>(null)
const secureMode = ref<'encrypt' | 'decrypt'>('encrypt')
const password = ref('')

// ---- 页面管理 ----
const pagesFile = ref<File | null>(null)
const pagesOp = ref<'delete' | 'extract' | 'rotate'>('delete')
const pagesRange = ref('')
const rotateAngle = ref<90 | 180 | 270>(90)

function pickPdf(e: Event, target: (f: File) => void) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (f) target(f)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert
        title="图片↔PDF、加密解密、删页/旋转/提取——全部本地处理，不上传第三方"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="flex flex-wrap gap-1.5 px-3 pt-3">
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
      <!-- 图片转 PDF -->
      <template v-if="mode === 'img2pdf'">
        <input ref="imgInput" type="file" accept="image/*" multiple class="hidden" @change="pickImgs" />
        <div
          class="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="imgInput?.click()"
        >
          <el-icon :size="22"><UploadFilled /></el-icon>
          <span class="text-xs">选择图片，按顺序合成一个 PDF（可多选，最多 100 张）</span>
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

        <div v-if="imgs.length">
          <label class="mb-1 block text-xs font-medium text-gray-600">页面尺寸</label>
          <div class="flex gap-1.5">
            <button
              class="rounded-full border px-2.5 py-0.5 text-[11px]"
              :class="pageSize === 'auto' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="pageSize = 'auto'"
            >
              贴合图片
            </button>
            <button
              class="rounded-full border px-2.5 py-0.5 text-[11px]"
              :class="pageSize === 'a4' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="pageSize = 'a4'"
            >
              A4 白底居中
            </button>
          </div>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!imgs.length"
          @click="run(() => imagesToPdf(imgs.map((x) => x.file), pageSize), 'images.pdf', 'PDF 已生成')"
        >
          生成 PDF
        </el-button>
      </template>

      <!-- PDF 转图片 -->
      <template v-else-if="mode === 'pdf2img'">
        <input type="file" accept="application/pdf" class="hidden" ref="p2iInput" @change="(e) => pickPdf(e, (f) => (pdf2imgFile = f))" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="($refs.p2iInput as HTMLInputElement)?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ pdf2imgFile ? pdf2imgFile.name : '选择 PDF（最多 60 页）' }}</span>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">格式</label>
          <div class="flex gap-1.5">
            <button
              v-for="f in (['png', 'jpg'] as const)"
              :key="f"
              class="rounded-full border px-2.5 py-0.5 text-[11px] uppercase"
              :class="outFmt === f ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="outFmt = f"
            >
              {{ f }}
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">清晰度 {{ dpi }} dpi</label>
          <el-slider v-model="dpi" :min="72" :max="300" :step="6" :show-tooltip="false" />
          <p class="mt-1 text-[11px] text-gray-400">150 够日常看，300 接近打印质量、文件更大</p>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!pdf2imgFile"
          @click="run(() => pdfToImages(pdf2imgFile!, outFmt, dpi), 'pages.zip', '图片已打包')"
        >
          转成图片（ZIP）
        </el-button>
      </template>

      <!-- 加密 / 解密 -->
      <template v-else-if="mode === 'secure'">
        <div class="flex gap-1.5">
          <button
            class="flex-1 rounded-full border px-2.5 py-1 text-xs"
            :class="secureMode === 'encrypt' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="secureMode = 'encrypt'"
          >
            加密码
          </button>
          <button
            class="flex-1 rounded-full border px-2.5 py-1 text-xs"
            :class="secureMode === 'decrypt' ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="secureMode = 'decrypt'"
          >
            去密码
          </button>
        </div>

        <input type="file" accept="application/pdf" class="hidden" ref="secInput" @change="(e) => pickPdf(e, (f) => (secureFile = f))" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="($refs.secInput as HTMLInputElement)?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ secureFile ? secureFile.name : '选择 PDF' }}</span>
        </div>

        <el-input v-model="password" :placeholder="secureMode === 'encrypt' ? '设置打开密码' : '输入当前密码'" size="small" show-password />
        <p v-if="secureMode === 'decrypt'" class="text-[11px] text-gray-400">只能去掉你自己知道密码的 PDF，不是破解工具</p>

        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!secureFile || !password"
          @click="run(() => securePdf(secureFile!, secureMode, password), secureMode === 'encrypt' ? 'encrypted.pdf' : 'decrypted.pdf', secureMode === 'encrypt' ? '已加密' : '已去掉密码')"
        >
          {{ secureMode === 'encrypt' ? '加密并下载' : '去掉密码并下载' }}
        </el-button>
      </template>

      <!-- 页面管理 -->
      <template v-else>
        <input type="file" accept="application/pdf" class="hidden" ref="pgInput" @change="(e) => pickPdf(e, (f) => (pagesFile = f))" />
        <div
          class="flex h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
          @click="($refs.pgInput as HTMLInputElement)?.click()"
        >
          <el-icon :size="20"><UploadFilled /></el-icon>
          <span class="text-xs">{{ pagesFile ? pagesFile.name : '选择 PDF' }}</span>
        </div>

        <div class="flex gap-1.5">
          <button
            v-for="o in ([['delete', '删除页'], ['extract', '只保留'], ['rotate', '旋转页']] as const)"
            :key="o[0]"
            class="flex-1 rounded-full border px-2 py-1 text-[11px]"
            :class="pagesOp === o[0] ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="pagesOp = o[0]"
          >
            {{ o[1] }}
          </button>
        </div>

        <el-input v-model="pagesRange" placeholder="页码，如 1,3,5-8" size="small" />

        <div v-if="pagesOp === 'rotate'">
          <label class="mb-1 block text-xs font-medium text-gray-600">旋转角度</label>
          <div class="flex gap-1.5">
            <button
              v-for="a in ([90, 180, 270] as const)"
              :key="a"
              class="rounded-full border px-2.5 py-0.5 text-[11px]"
              :class="rotateAngle === a ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="rotateAngle = a"
            >
              {{ a }}°
            </button>
          </div>
        </div>

        <el-button
          type="primary"
          class="!w-full !bg-violet-500 !border-none"
          :loading="busy"
          :disabled="!pagesFile || !pagesRange.trim()"
          @click="run(() => editPdfPages(pagesFile!, pagesOp, pagesRange, rotateAngle), `${pagesOp}.pdf`, '已处理')"
        >
          处理并下载
        </el-button>
      </template>
    </div>
  </div>
</template>
