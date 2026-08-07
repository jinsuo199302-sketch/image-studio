<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { CATEGORIES } from '../../../data/templates'
import { useTemplateStore } from '../../../stores/templates'

const props = defineProps<{ activeId: string }>()
const emit = defineEmits<{ (e: 'switch', id: string): void }>()

const templateStore = useTemplateStore()
const keyword = ref('')
const category = ref('全部分类')

onMounted(() => templateStore.ensureLoaded())

const filtered = computed(() =>
  templateStore.items.filter((t) => {
    const mc = category.value === '全部分类' || t.category === category.value
    const mk = !keyword.value.trim() || t.name.includes(keyword.value.trim())
    return mc && mk
  }),
)
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="border-b border-gray-100 p-3">
      <el-input v-model="keyword" size="small" placeholder="搜索模板" :prefix-icon="Search" clearable />
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="c in CATEGORIES"
          :key="c"
          class="rounded-full border px-2.5 py-0.5 text-[11px] transition"
          :class="
            category === c
              ? 'border-violet-500 bg-violet-50 text-violet-600'
              : 'border-gray-200 text-gray-500'
          "
          @click="category = c"
        >
          {{ c }}
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-3">
      <div v-if="templateStore.loading" class="grid grid-cols-2 gap-2.5">
        <div v-for="n in 6" :key="n" class="aspect-[3/4] animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div v-else class="grid grid-cols-2 gap-2.5">
        <div
          v-for="t in filtered"
          :key="t.id"
          class="cursor-pointer overflow-hidden rounded-lg border-2 transition"
          :class="t.id === props.activeId ? 'border-violet-500' : 'border-transparent hover:border-gray-200'"
          @click="emit('switch', t.id)"
        >
          <div class="bg-gray-100" :style="{ aspectRatio: `${t.canvasWidth}/${t.canvasHeight}` }">
            <img :src="t.thumbnail" class="h-full w-full object-cover" loading="lazy" />
          </div>
          <p class="truncate px-1 py-1 text-[11px] text-gray-500">{{ t.name }}</p>
        </div>
      </div>
      <p v-if="!templateStore.loading && !filtered.length" class="mt-8 text-center text-xs text-gray-400">
        没有找到相关模板
      </p>
    </div>
  </div>
</template>
