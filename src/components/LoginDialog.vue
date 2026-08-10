<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const authStore = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const form = reactive({ email: '', password: '' })

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      mode.value = 'login'
      form.email = ''
      form.password = ''
      authStore.error = ''
    }
  },
)

async function submit() {
  const ok =
    mode.value === 'login'
      ? await authStore.login(form.email.trim(), form.password)
      : await authStore.register(form.email.trim(), form.password)
  if (ok) emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="mode === 'login' ? '登录' : '注册'"
    width="380px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="邮箱">
        <el-input v-model="form.email" placeholder="you@example.com" />
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" @keyup.enter="submit" />
      </el-form-item>
    </el-form>

    <p v-if="authStore.error" class="mb-2 text-xs text-red-500">{{ authStore.error }}</p>

    <button
      class="text-xs text-violet-500 hover:underline"
      @click="mode = mode === 'login' ? 'register' : 'login'"
    >
      {{ mode === 'login' ? '还没有账号？去注册' : '已有账号？去登录' }}
    </button>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="authStore.loading" @click="submit">
        {{ mode === 'login' ? '登录' : '注册' }}
      </el-button>
    </template>
  </el-dialog>
</template>
