import { authDeleteJson, authGetJson } from './httpClient'

export interface GeneratedAsset {
  id: string
  category: string
  url: string
  createdAt: string
}

/** "素材"面板用——只是当前登录用户自己生成/保存的图，不是公共素材库 */
export async function listGeneratedAssets(category?: string): Promise<GeneratedAsset[]> {
  const query = category ? `?category=${encodeURIComponent(category)}` : ''
  const result = await authGetJson<{ list: GeneratedAsset[] }>(`/assets${query}`, '素材加载失败')
  return result.list
}

export async function deleteGeneratedAsset(id: string): Promise<void> {
  await authDeleteJson<{ deleted: boolean }>(`/assets/${id}`, '素材删除失败')
}
