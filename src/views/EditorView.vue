<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, RefreshLeft, RefreshRight, Download, Collection, Crop, Clock } from '@element-plus/icons-vue'
import AppHeader from '../components/AppHeader.vue'
import CanvasStage, { type SelectionInfo } from '../components/editor/CanvasStage.vue'
import LeftIconRail, { type RailKey } from '../components/editor/LeftIconRail.vue'
import SelectionPanel from '../components/editor/panels/SelectionPanel.vue'
import SaveTemplateDialog from '../components/editor/SaveTemplateDialog.vue'
import ResizeDialog from '../components/editor/ResizeDialog.vue'
import HistoryDialog from '../components/editor/HistoryDialog.vue'
import ImageAdjustDialog from '../components/editor/ImageAdjustDialog.vue'
import EraseDialog from '../components/editor/EraseDialog.vue'
import TextReplaceDialog from '../components/editor/TextReplaceDialog.vue'
import TemplateSwitchPanel from '../components/editor/panels/TemplateSwitchPanel.vue'
import BackgroundPanel from '../components/editor/panels/BackgroundPanel.vue'
import ShapePanel from '../components/editor/panels/ShapePanel.vue'
import UploadPanel from '../components/editor/panels/UploadPanel.vue'
import ImageToolsPanel from '../components/editor/panels/ImageToolsPanel.vue'
import MaterialsPanel from '../components/editor/panels/MaterialsPanel.vue'
import AIDesignPanel from '../components/editor/panels/AIDesignPanel.vue'
import PlaceholderPanel from '../components/editor/panels/PlaceholderPanel.vue'
import type { Template } from '../data/templates'
import type { GeneratedDesign } from '../services/designApi'
import { saveFile } from '../utils/saveFile'
import { useTemplateStore } from '../stores/templates'
import { useAuthStore } from '../stores/auth'
import { removeBackground } from '../services/backgroundRemovalApi'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const templateStore = useTemplateStore()
const authStore = useAuthStore()

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
const removingBackground = ref(false)
const adjustDialogOpen = ref(false)
const eraseDialogOpen = ref(false)
const textReplaceDialogOpen = ref(false)

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

function onTextProp(
  prop:
    | 'fontSize'
    | 'fill'
    | 'fontFamily'
    | 'fontWeight'
    | 'fontStyle'
    | 'underline'
    | 'textAlign'
    | 'lineHeight'
    | 'charSpacing',
  value: string | number | boolean,
) {
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

const PNG_LONG_EDGE: Record<string, number | undefined> = { png: undefined, '2k': 2560, '4k': 3840 }

async function download(command = 'png') {
  const dataUrl = stageRef.value?.exportPNG(PNG_LONG_EDGE[command])
  if (!dataUrl || !template.value) return
  const suffix = command === 'png' ? '' : `-${command.toUpperCase()}`
  await saveFile(`${template.value.name}${suffix}.png`, dataUrl)
}

/** SVG 是矢量序列化（Fabric toSVG()），不是截图。 */
async function downloadSVG() {
  const svg = stageRef.value?.exportSVG()
  if (!svg || !template.value) return
  await saveFile(`${template.value.name}.svg`, new Blob([svg], { type: 'image/svg+xml' }))
}

function onDownloadCommand(command: string) {
  if (command === 'svg') downloadSVG()
  else download(command)
}

function onSaved(newId: string) {
  saveDialogOpen.value = false
  router.push(`/design/${newId}`)
}

async function onApplyDesign(design: GeneratedDesign) {
  try {
    await ElMessageBox.confirm('应用 AI 生成的设计会替换当前画布上的全部内容，确定继续吗？', '应用设计', {
      confirmButtonText: '应用',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await stageRef.value?.applyGeneratedDesign(design.elements, design.background)
  if (design.titleStyle) {
    // 参考图生成里标题永远是 elements[1]（elements[0] 固定是背景图），见 AIDesignPanel.applyReferenceBackground
    stageRef.value?.selectObjectAt(1)
    stageRef.value?.applyTextEffectPreset(design.titleStyle.effect)
    if (design.titleStyle.warp !== 'none') {
      stageRef.value?.setSelectedTextWarp(design.titleStyle.warp, 30)
    }
    stageRef.value?.deselectActive()
  }
}

async function onRemoveBackground() {
  if (!selection.value?.src || removingBackground.value) return
  removingBackground.value = true
  try {
    const result = await removeBackground(authStore.isAuthenticated, selection.value.src)
    await stageRef.value?.replaceSelectedImage(result)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '抠图失败，请重试')
  } finally {
    removingBackground.value = false
  }
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
        <el-dropdown
          split-button
          type="primary"
          class="!ml-1 [&_.el-button--primary]:!bg-violet-500 [&_.el-button--primary]:!border-none"
          :disabled="!template"
          @click="download()"
          @command="onDownloadCommand"
        >
          <el-icon class="mr-1"><Download /></el-icon>
          下载
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="png">下载 PNG（标准）</el-dropdown-item>
              <el-dropdown-item command="2k">下载 PNG · 2K（2560px）</el-dropdown-item>
              <el-dropdown-item command="4k">下载 PNG · 4K（3840px）</el-dropdown-item>
              <el-dropdown-item command="svg" divided>下载 SVG（矢量）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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
        <SelectionPanel
          v-if="selection"
          :selection="selection"
          :removing-background="removingBackground"
          @close="stageRef?.deselectActive()"
          @text-prop="onTextProp"
          @text-shadow="(enabled) => stageRef?.setSelectedTextShadow(enabled)"
          @text-shadow-detail="(detail) => stageRef?.setSelectedTextShadowDetail(detail)"
          @text-stroke="(enabled) => stageRef?.setSelectedTextStroke(enabled)"
          @text-stroke-width="(width) => stageRef?.setSelectedTextStrokeWidth(width)"
          @text-stroke-color="(color) => stageRef?.setSelectedTextStrokeColor(color)"
          @text-gradient="(colors) => stageRef?.setSelectedTextGradient(colors)"
          @text-background="(enabled) => stageRef?.setSelectedTextBackground(enabled)"
          @text-background-color="(color) => stageRef?.setSelectedTextBackground(true, color)"
          @text-effect-preset="(preset) => stageRef?.applyTextEffectPreset(preset)"
          @text-warp="(kind, intensity) => stageRef?.setSelectedTextWarp(kind, intensity)"
          @rect-fill="(color) => stageRef?.setSelectedRectFill(color)"
          @table-theme="(theme) => stageRef?.updateTableStyle({ theme })"
          @table-font="(fontFamily) => stageRef?.updateTableStyle({ fontFamily })"
          @table-font-size="(size) => stageRef?.updateTableStyle({ fontSize: size })"
          @table-bold="(enabled) => stageRef?.updateTableStyle({ bold: enabled })"
          @table-italic="(enabled) => stageRef?.updateTableStyle({ italic: enabled })"
          @table-underline="(enabled) => stageRef?.updateTableStyle({ underline: enabled })"
          @table-align="(align) => stageRef?.updateTableStyle({ align })"
          @table-rows="(count) => stageRef?.updateTableStyle({ rows: count })"
          @table-cols="(count) => stageRef?.updateTableStyle({ cols: count })"
          @table-transpose="stageRef?.updateTableStyle({ transpose: true })"
          @table-clear-all="stageRef?.updateTableStyle({ clearAll: true })"
          @table-merge="(range) => stageRef?.updateTableStyle({ mergeRange: range })"
          @opacity="(value) => stageRef?.setSelectedOpacity(value)"
          @opacity-commit="stageRef?.commitSelectedOpacity()"
          @blend-mode="(mode) => stageRef?.setSelectedBlendMode(mode)"
          @toggle-lock="stageRef?.setSelectedLocked(!selection?.locked)"
          @toggle-vertical="stageRef?.setSelectedVertical(!selection?.vertical)"
          @list-format="(kind) => stageRef?.applySelectedListFormat(kind)"
          @bring-forward="stageRef?.bringSelectedForward()"
          @send-backward="stageRef?.sendSelectedBackward()"
          @duplicate="stageRef?.duplicateSelected()"
          @replace-image="replaceViaUpload"
          @remove-background="onRemoveBackground"
          @erase-object="eraseDialogOpen = true"
          @text-replace="textReplaceDialogOpen = true"
          @adjust-image="adjustDialogOpen = true"
          @delete="stageRef?.deleteSelected()"
        />
        <TemplateSwitchPanel v-else-if="activePanel === 'template'" :active-id="currentId" @switch="switchTemplate" />
        <AIDesignPanel
          v-else-if="activePanel === 'ai-design' && template"
          :canvas-width="template.canvasWidth"
          :canvas-height="template.canvasHeight"
          @apply-design="onApplyDesign"
          @insert-image="(url) => stageRef?.addImage(url)"
        />
        <ImageToolsPanel v-else-if="activePanel === 'image'" @insert="(url) => stageRef?.addImage(url)" />
        <BackgroundPanel v-else-if="activePanel === 'background'" @pick="(c) => stageRef?.setBackground(c)" />
        <ShapePanel
          v-else-if="activePanel === 'shape'"
          @add="(c) => stageRef?.addRect(c)"
          @add-image="(url) => stageRef?.addImage(url)"
          @add-chart="(kind) => stageRef?.addChart(kind)"
          @add-legend="(kind) => stageRef?.addLegend(kind)"
          @add-diagram="(kind) => stageRef?.addDiagram(kind)"
          @add-table="(kind) => stageRef?.addDataTable(kind)"
        />
        <UploadPanel v-else-if="activePanel === 'upload'" @add="(url) => stageRef?.addImage(url)" />
        <MaterialsPanel v-else-if="activePanel === 'material'" @insert="(url) => stageRef?.addImage(url)" />
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
    <ImageAdjustDialog
      v-model="adjustDialogOpen"
      @change="(v) => stageRef?.setSelectedImageAdjust(v)"
      @commit="stageRef?.commitSelectedImageAdjust()"
    />
    <EraseDialog
      v-model="eraseDialogOpen"
      :image-src="selection?.src ?? ''"
      @result="(url) => stageRef?.replaceSelectedImage(url)"
    />
    <TextReplaceDialog
      v-model="textReplaceDialogOpen"
      :image-src="selection?.src ?? ''"
      @result="(url) => stageRef?.replaceSelectedImage(url)"
    />
  </div>
</template>
