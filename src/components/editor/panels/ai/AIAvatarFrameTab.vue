<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import { AVATAR_FRAME_THEMES, renderAvatarFrame } from '../../../../services/avatarFrames'

const fileInput = ref<HTMLInputElement>()
const photoUrl = ref<string | null>(null)
let photoImg: HTMLImageElement | null = null

const activeTheme = ref(AVATAR_FRAME_THEMES[0])
const bannerText = ref(AVATAR_FRAME_THEMES[0].defaultText)
const canvasEl = ref<HTMLCanvasElement>()

function pickTheme(theme: (typeof AVATAR_FRAME_THEMES)[number]) {
  activeTheme.value = theme
  bannerText.value = theme.defaultText
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    photoUrl.value = reader.result as string
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function redraw() {
  if (!photoUrl.value) return
  // canvas 在 v-else 分支里，photoUrl 刚变 truthy 的这一刻 canvas 可能还没挂载完，
  // ref 会是 undefined——必须先等一次 DOM 更新，再去读 canvasEl
  await nextTick()
  if (!canvasEl.value) return
  if (!photoImg || photoImg.src !== photoUrl.value) {
    photoImg = new Image()
    photoImg.src = photoUrl.value
    await new Promise((resolve) => {
      photoImg!.onload = resolve
    })
  }
  renderAvatarFrame(canvasEl.value, photoImg, activeTheme.value, bannerText.value)
}

watch([photoUrl, activeTheme, bannerText], redraw)

function download() {
  if (!canvasEl.value) return
  const a = document.createElement('a')
  a.href = canvasEl.value.toDataURL('image/png')
  a.download = `头像框-${activeTheme.value.key}.png`
  a.click()
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="p-3 pb-0">
      <el-alert title="纯本地生成，边框是代码画的图案，不套用现成素材图库——照片不会上传到服务器" type="info" :closable="false" show-icon />
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

      <div
        v-if="!photoUrl"
        class="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 transition hover:border-violet-400 hover:text-violet-500"
        @click="fileInput?.click()"
      >
        <el-icon :size="24"><UploadFilled /></el-icon>
        <span class="text-xs">上传一张照片，套上节日头像框</span>
      </div>

      <template v-else>
        <div class="flex justify-center">
          <canvas ref="canvasEl" class="max-h-64 w-full max-w-[280px] rounded-lg border border-gray-200 object-contain" />
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">边框主题</label>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="t in AVATAR_FRAME_THEMES"
              :key="t.key"
              class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
              :class="activeTheme.key === t.key ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
              @click="pickTheme(t)"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-gray-600">祝福语（留空则不显示）</label>
          <el-input v-model="bannerText" placeholder="例如：生日快乐" maxlength="8" show-word-limit />
        </div>

        <el-button @click="fileInput?.click()">换一张照片</el-button>
        <el-button type="primary" class="!w-full !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none" @click="download">
          下载
        </el-button>
      </template>
    </div>
  </div>
</template>
