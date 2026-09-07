import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

/** 二维码"扫码看文字"要指向一个公网能打开的页面。桌面版的 baseURL 是本机 127.0.0.1，
 * 手机扫了打不开——所以固定用线上站点存 snippet、生成线上短链。 */
export const SNIPPET_SITE = 'https://picflowlab.cn'

export interface Snippet {
  id: string
  content: string
}

export async function createSnippet(content: string): Promise<Snippet> {
  const res = await http.post<Snippet>('/snippets', { content })
  return res.data
}

/** 在线上站点存一段文字，返回可被任意设备（含微信）打开的页面链接 */
export async function createSnippetLink(content: string): Promise<string> {
  const res = await axios.post<Snippet>(`${SNIPPET_SITE}/api/snippets`, { content }, { timeout: 15000 })
  return `${SNIPPET_SITE}/s/${res.data.id}`
}

export async function getSnippet(id: string): Promise<Snippet> {
  const res = await http.get<Snippet>(`/snippets/${id}`)
  return res.data
}
