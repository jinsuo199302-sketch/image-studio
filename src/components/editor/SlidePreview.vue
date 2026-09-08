<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { renderSlide, type SlideData } from '../../utils/slideRender'

const props = defineProps<{ slide: SlideData; width?: number }>()
const canvasEl = ref<HTMLCanvasElement>()

function draw() {
  if (canvasEl.value) renderSlide(canvasEl.value, props.slide, props.width ?? 320)
}
onMounted(draw)
watch(() => [props.slide, props.width], draw, { deep: true })
defineExpose({ draw })
</script>

<template>
  <canvas ref="canvasEl" class="block h-auto w-full rounded border border-gray-200" />
</template>
