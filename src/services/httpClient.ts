const TOKEN_KEY = 'image-studio.authToken'

export function authToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

async function parseErrorOrThrow(res: Response, label: string): Promise<never> {
  let detail = `${label}：${res.status}`
  try {
    const data = await res.json()
    if (data?.detail) detail = `${label}：${data.detail}`
  } catch {
    // 非 JSON 响应体时保留默认错误信息
  }
  throw new Error(detail)
}

export async function authPostJson<T>(path: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(`/api/ai${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) return parseErrorOrThrow(res, label)
  return res.json()
}

export async function authGetJson<T>(path: string, label: string): Promise<T> {
  const res = await fetch(`/api/ai${path}`, {
    headers: { Authorization: `Bearer ${authToken()}` },
  })
  if (!res.ok) return parseErrorOrThrow(res, label)
  return res.json()
}

export async function authDeleteJson<T>(path: string, label: string): Promise<T> {
  const res = await fetch(`/api/ai${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken()}` },
  })
  if (!res.ok) return parseErrorOrThrow(res, label)
  return res.json()
}

export async function authPostForm<T>(path: string, form: FormData, label: string): Promise<T> {
  const res = await fetch(`/api/ai${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken()}` },
    body: form,
  })
  if (!res.ok) return parseErrorOrThrow(res, label)
  return res.json()
}
