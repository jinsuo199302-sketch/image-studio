import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

export interface Snippet {
  id: string
  content: string
}

export async function createSnippet(content: string): Promise<Snippet> {
  const res = await http.post<Snippet>('/snippets', { content })
  return res.data
}

export async function getSnippet(id: string): Promise<Snippet> {
  const res = await http.get<Snippet>(`/snippets/${id}`)
  return res.data
}
