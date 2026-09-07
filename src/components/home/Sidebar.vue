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

const route = useRoute()
const router = useRouter()
const active = ref('home')

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
      @click="router.push('/design/upload')"
    >
      创建设计
    </el-button>

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
