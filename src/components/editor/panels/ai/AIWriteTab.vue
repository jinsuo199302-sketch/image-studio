<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ArrowLeft,
  ChatDotRound,
  EditPen,
  MagicStick,
  Promotion,
  Reading,
  ShoppingBag,
  Star,
  UserFilled,
  VideoCamera,
} from '@element-plus/icons-vue'
import { useAuthStore } from '../../../../stores/auth'
import { useWritingStore } from '../../../../stores/writing'

const emit = defineEmits<{ (e: 'insert', text: string): void }>()
const authStore = useAuthStore()
const store = useWritingStore()

interface CopyTemplate {
  key: string
  label: string
  desc: string
  icon: unknown
  badge: string
  categories: string[]
  inputPlaceholder?: string
  buildPrompt?: (input: string) => string
}

const CATEGORIES = ['精选', '电商', '社媒', '职场', '短视频']

const TEMPLATES: CopyTemplate[] = [
  { key: 'custom', label: '自定义', desc: '输入任何文案需求，自由发挥', icon: ChatDotRound, badge: 'bg-violet-100 text-violet-500', categories: ['精选'] },
  {
    key: 'product-marketing',
    label: '产品营销文案',
    desc: '提炼卖点，写出打动用户的营销文案',
    icon: ShoppingBag,
    badge: 'bg-rose-100 text-rose-500',
    categories: ['精选', '电商'],
    inputPlaceholder: '产品名称/核心卖点，例如：无线降噪耳机，续航30小时',
    buildPrompt: (input) => `写一段产品营销文案，产品信息：${input}。语言有感染力，能打动目标用户`,
  },
  {
    key: 'topic-ideas',
    label: '选题灵感',
    desc: '想不出主题？让 AI 给你几个方向',
    icon: MagicStick,
    badge: 'bg-amber-100 text-amber-500',
    categories: ['精选', '社媒'],
    inputPlaceholder: '你的账号定位/领域，例如：宝妈育儿分享',
    buildPrompt: (input) => `围绕"${input}"这个领域，给我 5 个当下适合发布的选题方向，每个选题配一句话说明`,
  },
  {
    key: 'title-optimize',
    label: '商品标题优化',
    desc: '输入商品信息，生成更容易被点击的标题',
    icon: EditPen,
    badge: 'bg-sky-100 text-sky-500',
    categories: ['电商'],
    inputPlaceholder: '商品名称+关键卖点，例如：夏季薄款防晒衣，轻薄透气',
    buildPrompt: (input) => `帮我把这个商品信息优化成更容易被点击的标题：${input}`,
  },
  {
    key: 'recruitment',
    label: '招聘文案',
    desc: 'HR 的好帮手，快速生成招聘启事',
    icon: UserFilled,
    badge: 'bg-orange-100 text-orange-500',
    categories: ['职场'],
    inputPlaceholder: '职位名称+核心要求，例如：新媒体运营，会剪辑',
    buildPrompt: (input) => `写一条招聘文案，职位信息：${input}。语气亲和，能吸引求职者`,
  },
  {
    key: 'video-script',
    label: '短视频脚本',
    desc: '短视频/vlog 脚本创作助手',
    icon: VideoCamera,
    badge: 'bg-red-100 text-red-500',
    categories: ['短视频'],
    inputPlaceholder: '视频主题，例如：探店一家隐藏美食店',
    buildPrompt: (input) => `帮我写一个短视频脚本大纲，主题：${input}。按开头钩子/中间内容/结尾引导分段`,
  },
  {
    key: 'slogan',
    label: '广告语',
    desc: '一句话广告词/品牌口号',
    icon: Star,
    badge: 'bg-emerald-100 text-emerald-500',
    categories: ['精选', '职场'],
    inputPlaceholder: '品牌/产品名称+特点，例如：某咖啡品牌，现磨手冲',
    buildPrompt: (input) => `给"${input}"想几句简短有记忆点的广告语/口号`,
  },
  {
    key: 'moments-copy',
    label: '朋友圈文案',
    desc: '适合朋友圈发布的简短文案',
    icon: Promotion,
    badge: 'bg-pink-100 text-pink-500',
    categories: ['社媒'],
    inputPlaceholder: '想发的内容主题，例如：周末爬山',
    buildPrompt: (input) => `写一条适合发朋友圈的文案，主题：${input}。简短自然，不要太营销号`,
  },
  {
    key: 'article-copy',
    label: '公众号推文',
    desc: '公众号文章的开头/框架',
    icon: Reading,
    badge: 'bg-teal-100 text-teal-500',
    categories: ['社媒', '职场'],
    inputPlaceholder: '文章主题，例如：新品上市预告',
    buildPrompt: (input) => `帮我写一段公众号文章的开头，主题：${input}。能吸引读者往下读`,
  },
]

const activeCategory = ref('精选')
const filteredTemplates = computed(() =>
  TEMPLATES.filter((t) => t.categories.includes(activeCategory.value)),
)

const stage = ref<'templates' | 'form' | 'chat'>('templates')
const activeTemplate = ref<CopyTemplate | null>(null)
const formInput = ref('')

function pickTemplate(t: CopyTemplate) {
  activeTemplate.value = t
  if (t.key === 'custom') {
    stage.value = 'chat'
  } else {
    formInput.value = ''
    stage.value = 'form'
  }
}

function backToTemplates() {
  stage.value = 'templates'
  activeTemplate.value = null
}

async function submitForm() {
  if (!activeTemplate.value?.buildPrompt || !formInput.value.trim()) return
  stage.value = 'chat'
  await store.generate(activeTemplate.value.buildPrompt(formInput.value.trim()))
}

const message = ref('')
const threadRef = ref<HTMLDivElement>()

function scrollToBottom() {
  nextTick(() => {
    if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight
  })
}

watch(() => store.sessions.length, scrollToBottom)

async function send() {
  if (!message.value.trim()) {
    store.error = '请先输入想写的内容'
    return
  }
  const text = message.value.trim()
  message.value = ''
  await store.generate(text)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- ============ 模板选择：按场景分类挑一个文案模板，或直接自定义 ============ -->
    <div v-if="stage === 'templates'" class="flex h-full flex-col">
      <div class="flex gap-1.5 overflow-x-auto p-3 pb-2">
        <button
          v-for="c in CATEGORIES"
          :key="c"
          class="shrink-0 rounded-full px-3 py-1 text-xs transition"
          :class="activeCategory === c ? 'bg-violet-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
          @click="activeCategory = c"
        >
          {{ c }}
        </button>
      </div>

      <button
        v-if="store.sessions.length"
        class="mx-3 mb-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 py-1.5 text-xs text-gray-500 hover:border-violet-300 hover:text-violet-600"
        @click="stage = 'chat'"
      >
        继续上次的对话 →
      </button>

      <div class="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        <button
          v-for="t in filteredTemplates"
          :key="t.key"
          class="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-2.5 text-left transition hover:border-violet-200 hover:bg-violet-50/50"
          @click="pickTemplate(t)"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="t.badge">
            <el-icon :size="18"><component :is="t.icon" /></el-icon>
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-medium text-gray-800">{{ t.label }}</span>
            <span class="block truncate text-xs text-gray-400">{{ t.desc }}</span>
          </span>
        </button>
      </div>
    </div>

    <!-- ============ 模板表单：填一句关键信息，拼成完整需求丢给生成接口 ============ -->
    <div v-else-if="stage === 'form'" class="flex h-full flex-col p-3">
      <button class="mb-3 flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600" @click="backToTemplates">
        <el-icon :size="12"><ArrowLeft /></el-icon>
        返回
      </button>
      <p class="mb-2 text-sm font-medium text-gray-800">{{ activeTemplate?.label }}</p>
      <el-input
        v-model="formInput"
        type="textarea"
        :rows="4"
        :placeholder="activeTemplate?.inputPlaceholder"
        @keyup.enter.exact="submitForm"
      />
      <el-button
        type="primary"
        class="!mt-3 !w-full !bg-violet-500 !border-none"
        :disabled="!formInput.trim()"
        @click="submitForm"
      >
        生成文案
      </el-button>
    </div>

    <!-- ============ 对话区：跟原来一样，聊天式展示结果，点结果直接插入画布 ============ -->
    <div v-else class="flex h-full flex-col">
      <div class="flex items-center gap-2 border-b border-gray-100 p-3 pb-2">
        <button class="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600" @click="backToTemplates">
          <el-icon :size="12"><ArrowLeft /></el-icon>
          换个模板
        </button>
      </div>
      <div class="p-3 pb-0">
        <el-alert
          :title="authStore.isAuthenticated ? '已登录，使用真实文案接口' : '演示模式：文案为模板示例，登录后自动切换'"
          :type="authStore.isAuthenticated ? 'success' : 'info'"
          :closable="false"
          show-icon
        />
      </div>

      <div ref="threadRef" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div v-if="!store.sessions.length && !store.isGenerating" class="flex h-full items-center justify-center text-center text-xs text-gray-400">
          像聊天一样描述你想要的文案，例如"写一条促销标题，语气专业一点"
        </div>

        <template v-for="session in store.sessions" :key="session.id">
          <div class="flex justify-end">
            <div class="max-w-[85%] rounded-lg rounded-tr-sm bg-violet-500 px-2.5 py-1.5 text-xs text-white">
              {{ session.message }}
            </div>
          </div>
          <div class="flex justify-start">
            <div class="max-w-[85%] space-y-1.5">
              <div
                v-for="(r, i) in session.results"
                :key="i"
                class="cursor-pointer rounded-lg rounded-tl-sm border border-gray-200 bg-gray-50 p-2 text-xs leading-relaxed text-gray-700 transition hover:border-violet-300 hover:bg-violet-50"
                @click="emit('insert', r)"
              >
                {{ r }}
              </div>
            </div>
          </div>
        </template>

        <div v-if="store.isGenerating" class="flex justify-start">
          <div class="max-w-[85%] space-y-1.5">
            <div v-for="n in 3" :key="n" class="h-8 w-40 animate-pulse rounded-lg bg-gray-100" />
          </div>
        </div>
      </div>

      <p v-if="store.error" class="px-3 text-xs text-red-500">{{ store.error }}</p>

      <div class="flex gap-2 border-t border-gray-100 p-3">
        <el-input
          v-model="message"
          placeholder="发消息，例如：写一条秋季新品连衣裙的标题"
          @keyup.enter="send"
        />
        <el-button
          type="primary"
          class="!shrink-0 !bg-gradient-to-r !from-violet-500 !to-fuchsia-500 !border-none"
          :loading="store.isGenerating"
          @click="send"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>
