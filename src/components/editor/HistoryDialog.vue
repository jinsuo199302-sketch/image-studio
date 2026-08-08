<script setup lang="ts">
import { ref } from 'vue'
import { StarFilled, Star } from '@element-plus/icons-vue'
import { useGenerationStore } from '../../stores/generation'
import { useWritingStore } from '../../stores/writing'
import { useVideoStore } from '../../stores/video'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'insert-image', url: string): void
  (e: 'insert-text', text: string): void
}>()

const generationStore = useGenerationStore()
const writingStore = useWritingStore()
const videoStore = useVideoStore()
const activeTab = ref<'image' | 'text' | 'video'>('image')

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function pickImage(url: string) {
  emit('insert-image', url)
  emit('update:modelValue', false)
}

function pickText(text: string) {
  emit('insert-text', text)
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="历史记录"
    width="680px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="flex border-b border-gray-100">
      <button
        v-for="tab in [
          { key: 'image', label: `生图 (${generationStore.history.length})` },
          { key: 'text', label: `写作 (${writingStore.sessions.length})` },
          { key: 'video', label: `视频 (${videoStore.history.length})` },
        ]"
        :key="tab.key"
        class="px-4 py-2 text-sm transition"
        :class="
          activeTab === tab.key
            ? 'border-b-2 border-violet-500 font-medium text-violet-600'
            : 'text-gray-500 hover:text-gray-700'
        "
        @click="activeTab = tab.key as 'image' | 'text' | 'video'"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="max-h-[60vh] overflow-y-auto py-3">
      <div v-if="activeTab === 'image'">
        <div v-if="!generationStore.history.length" class="py-10 text-center text-sm text-gray-400">
          还没有生成记录，去"生图"里生成第一批图片吧
        </div>
        <div v-else class="space-y-4">
          <div v-for="session in generationStore.history" :key="session.id">
            <div class="mb-1.5 flex items-baseline justify-between">
              <p class="truncate text-xs text-gray-600" :title="session.prompt">{{ session.prompt }}</p>
              <span class="shrink-0 pl-2 text-[11px] text-gray-400">{{ formatTime(session.createdAt) }}</span>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <div v-for="img in session.images" :key="img.id" class="group relative">
                <img
                  :src="img.url"
                  class="aspect-square w-full cursor-pointer rounded-md object-cover transition group-hover:opacity-80"
                  @click="pickImage(img.url)"
                />
                <button
                  class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-amber-400 opacity-0 transition group-hover:opacity-100"
                  @click.stop="generationStore.toggleStar(img.id)"
                >
                  <el-icon :size="12"><component :is="img.starred ? StarFilled : Star" /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'text'">
        <div v-if="!writingStore.sessions.length" class="py-10 text-center text-sm text-gray-400">
          还没有写作记录，去"写作"里发第一条消息吧
        </div>
        <div v-else class="space-y-4">
          <div v-for="session in [...writingStore.sessions].reverse()" :key="session.id">
            <div class="mb-1.5 flex items-baseline justify-between">
              <p class="truncate text-xs text-gray-600" :title="session.message">{{ session.message }}</p>
              <span class="shrink-0 pl-2 text-[11px] text-gray-400">{{ formatTime(session.createdAt) }}</span>
            </div>
            <div class="space-y-1.5">
              <div
                v-for="(r, i) in session.results"
                :key="i"
                class="cursor-pointer rounded-lg border border-gray-200 p-2 text-xs leading-relaxed text-gray-700 transition hover:border-violet-300 hover:bg-violet-50"
                @click="pickText(r)"
              >
                {{ r }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else>
        <div v-if="!videoStore.history.length" class="py-10 text-center text-sm text-gray-400">
          还没有视频记录，去"视频"里生成第一条吧
        </div>
        <div v-else class="grid grid-cols-2 gap-4">
          <div v-for="session in videoStore.history" :key="session.id" class="space-y-1.5">
            <video :src="session.url" controls class="aspect-video w-full rounded-md bg-black" />
            <div class="flex items-baseline justify-between">
              <p class="truncate text-xs text-gray-600" :title="session.prompt">{{ session.prompt }}</p>
              <span class="shrink-0 pl-2 text-[11px] text-gray-400">{{ formatTime(session.createdAt) }}</span>
            </div>
            <p class="text-[11px] text-gray-400">{{ session.duration }}秒 · {{ session.ratio }}</p>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>
