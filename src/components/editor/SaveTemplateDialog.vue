<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CATEGORIES } from '../../data/templates'
import { useTemplateStore } from '../../stores/templates'
import type CanvasStage from './CanvasStage.vue'

const props = defineProps<{ modelValue: boolean; stage: InstanceType<typeof CanvasStage> | undefined }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'saved', id: string) }>()

const templateStore = useTemplateStore()
const saving = ref(false)
const form = reactive({ name: '', category: '广告设计' })

const SAVE_CATEGORIES = CATEGORIES.filter((c) => c !== '全部分类')

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入模板名称')
    return
  }
  if (!props.stage) return
  saving.value = true
  try {
    const data = props.stage.serialize()
    const created = await templateStore.createTemplate({
      name: form.name.trim(),
      category: form.category,
      ...data,
    })
    ElMessage.success('已保存为新模板')
    form.name = ''
    emit('saved', created.id)
  } catch {
    ElMessage.error('保存失败，请检查后端服务是否已启动')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="另存为模板"
    width="420px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-form label-position="top">
      <el-form-item label="模板名称">
        <el-input v-model="form.name" placeholder="给这个模板起个名字" maxlength="30" />
      </el-form-item>
      <el-form-item label="分类">
        <el-select v-model="form.category" class="w-full">
          <el-option v-for="c in SAVE_CATEGORIES" :key="c" :label="c" :value="c" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
