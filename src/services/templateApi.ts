import axios from 'axios'
import type { Template } from '../data/templates'

const http = axios.create({ baseURL: '/api' })

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

export async function listTemplates(category?: string): Promise<Template[]> {
  const res = await http.get<{ list: BackendTemplate[] }>('/templates', {
    params: category && category !== '全部分类' ? { category } : {},
  })
  return res.data.list.map(toFrontend)
}

export async function getTemplate(id: string): Promise<Template> {
  const res = await http.get<BackendTemplate>(`/templates/${id}`)
  return toFrontend(res.data)
}

export async function createTemplate(payload: CreateTemplatePayload): Promise<Template> {
  const res = await http.post<BackendTemplate>('/templates', toBackendPayload(payload))
  return toFrontend(res.data)
}

export async function deleteTemplate(id: string): Promise<void> {
  await http.delete(`/templates/${id}`)
}
