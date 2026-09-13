<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { snapdom } from '@zumer/snapdom'
import { composeDeck, type DeckOutline, type DeckTheme } from '../../deck/templates'
import { slidesToPptx, waitImages, type VideoAttachment } from '../../deck/toPptx'
import { saveFile } from '../../utils/saveFile'
import { reviewDeckSlides, type DeckOutlineRaw, type DeckReviewResult } from '../../services/designApi'
import { THEME_FALLBACK_PALETTES, STYLE_BY_THEME_KEY } from '../../deck/themePalettes'

const props = defineProps<{
  outline: DeckOutlineRaw
  themeKey: string
  bg?: { cover?: string; content?: string; section?: string } | null
}>()

const theme = computed<DeckTheme>(() => {
  const p =
    props.outline.palette && props.outline.palette.length >= 5
      ? props.outline.palette
      : THEME_FALLBACK_PALETTES[props.themeKey] || THEME_FALLBACK_PALETTES.red
  return {
    primary: p[0],
    accent: p[1],
    primaryDk: p[2],
    paper: p[3],
    ink: p[4],
    style: (STYLE_BY_THEME_KEY[props.themeKey] as DeckTheme['style']) || 'plain',
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
    coverMeta: props.outline.cover_meta,
    heroImage: props.outline.hero_image,
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

// 插入视频：跟大纲内容无关的手动挂件，导出前选"第几页 + 本地视频"
// （YouTube 链接去掉了——国内基本打不开，留着只是个没人能用的选项）
interface VideoItem extends VideoAttachment {
  label: string
}
const videos = ref<VideoItem[]>([])
const videoSlideNo = ref(1)
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

// AI 自动视觉复核：渲染→截图→AI 挑排版缺陷→能自动改文案的直接改→重渲染再确认一轮→出报告。
// 不是生成完就算交付完，是加一道"AI 自己先看一眼像不像样"的质量兜底。
const ALLOWED_FIX_LAYOUTS = new Set([
  'cards', 'list', 'timeline', 'quote', 'big_number', 'stats', 'bar', 'line', 'table',
  'compare', 'matrix', 'swot', 'image_text', 'rings', 'spoke', 'hive', 'cycle', 'gallery',
  'tree', 'diamond', 'bulb',
])

interface ReviewRow {
  flatIndex: number
  title: string
  verdict: 'pass' | 'fixed' | 'unresolved'
  issues?: string[]
}
const reviewBusy = ref(false)
const reviewDone = ref(false)
const reviewReport = ref<ReviewRow[]>([])

/** composeDeck 内部按 [cover, toc?, (section 分割页, 该章节每页内容)...] 的固定顺序 push 进
 * slides 数组——这里原样镜像同一套顺序，才能把 outline.sections[si].slides[sli] 跟
 * composed.slides 里的第几个 DOM 元素对上号（不能反过来改 templates.ts 塞 data 属性，
 * 那是给两条排版路径共用的引擎代码，不该为了前端这一个功能扎进去改）。 */
function contentSlideMap(): { flatIndex: number; si: number; sli: number }[] {
  const map: { flatIndex: number; si: number; sli: number }[] = []
  let idx = 1 // 0 = cover
  if (props.outline.sections.length) idx++ // toc
  props.outline.sections.forEach((sec, si) => {
    idx++ // 章节分隔页
    sec.slides.forEach((_sl, sli) => {
      map.push({ flatIndex: idx, si, sli })
      idx++
    })
  })
  return map
}

async function captureSlideJpeg(el: HTMLElement): Promise<string> {
  await waitImages(el)
  const shot = await snapdom(el, { scale: 1, backgroundColor: '#ffffff', embedFonts: false })
  const canvas = await shot.toCanvas()
  return canvas.toDataURL('image/jpeg', 0.7)
}

async function captureAndReview(
  stage: HTMLElement,
  targets: { flatIndex: number; si: number; sli: number }[],
): Promise<DeckReviewResult[]> {
  const els = Array.from(stage.querySelectorAll<HTMLElement>('.slide'))
  const payload = await Promise.all(
    targets.map(async (m) => {
      const el = els[m.flatIndex]
      const sl = props.outline.sections[m.si].slides[m.sli]
      const image = el ? await captureSlideJpeg(el) : ''
      return { index: m.flatIndex, title: sl.title || '', layout: sl.layout || '', bullets: sl.bullets || [], image }
    }),
  )
  return reviewDeckSlides(payload.filter((p) => p.image))
}

async function runReview() {
  const stage = stageRef.value
  if (!stage) return
  reviewBusy.value = true
  reviewDone.value = false
  reviewReport.value = []
  try {
    const map = contentSlideMap()
    if (!map.length) {
      ElMessage.info('这份 PPT 没有可复核的内容页')
      return
    }
    const results1 = await captureAndReview(stage, map)
    const byIndex = new Map(results1.map((r) => [r.index, r]))

    const patched: typeof map = []
    for (const m of map) {
      const r = byIndex.get(m.flatIndex)
      if (!r || r.verdict !== 'issue') continue
      const hasFix = (r.fixed_bullets && r.fixed_bullets.length > 0) || (r.fixed_layout && ALLOWED_FIX_LAYOUTS.has(r.fixed_layout))
      if (!hasFix) continue
      const sl = props.outline.sections[m.si].slides[m.sli]
      if (r.fixed_bullets?.length) sl.bullets = r.fixed_bullets
      if (r.fixed_layout && ALLOWED_FIX_LAYOUTS.has(r.fixed_layout)) sl.layout = r.fixed_layout
      patched.push(m)
    }

    if (patched.length) {
      await nextTick() // 等 composed 重新算、v-html 把新版式/新文案渲染进隐藏舞台
      await new Promise((res) => setTimeout(res, 200))
      const results2 = await captureAndReview(stage, patched)
      for (const r of results2) byIndex.set(r.index, r)
    }

    reviewReport.value = map.map((m) => {
      const r = byIndex.get(m.flatIndex)
      const wasPatched = patched.some((p) => p.flatIndex === m.flatIndex)
      const sl = props.outline.sections[m.si].slides[m.sli]
      const stillIssue = !!r && r.verdict === 'issue'
      const verdict: ReviewRow['verdict'] = stillIssue ? 'unresolved' : wasPatched ? 'fixed' : 'pass'
      return { flatIndex: m.flatIndex, title: sl.title || `第 ${m.flatIndex + 1} 页`, verdict, issues: r?.issues }
    })
    reviewDone.value = true
    const fixedCount = reviewReport.value.filter((r) => r.verdict === 'fixed').length
    const badCount = reviewReport.value.filter((r) => r.verdict === 'unresolved').length
    if (badCount) ElMessage.warning(`质检完成：自动优化 ${fixedCount} 页，仍有 ${badCount} 页建议人工看一下`)
    else ElMessage.success(fixedCount ? `质检完成：自动优化了 ${fixedCount} 页，其余全部通过` : '质检完成：全部通过')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '质检失败')
  } finally {
    reviewBusy.value = false
  }
}

defineExpose({ download })
</script>

<template>
  <div ref="wrapRef">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-gray-600">共 {{ composed.slides.length }} 页</span>
      <div class="flex items-center gap-2">
        <el-button size="small" :loading="reviewBusy" @click="runReview">AI 质检</el-button>
        <el-button size="small" type="primary" :loading="busy" @click="download">下载 PPTX</el-button>
      </div>
    </div>

    <div v-if="reviewDone" class="mb-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2 text-xs">
      <div class="mb-1 flex items-center gap-3 text-gray-500">
        <span>✓ 通过 {{ reviewReport.filter((r) => r.verdict === 'pass').length }}</span>
        <span class="text-blue-500">↻ 已自动优化 {{ reviewReport.filter((r) => r.verdict === 'fixed').length }}</span>
        <span v-if="reviewReport.some((r) => r.verdict === 'unresolved')" class="text-orange-500">
          ⚠ 建议人工看看 {{ reviewReport.filter((r) => r.verdict === 'unresolved').length }}
        </span>
      </div>
      <div
        v-for="r in reviewReport.filter((x) => x.verdict === 'unresolved')"
        :key="r.flatIndex"
        class="border-t border-gray-200 py-1 first:border-t-0"
      >
        <span class="font-medium text-gray-700">第 {{ r.flatIndex + 1 }} 页 · {{ r.title }}：</span>
        <span class="text-gray-500">{{ (r.issues || []).join('；') }}</span>
      </div>
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
        <input ref="videoInput" type="file" accept="video/*" class="hidden" @change="pickVideoFile" />
        <el-button size="small" :loading="videoBusy" class="!w-full" @click="videoInput?.click()">
          选择视频文件（最大 60MB）
        </el-button>
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
