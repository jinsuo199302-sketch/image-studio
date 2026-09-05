export interface AuthUser {
  id: string
  email: string
  credits: number
  is_member: boolean
  membership_until: string | null
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

async function postAuth(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    // fetch 直接抛（网络层失败）——桌面版最常见是系统代理没放行本地地址
    throw new Error('连不上本地服务，若开着 VPN / 加速器请把它关掉或重启本软件再试')
  }
}

export async function register(email: string, password: string): Promise<AuthResult> {
  const res = await postAuth('/api/auth/register', { email, password })
  if (!res.ok) return parseErrorOrThrow(res)
  return res.json()
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await postAuth('/api/auth/login', { email, password })
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
