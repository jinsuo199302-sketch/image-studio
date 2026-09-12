<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { composeDeck, type DeckOutline, type DeckTheme } from '../../deck/templates'
import { slidesToPptx, type VideoAttachment } from '../../deck/toPptx'
import { saveFile } from '../../utils/saveFile'
import type { DeckOutlineRaw } from '../../services/designApi'

const props = defineProps<{
  outline: DeckOutlineRaw
  themeKey: string
  bg?: { cover?: string; content?: string; section?: string } | null
}>()

const FALLBACK: Record<string, string[]> = {
  red: ['#b01f24', '#d99b2b', '#8c1519', '#f6f3ee', '#2b2b2b'],
  blue: ['#1f5fa8', '#e0a52b', '#123c6b', '#f5f7fa', '#2b2b2b'],
  green: ['#2f7d55', '#e0a52b', '#1f5c3d', '#f4f7f5', '#2b2b2b'],
  purple: ['#6b4ea8', '#e0a52b', '#463079', '#f6f4fa', '#2b2b2b'],
  slate: ['#37506b', '#c98a3c', '#243447', '#f4f6f8', '#2b2b2b'],
  teal: ['#1f7a72', '#e0a52b', '#134b46', '#f2f7f6', '#2b2b2b'],
  techblue: ['#1a3f7a', '#2f7de0', '#0d2951', '#f3f6fb', '#232a33'],
  geoblue: ['#12579e', '#3aa0e0', '#0c3b6b', '#f4f8fc', '#233240'],
}
/** 纯几何图形装饰风的主题 key */
const GEO_KEYS = new Set(['geoblue'])

const theme = computed<DeckTheme>(() => {
  const geo = GEO_KEYS.has(props.themeKey)
  const p =
    props.outline.palette && props.outline.palette.length >= 5
      ? props.outline.palette
      : FALLBACK[props.themeKey] || FALLBACK.red
  return {
    primary: p[0],
    accent: p[1],
    primaryDk: p[2],
    paper: p[3],
    ink: p[4],
    style: geo ? 'geo' : 'plain',
  }
})

const composed = computed(() => {
  const o: DeckOutline = {
    title: props.outline.title,
    subtitle: props.outline.subtitle,
    theme: theme.value,
    sections: props.outline.sections || [],
    bg: props.bg ?? null,
    coverImage: props.outline.cover_image,
    coverFeatures: props.outline.cover_features,
    style_hint: props.outline.style_hint,
  }
  return composeDeck(o)
})

const wrapRef = ref<HTMLElement>()
const stageRef = ref<HTMLElement>()
const scale = ref(0.25)
let ro: ResizeObserver | null = null

onMounted(() => {
  ro = new ResizeObserver(() => {
    if (wrapRef.value) scale.value = wrapRef.value.clientWidth / 1280
  })
  if (wrapRef.value) ro.observe(wrapRef.value)
})
onBeforeUnmount(() => ro?.disconnect())

const busy = ref(false)

// 插入视频：跟大纲内容无关的手动挂件，导出前选"第几页 + 本地视频/YouTube 链接"
interface VideoItem extends VideoAttachment {
  label: string
}
const videos = ref<VideoItem[]>([])
const videoSlideNo = ref(1)
const videoMode = ref<'file' | 'online'>('file')
const videoUrl = ref('')
const videoInput = ref<HTMLInputElement>()
const videoBusy = ref(false)

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })
}
async function pickVideoFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  if (f.size > 60 * 1024 * 1024) {
    ElMessage.warning('视频最大 60MB（要以 base64 塞进 pptx，太大会导致文件巨大、卡顿）')
    return
  }
  videoBusy.value = true
  try {
    const data = await readAsDataUrl(f)
    videos.value.push({ slideIndex: videoSlideNo.value - 1, kind: 'file', src: data, label: f.name })
    ElMessage.success('已添加，下载时会一起打进 pptx')
  } catch {
    ElMessage.error('视频读取失败')
  } finally {
    videoBusy.value = false
  }
}
function addVideoLink() {
  const url = videoUrl.value.trim()
  if (!url) return
  videos.value.push({ slideIndex: videoSlideNo.value - 1, kind: 'online', src: url, label: url })
  videoUrl.value = ''
}
function rmVideo(i: number) {
  videos.value.splice(i, 1)
}

async function download() {
  const stage = stageRef.value
  if (!stage) return
  busy.value = true
  try {
    const els = Array.from(stage.querySelectorAll<HTMLElement>('.slide'))
    const blob = await slidesToPptx(
      els,
      props.outline.title,
      videos.value.map(({ slideIndex, kind, src }) => ({ slideIndex, kind, src })),
    )
    await saveFile(`${props.outline.title || '演示文稿'}.pptx`, blob)
    ElMessage.success('PPTX 已导出')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '导出失败')
  } finally {
    busy.value = false
  }
}

defineExpose({ download })
</script>

<template>
  <div ref="wrapRef">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-gray-600">共 {{ composed.slides.length }} 页</span>
      <el-button size="small" type="primary" :loading="busy" @click="download">下载 PPTX</el-button>
    </div>

    <details class="mb-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2 text-xs">
      <summary class="cursor-pointer text-gray-500">
        + 插入视频（可选{{ videos.length ? `，已加 ${videos.length} 段` : '' }}）
      </summary>
      <div class="mt-2 space-y-2">
        <p class="text-[11px] text-gray-400">跟大纲内容无关的手动挂件，导出的 pptx 里能在 PowerPoint 里直接播放。</p>
        <div class="flex items-center gap-1.5">
          <span class="shrink-0 text-gray-500">贴到第</span>
          <el-input-number
            v-model="videoSlideNo"
            :min="1"
            :max="composed.slides.length"
            size="small"
            controls-position="right"
            class="!w-20"
          />
          <span class="shrink-0 text-gray-500">页</span>
        </div>
        <div class="flex gap-1.5">
          <button
            v-for="m in (['file', 'online'] as const)"
            :key="m"
            class="flex-1 rounded-md border px-2 py-1 transition"
            :class="videoMode === m ? 'border-violet-500 bg-violet-50 text-violet-600' : 'border-gray-200 text-gray-500'"
            @click="videoMode = m"
          >
            {{ m === 'file' ? '本地视频' : 'YouTube 链接' }}
          </button>
        </div>
        <template v-if="videoMode === 'file'">
          <input ref="videoInput" type="file" accept="video/*" class="hidden" @change="pickVideoFile" />
          <el-button size="small" :loading="videoBusy" class="!w-full" @click="videoInput?.click()">
            选择视频文件（最大 60MB）
          </el-button>
        </template>
        <template v-else>
          <div class="flex gap-1.5">
            <el-input v-model="videoUrl" size="small" placeholder="https://www.youtube.com/embed/xxxx" />
            <el-button size="small" type="primary" plain @click="addVideoLink">添加</el-button>
          </div>
        </template>
        <div v-if="videos.length" class="space-y-1">
          <div
            v-for="(v, i) in videos"
            :key="i"
            class="flex items-center justify-between rounded border border-gray-200 bg-white px-2 py-1"
          >
            <span class="truncate text-gray-600">第 {{ v.slideIndex + 1 }} 页 · {{ v.label }}</span>
            <button class="ml-2 shrink-0 text-gray-400 hover:text-red-400" @click="rmVideo(i)">移除</button>
          </div>
        </div>
      </div>
    </details>

    <div class="space-y-2">
      <div
        v-for="(html, i) in composed.slides"
        :key="i"
        class="overflow-hidden rounded border border-gray-200"
        :style="{ width: '100%', height: 1280 * scale * (720 / 1280) + 'px' }"
      >
        <div
          class="origin-top-left"
          style="width: 1280px; height: 720px"
          :style="{ transform: `scale(${scale})` }"
          v-html="composed.styleTag + html"
        />
      </div>
    </div>

    <!-- 导出用隐藏舞台：1:1 -->
    <div
      ref="stageRef"
      aria-hidden="true"
      style="position: fixed; left: -20000px; top: 0; width: 1280px; pointer-events: none"
      v-html="composed.styleTag + composed.slides.join('')"
    />
  </div>
</template>
