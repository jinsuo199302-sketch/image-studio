export interface AuthUser {
  id: string
  email: string
  created_at: string
}

export interface AuthResult {
  token: string
  user: AuthUser
}

async function parseErrorOrThrow(res: Response): Promise<never> {
  let detail = `请求失败：${res.status}`
  try {
    const data = await res.json()
    if (data?.detail) detail = data.detail
  } catch {
    // 非 JSON 响应体时保留默认错误信息
  }
  throw new Error(detail)
}

export async function register(email: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return parseErrorOrThrow(res)
  return res.json()
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) return parseErrorOrThrow(res)
  return res.json()
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return parseErrorOrThrow(res)
  return res.json()
}
