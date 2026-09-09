<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { composeDeck, type DeckOutline, type DeckTheme } from '../../deck/templates'
import { slidesToPptx } from '../../deck/toPptx'
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
}

const theme = computed<DeckTheme>(() => {
  const p =
    props.outline.palette && props.outline.palette.length >= 5
      ? props.outline.palette
      : FALLBACK[props.themeKey] || FALLBACK.red
  return { primary: p[0], accent: p[1], primaryDk: p[2], paper: p[3], ink: p[4] }
})

const composed = computed(() => {
  const o: DeckOutline = {
    title: props.outline.title,
    subtitle: props.outline.subtitle,
    theme: theme.value,
    sections: props.outline.sections || [],
    bg: props.bg ?? null,
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
async function download() {
  const stage = stageRef.value
  if (!stage) return
  busy.value = true
  try {
    const els = Array.from(stage.querySelectorAll<HTMLElement>('.slide'))
    const blob = await slidesToPptx(els, props.outline.title)
    await saveFile(`${props.outline.title || '演示文稿'}.pptx`, blob)
    ElMessage.success('PPTX 已导出（HTML 版）')
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
      <span class="text-xs font-medium text-gray-600">HTML 版 · {{ composed.slides.length }} 页</span>
      <el-button size="small" type="primary" plain :loading="busy" @click="download">
        下载 PPTX（HTML 版）
      </el-button>
    </div>

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
