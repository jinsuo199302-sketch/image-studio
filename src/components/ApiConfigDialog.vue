<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useApiConfigStore } from '../stores/apiConfig'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const store = useApiConfigStore()
const form = reactive({ baseUrl: store.config.baseUrl, apiKey: store.config.apiKey })

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.baseUrl = store.config.baseUrl
      form.apiKey = store.config.apiKey
    }
  },
)

function save() {
  store.save({ ...form })
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
      填入第三方中转/代理接口的 base_url 与 API Key 后即可切换到真实生成；
      留空时界面使用占位图运行在演示模式。
    </p>
    <el-form label-position="top">
      <el-form-item label="Base URL">
        <el-input v-model="form.baseUrl" placeholder="https://your-proxy.example.com" />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
