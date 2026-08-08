<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useApiConfigStore } from '../stores/apiConfig'
import type { ApiConfig } from '../types'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const store = useApiConfigStore()

function cloneConfig(c: ApiConfig): ApiConfig {
  return { baseUrl: c.baseUrl, apiKey: c.apiKey }
}

const form = reactive({
  image: cloneConfig(store.image),
  text: cloneConfig(store.text),
  video: cloneConfig(store.video),
})

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.image = cloneConfig(store.image)
      form.text = cloneConfig(store.text)
      form.video = cloneConfig(store.video)
    }
  },
)

function save() {
  store.saveAll({
    image: cloneConfig(form.image),
    text: cloneConfig(form.text),
    video: cloneConfig(form.video),
  })
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="生成接口设置"
    width="480px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="mb-4 text-xs text-gray-500">
      分别填入图片 / 文字（写作+翻译共用）/ 视频三组接口的 base_url 与 API Key；
      某一组留空时，对应功能使用占位结果运行在演示模式。
    </p>

    <el-form label-position="top">
      <p class="mb-2 text-xs font-medium text-gray-700">图片生成（AI 生图 / 抠图 / 高清放大）</p>
      <el-form-item label="Base URL">
        <el-input v-model="form.image.baseUrl" placeholder="https://your-proxy.example.com/v1" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="form.image.apiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>

      <el-divider class="!my-3" />

      <p class="mb-2 text-xs font-medium text-gray-700">文字生成（AI 写作 / AI 翻译）</p>
      <el-form-item label="Base URL">
        <el-input v-model="form.text.baseUrl" placeholder="https://your-proxy.example.com/v1" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="form.text.apiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>

      <el-divider class="!my-3" />

      <p class="mb-2 text-xs font-medium text-gray-700">视频生成（AI 视频）</p>
      <el-form-item label="Base URL">
        <el-input v-model="form.video.baseUrl" placeholder="https://your-proxy.example.com/v1" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="form.video.apiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
