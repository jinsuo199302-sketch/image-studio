<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Plus,
  HomeFilled,
  MagicStick,
  UploadFilled,
  Grid,
  UserFilled,
  Location,
} from '@element-plus/icons-vue'
import { prepareUpload } from '../../utils/prepImage'
import { PAPER_SIZES, paperDims, type Orientation } from '../../data/paperSizes'

const route = useRoute()
const router = useRouter()
const active = ref('home')

const newDialogOpen = ref(false)
const newOrientation = ref<Orientation>('portrait')

function startBlank(w: number, h: number) {
  try {
    sessionStorage.setItem('pendingCanvasSize', JSON.stringify({ w, h }))
  } catch {
    /* 存不下就用编辑器默认尺寸 */
  }
  sessionStorage.removeItem('pendingUploadImage')
  newDialogOpen.value = false
  router.push('/design/upload')
}

function pickPaper(key: string) {
  const p = PAPER_SIZES.find((s) => s.key === key)
  if (!p) return
  const { width, height } = paperDims(p, newOrientation.value)
  startBlank(width, height)
}

const NAV = [
  { key: 'home', label: '首页', icon: HomeFilled },
  { key: 'ai', label: 'AI 设计', icon: MagicStick, comingSoon: true },
  { key: 'templates', label: '模板中心', icon: Grid },
]

const uploadInput = ref<HTMLInputElement>()

/** 上传一张现成的图（豆包生成的手抄报之类）→ 新建一个跟图同尺寸的画布，把图放上去，
 * 进编辑器后就能用「拆成可编辑元素」「AI 局部改图」「文字替换」等工具改它 */
async function onUploadPick(e: Event) {
  const raw = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!raw) return
  if (raw.size > 30 * 1024 * 1024) {
    ElMessage.error('图片超过 30MB，请先压缩')
    return
  }
  // 缩到 2400px 内 + 转 JPEG，免得 sessionStorage 存不下
  const file = await prepareUpload(raw, { maxSide: 2400, maxBytes: 3 * 1024 * 1024, quality: 0.88 })
  const reader = new FileReader()
  reader.onload = () => {
    const src = reader.result as string
    const img = new Image()
    img.onload = () => {
      try {
        sessionStorage.setItem(
          'pendingUploadImage',
          JSON.stringify({ src, w: img.naturalWidth || 1480, h: img.naturalHeight || 1050 }),
        )
        router.push('/design/upload')
      } catch {
        ElMessage.error('图片太大，浏览器存不下，换张小一点的')
      }
    }
    img.onerror = () => ElMessage.error('这张图打不开，换一张')
    img.src = src
  }
  reader.readAsDataURL(file)
}
</script>

<template>
  <aside class="flex w-44 shrink-0 flex-col gap-1 border-r border-gray-200 bg-white p-3">
    <input ref="uploadInput" type="file" accept="image/*" class="hidden" @change="onUploadPick" />

    <el-button
      type="primary"
      class="!mb-3 !w-full !justify-start !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
      :icon="Plus"
      @click="newDialogOpen = true"
    >
      创建设计
    </el-button>

    <el-dialog v-model="newDialogOpen" title="新建设计 · 选纸张" width="440px">
      <div class="mb-3 flex items-center justify-between">
        <span class="text-xs font-medium text-gray-600">方向</span>
        <div class="flex items-center gap-1">
          <button
            class="rounded px-2 py-0.5 text-[11px] transition"
            :class="newOrientation === 'portrait' ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
            @click="newOrientation = 'portrait'"
          >
            竖版
          </button>
          <button
            class="rounded px-2 py-0.5 text-[11px] transition"
            :class="newOrientation === 'landscape' ? 'bg-violet-50 text-violet-600' : 'text-gray-500 hover:bg-gray-100'"
            @click="newOrientation = 'landscape'"
          >
            横版
          </button>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-1.5">
        <button
          v-for="p in PAPER_SIZES"
          :key="p.key"
          class="rounded-md border border-gray-200 px-2 py-2 text-center text-[11px] text-gray-600 transition hover:border-violet-400 hover:text-violet-600"
          @click="pickPaper(p.key)"
        >
          {{ p.label }}
        </button>
      </div>
      <button
        class="mt-3 w-full rounded-md border border-dashed border-gray-300 py-2 text-xs text-gray-500 transition hover:border-violet-400 hover:text-violet-600"
        @click="startBlank(1480, 1050)"
      >
        空白画布（1480 × 1050）
      </button>
    </el-dialog>

    <button
      v-for="item in NAV"
      :key="item.key"
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
      :class="
        active === item.key
          ? 'bg-violet-50 font-medium text-violet-600'
          : 'text-gray-600 hover:bg-gray-100'
      "
      @click="active = item.key"
    >
      <el-icon :size="16"><component :is="item.icon" /></el-icon>
      {{ item.label }}
      <el-tag v-if="item.comingSoon" size="small" type="info" class="ml-auto scale-90">敬请期待</el-tag>
    </button>

    <button
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-100"
      @click="uploadInput?.click()"
    >
      <el-icon :size="16"><UploadFilled /></el-icon>
      上传图片编辑
    </button>

    <div class="my-2 border-t border-gray-100" />

    <button
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
      :class="
        route.path === '/mine'
          ? 'bg-violet-50 font-medium text-violet-600'
          : 'text-gray-600 hover:bg-gray-100'
      "
      @click="router.push('/mine')"
    >
      <el-icon :size="16"><UserFilled /></el-icon>
      我的
    </button>
    <button
      class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
    >
      <el-icon :size="16"><Location /></el-icon>
      区域合作
    </button>
  </aside>
</template>
