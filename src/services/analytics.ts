import { authToken } from './httpClient'

/** 轻量埋点：上报"打开了某个工具"。fire-and-forget，失败静默，不阻塞任何东西。 */
export function logView(feature: string) {
  try {
    fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      body: JSON.stringify({ feature, kind: 'view' }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
