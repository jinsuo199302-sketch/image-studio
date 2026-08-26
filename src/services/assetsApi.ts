import { authDeleteJson, authGetJson, authPostForm } from './httpClient'

export interface GeneratedAsset {
  id: string
  category: string
  url: string
  createdAt: string
}

export interface ReferenceAssetRegion {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 参考图里框选一小块区域 → 提炼风格类别 → 生成全新的独立插画/文字素材 → 抠成透明背景。
 * 只学"手法类别"不抄具体表达——插画防"抄具体外形"，文字防"抄原文文字"，
 * 见 backend/app/ai_proxy.py 的 design_reference_to_asset。
 */
export async function generateReferenceAsset(
  imageFile: File,
  region: ReferenceAssetRegion,
  assetType: 'illustration' | 'text',
  text?: string,
): Promise<{ assetId: string; url: string; styleDescription: string }> {
  const form = new FormData()
  form.append('image', imageFile, imageFile.name || 'reference.png')
  form.append('region_x', String(region.x))
  form.append('region_y', String(region.y))
  form.append('region_width', String(region.width))
  form.append('region_height', String(region.height))
  form.append('asset_type', assetType)
  if (text) form.append('text', text)
  return authPostForm('/design/reference-to-asset', form, '素材生成失败')
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
