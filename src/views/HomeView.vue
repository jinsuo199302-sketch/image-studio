<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import Sidebar from '../components/home/Sidebar.vue'
import { CATEGORIES, INDUSTRIES, SCENES, SORT_OPTIONS } from '../data/templates'
import { useTemplateStore } from '../stores/templates'

const router = useRouter()
const templateStore = useTemplateStore()
const keyword = ref('')
const activeCategory = ref('全部分类')
const activeScene = ref('全部场景')
const activeIndustry = ref('全部行业')
const activeSort = ref<'hot' | 'new'>('hot')

onMounted(() => templateStore.ensureLoaded())

const TOOL_TABS = [
  { key: 'template', label: '模板库', desc: '海量模板', enabled: true },
  { key: 'ai-image', label: 'AI 生图', desc: '文字生成图片', enabled: true, route: '/ai-tools?tab=image' },
  { key: 'ai-write', label: 'AI 写作', desc: '一键出文案', enabled: true, route: '/ai-tools?tab=write' },
  { key: 'ai-translate', label: 'AI 翻译', desc: '多语言互译', enabled: true, route: '/ai-tools?tab=translate' },
  { key: 'ai-video', label: 'AI 视频', desc: '文字生成视频', enabled: true, route: '/ai-tools?tab=video' },
  { key: 'pdf-tools', label: 'PDF 工具', desc: '合并 / 拆分', enabled: true, route: '/ai-tools?tab=pdf' },
  { key: 'ai-cutout', label: 'AI 抠图', desc: '一键去背景', enabled: true, route: '/ai-tools?tab=cutout' },
  { key: 'collage', label: '图片拼贴', desc: '多图合成一张', enabled: false },
  { key: 'vectorize', label: '位图转矢量', desc: '照片转矢量图', enabled: false },
]
const activeTool = ref('template')

const filtered = computed(() => {
  const list = templateStore.items.filter((t) => {
    const matchCategory = activeCategory.value === '全部分类' || t.category === activeCategory.value
    const matchScene = activeScene.value === '全部场景' || t.scene === activeScene.value
    const matchIndustry = activeIndustry.value === '全部行业' || t.industry === activeIndustry.value
    const matchKeyword = !keyword.value.trim() || t.name.includes(keyword.value.trim())
    return matchCategory && matchScene && matchIndustry && matchKeyword
  })
  if (activeSort.value === 'new') {
    return [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  }
  return list
})

function openTemplate(id: string) {
  router.push(`/design/${id}`)
}

function pickTool(tool: (typeof TOOL_TABS)[number]) {
  if (!tool.enabled) return
  if ('route' in tool && tool.route) {
    router.push(tool.route)
    return
  }
  activeTool.value = tool.key
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden">
      <Sidebar />

      <main class="flex-1 overflow-y-auto">
        <!-- Hero -->
        <section class="bg-gradient-to-b from-violet-50 to-white px-8 pb-8 pt-10 text-center">
          <h1 class="mb-6 text-3xl font-bold text-gray-800">更好用的 AI 设计助手</h1>

          <div class="mx-auto max-w-4xl rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
            <div class="mb-3 grid grid-cols-4 gap-2">
              <button
                v-for="tool in TOOL_TABS"
                :key="tool.key"
                class="flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-sm transition"
                :class="[
                  activeTool === tool.key
                    ? 'border-violet-400 bg-violet-50 text-violet-600'
                    : 'border-transparent text-gray-500 hover:bg-gray-50',
                  !tool.enabled && 'cursor-not-allowed opacity-60',
                ]"
                @click="pickTool(tool)"
              >
                <span class="font-medium">{{ tool.label }}</span>
                <span class="text-[11px] text-gray-400">
                  {{ tool.enabled ? tool.desc : '敬请期待' }}
                </span>
              </button>
            </div>
            <el-input
              v-model="keyword"
              size="large"
              placeholder="请输入设计关键词，如：促销海报、开业宣传单"
              :prefix-icon="Search"
            >
              <template #append>
                <el-button type="primary" class="!bg-violet-500 !border-none">搜索</el-button>
              </template>
            </el-input>
          </div>

          <div class="mx-auto mt-5 flex max-w-4xl flex-wrap justify-center gap-2">
            <button
              v-for="c in CATEGORIES"
              :key="c"
              class="rounded-full border px-3.5 py-1.5 text-xs transition"
              :class="
                activeCategory === c
                  ? 'border-violet-500 bg-violet-500 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-violet-300'
              "
              @click="activeCategory = c"
            >
              {{ c }}
            </button>
          </div>
        </section>

        <!-- Template grid -->
        <section class="px-8 pb-10">
          <div class="mb-5 mt-2 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div class="flex items-start gap-3 py-1.5">
              <span class="mt-1 w-10 shrink-0 text-xs text-gray-400">分类</span>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in CATEGORIES"
                  :key="c"
                  class="rounded-md px-2.5 py-1 text-xs transition"
                  :class="
                    activeCategory === c
                      ? 'bg-violet-500 text-white'
                      : 'text-gray-600 hover:bg-violet-50 hover:text-violet-600'
                  "
                  @click="activeCategory = c"
                >
                  {{ c }}
                </button>
              </div>
            </div>

            <div class="flex items-start gap-3 border-t border-gray-100 py-1.5 pt-2.5">
              <span class="mt-1 w-10 shrink-0 text-xs text-gray-400">场景</span>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="s in SCENES"
                  :key="s"
                  class="rounded-md px-2.5 py-1 text-xs transition"
                  :class="
                    activeScene === s
                      ? 'bg-violet-500 text-white'
                      : 'text-gray-600 hover:bg-violet-50 hover:text-violet-600'
                  "
                  @click="activeScene = s"
                >
                  {{ s }}
                </button>
              </div>
            </div>

            <div class="flex items-start gap-3 border-t border-gray-100 py-1.5 pt-2.5">
              <span class="mt-1 w-10 shrink-0 text-xs text-gray-400">行业</span>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="i in INDUSTRIES"
                  :key="i"
                  class="rounded-md px-2.5 py-1 text-xs transition"
                  :class="
                    activeIndustry === i
                      ? 'bg-violet-500 text-white'
                      : 'text-gray-600 hover:bg-violet-50 hover:text-violet-600'
                  "
                  @click="activeIndustry = i"
                >
                  {{ i }}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-2.5">
              <div class="flex items-center gap-3">
                <span class="w-10 shrink-0 text-xs text-gray-400">排序</span>
                <div class="flex gap-2">
                  <button
                    v-for="opt in SORT_OPTIONS"
                    :key="opt.value"
                    class="rounded-md px-2.5 py-1 text-xs transition"
                    :class="
                      activeSort === opt.value
                        ? 'bg-violet-500 text-white'
                        : 'text-gray-600 hover:bg-violet-50 hover:text-violet-600'
                    "
                    @click="activeSort = opt.value"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <el-input
                v-model="keyword"
                size="small"
                placeholder="搜索模板"
                :prefix-icon="Search"
                class="!w-52"
                clearable
              />
            </div>
          </div>

          <h2 class="mb-4 text-base font-semibold text-gray-700">
            {{ activeCategory === '全部分类' ? '推荐模板' : activeCategory }}
            <span class="ml-1 text-xs font-normal text-gray-400">({{ filtered.length }})</span>
          </h2>

          <el-alert
            v-if="templateStore.error"
            :title="templateStore.error"
            type="error"
            :closable="false"
            show-icon
            class="mb-4"
          />

          <div v-if="templateStore.loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div v-for="n in 10" :key="n" class="animate-pulse overflow-hidden rounded-xl border border-gray-200">
              <div class="aspect-[3/4] bg-gray-100" />
              <div class="p-2"><div class="h-3 w-2/3 rounded bg-gray-100" /></div>
            </div>
          </div>

          <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div
              v-for="t in filtered"
              :key="t.id"
              class="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
              @click="openTemplate(t.id)"
            >
              <div
                class="relative overflow-hidden bg-gray-100"
                :style="{ aspectRatio: `${t.canvasWidth}/${t.canvasHeight}` }"
              >
                <img :src="t.thumbnail" class="h-full w-full object-cover" loading="lazy" />
                <div
                  class="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100"
                >
                  <span class="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-800">
                    立即使用
                  </span>
                </div>
              </div>
              <div class="p-2">
                <p class="truncate text-xs text-gray-600">{{ t.name }}</p>
              </div>
            </div>
          </div>

          <div
            v-if="!templateStore.loading && !filtered.length"
            class="py-16 text-center text-sm text-gray-400"
          >
            没有找到相关模板，换个关键词试试
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
