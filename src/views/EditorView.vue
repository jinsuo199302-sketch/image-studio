<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, RefreshLeft, RefreshRight, Download, Collection, Crop, Clock } from '@element-plus/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import CanvasStage, { type SelectionInfo } from '../components/editor/CanvasStage.vue'
import LeftIconRail, { type RailKey } from '../components/editor/LeftIconRail.vue'
import SelectionToolbar from '../components/editor/SelectionToolbar.vue'
import SaveTemplateDialog from '../components/editor/SaveTemplateDialog.vue'
import ResizeDialog from '../components/editor/ResizeDialog.vue'
import HistoryDialog from '../components/editor/HistoryDialog.vue'
import TemplateSwitchPanel from '../components/editor/panels/TemplateSwitchPanel.vue'
import BackgroundPanel from '../components/editor/panels/BackgroundPanel.vue'
import ShapePanel from '../components/editor/panels/ShapePanel.vue'
import UploadPanel from '../components/editor/panels/UploadPanel.vue'
import ImageToolsPanel from '../components/editor/panels/ImageToolsPanel.vue'
import PlaceholderPanel from '../components/editor/panels/PlaceholderPanel.vue'
import type { Template } from '../data/templates'
import { useTemplateStore } from '../stores/templates'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const templateStore = useTemplateStore()

const currentId = ref(props.id || (route.params.id as string))
const template = ref<Template | null>(null)
const templateLoading = ref(true)
const templateNotFound = ref(false)

async function loadTemplate(id: string) {
  templateLoading.value = true
  templateNotFound.value = false
  const found = await templateStore.fetchOne(id)
  if (found) {
    template.value = found
  } else {
    templateNotFound.value = true
  }
  templateLoading.value = false
}

watch(currentId, (id) => loadTemplate(id), { immediate: true })
watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && id !== currentId.value) currentId.value = id
  },
)

const activePanel = ref<RailKey>('template')
const stageRef = ref<InstanceType<typeof CanvasStage>>()
const selection = ref<SelectionInfo | null>(null)
const history = ref({ canUndo: false, canRedo: false })
const saveDialogOpen = ref(false)
const resizeDialogOpen = ref(false)
const historyDialogOpen = ref(false)

function switchTemplate(id: string) {
  currentId.value = id
  router.replace(`/design/${id}`)
}

function selectPanel(key: RailKey) {
  if (key === 'ai') {
    window.open(router.resolve({ name: 'ai-tools' }).href, '_blank', 'noopener')
    return
  }
  activePanel.value = key
}

function onTextProp(prop: 'fontSize' | 'fill' | 'fontWeight' | 'textAlign', value: string | number) {
  stageRef.value?.setSelectedTextProp(prop, value)
}

function replaceViaUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => stageRef.value?.replaceSelectedImage(reader.result as string)
    reader.readAsDataURL(file)
  }
  input.click()
}

function download() {
  const dataUrl = stageRef.value?.exportPNG()
  if (!dataUrl || !template.value) return
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${template.value.name}.png`
  a.click()
}

function onSaved(newId: string) {
  saveDialogOpen.value = false
  router.push(`/design/${newId}`)
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden bg-gray-50">
    <AppHeader />

    <div class="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div class="flex items-center gap-3">
        <el-button text :icon="ArrowLeft" @click="router.push('/')">返回</el-button>
        <span class="text-sm text-gray-500">{{ template?.name ?? '加载中…' }}</span>
      </div>

      <div class="flex items-center gap-2">
        <el-button text :icon="RefreshLeft" :disabled="!history.canUndo" @click="stageRef?.undo()" />
        <el-button text :icon="RefreshRight" :disabled="!history.canRedo" @click="stageRef?.redo()" />
        <el-button :icon="Crop" :disabled="!template" @click="resizeDialogOpen = true">尺寸调整</el-button>
        <el-button :icon="Clock" @click="historyDialogOpen = true">历史记录</el-button>
        <el-button :icon="Collection" :disabled="!template" @click="saveDialogOpen = true">
          另存为模板
        </el-button>
        <el-button
          type="primary"
          :icon="Download"
          :disabled="!template"
          class="!bg-violet-500 !border-none"
          @click="download"
        >
          下载
        </el-button>
      </div>
    </div>

    <div v-if="templateLoading" class="flex flex-1 items-center justify-center text-sm text-gray-400">
      模板加载中…
    </div>
    <div v-else-if="templateNotFound" class="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
      <p class="text-sm">没有找到这个模板，可能已被删除</p>
      <el-button @click="router.push('/')">返回首页</el-button>
    </div>

    <div v-else class="flex flex-1 overflow-hidden">
      <LeftIconRail :active="activePanel" @select="selectPanel" @add-text="stageRef?.addText()" />

      <div class="w-72 shrink-0 overflow-hidden border-r border-gray-200 bg-white">
        <TemplateSwitchPanel v-if="activePanel === 'template'" :active-id="currentId" @switch="switchTemplate" />
        <ImageToolsPanel v-else-if="activePanel === 'image'" @insert="(url) => stageRef?.addImage(url)" />
        <BackgroundPanel v-else-if="activePanel === 'background'" @pick="(c) => stageRef?.setBackground(c)" />
        <ShapePanel
          v-else-if="activePanel === 'shape'"
          @add="(c) => stageRef?.addRect(c)"
          @add-image="(url) => stageRef?.addImage(url)"
        />
        <UploadPanel v-else-if="activePanel === 'upload'" @add="(url) => stageRef?.addImage(url)" />
        <PlaceholderPanel v-else label="素材图片库" />
      </div>

      <div class="relative flex-1 overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
        <CanvasStage
          v-if="template"
          ref="stageRef"
          :template="template"
          @selection="selection = $event"
          @history="history = $event"
        />

        <div v-if="selection" class="absolute left-1/2 top-4 -translate-x-1/2">
          <SelectionToolbar
            :selection="selection"
            @text-prop="onTextProp"
            @replace-image="replaceViaUpload"
            @delete="stageRef?.deleteSelected()"
          />
        </div>
      </div>
    </div>

    <SaveTemplateDialog v-model="saveDialogOpen" :stage="stageRef" @saved="onSaved" />
    <ResizeDialog
      v-if="template"
      v-model="resizeDialogOpen"
      :width="template.canvasWidth"
      :height="template.canvasHeight"
      @resize="(w, h) => stageRef?.resizeCanvas(w, h)"
    />
    <HistoryDialog
      v-model="historyDialogOpen"
      @insert-image="(url) => stageRef?.addImage(url)"
      @insert-text="(text) => stageRef?.addText(text)"
    />
  </div>
</template>
