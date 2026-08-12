import axios from 'axios'
import type { Template } from '../data/templates'
import { authToken } from './httpClient'

const http = axios.create({ baseURL: '/api' })

function authHeaders() {
  const token = authToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface BackendTemplate {
  id: string
  name: string
  category: string
  scene: string
  industry: string
  canvas_width: number
  canvas_height: number
  background: string
  thumbnail: string
  elements: Template['elements']
  is_official: number
  created_at: string
}

function toFrontend(t: BackendTemplate): Template {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    scene: t.scene ?? '全部场景',
    industry: t.industry ?? '通用场景',
    canvasWidth: t.canvas_width,
    canvasHeight: t.canvas_height,
    background: t.background,
    thumbnail: t.thumbnail,
    elements: t.elements,
    createdAt: t.created_at,
  }
}

export interface CreateTemplatePayload {
  name: string
  category: string
  scene: string
  industry: string
  canvasWidth: number
  canvasHeight: number
  background: string
  thumbnail: string
  elements: Template['elements']
}

function toBackendPayload(p: CreateTemplatePayload) {
  return {
    name: p.name,
    category: p.category,
    scene: p.scene,
    industry: p.industry,
    canvas_width: p.canvasWidth,
    canvas_height: p.canvasHeight,
    background: p.background,
    thumbnail: p.thumbnail,
    elements: p.elements,
  }
}

export async function listTemplates(category?: string, mine = false): Promise<Template[]> {
  const params: Record<string, string> = {}
  if (category && category !== '全部分类') params.category = category
  if (mine) params.mine = 'true'
  const res = await http.get<{ list: BackendTemplate[] }>('/templates', { params, headers: authHeaders() })
  return res.data.list.map(toFrontend)
}

export async function getTemplate(id: string): Promise<Template> {
  const res = await http.get<BackendTemplate>(`/templates/${id}`, { headers: authHeaders() })
  return toFrontend(res.data)
}

export async function createTemplate(payload: CreateTemplatePayload): Promise<Template> {
  const res = await http.post<BackendTemplate>('/templates', toBackendPayload(payload), { headers: authHeaders() })
  return toFrontend(res.data)
}

export async function deleteTemplate(id: string): Promise<void> {
  await http.delete(`/templates/${id}`, { headers: authHeaders() })
}
