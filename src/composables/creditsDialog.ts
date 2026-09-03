import { ref } from 'vue'

/** 全局充值弹窗开关。接口返回 402（次数不足）时自动弹出。 */
export const creditsDialogOpen = ref(false)

export function openCreditsDialog() {
  creditsDialogOpen.value = true
}
