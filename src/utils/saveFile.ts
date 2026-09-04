/**
 * 统一的"保存文件到本地"入口。
 *
 * 网页版（nginx / 浏览器）：老办法，造一个 <a download> 点一下。
 * 桌面版（PyInstaller 打包 + pywebview 原生窗口）：WebView2 会静默吞掉
 *   <a download> / blob: / data: 这类程序触发的下载，所以改走 Python 桥
 *   `window.pywebview.api.save_file(filename, dataUrl)`，弹一个原生"另存为"对话框。
 *
 * 所有工具的"下载 / 导出"都应该调这个，不要再自己 createElement('a')。
 */

export function isDesktopApp(): boolean {
  return typeof (window as unknown as { pywebview?: unknown }).pywebview !== 'undefined'
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error ?? new Error('读取失败'))
    r.readAsDataURL(blob)
  })
}

type PyApi = { save_file?: (name: string, dataUrl: string) => Promise<{ ok?: boolean; canceled?: boolean; path?: string } | null> }

/**
 * @param filename 建议的文件名（含扩展名）
 * @param data     Blob，或 data:URL 字符串，或纯 base64 字符串
 * @returns 桌面版：用户确认保存返回 true，取消返回 false；网页版恒为 true
 */
export async function saveFile(filename: string, data: Blob | string): Promise<boolean> {
  const api = (window as unknown as { pywebview?: { api?: PyApi } }).pywebview?.api

  if (api?.save_file) {
    let dataUrl: string
    if (typeof data !== 'string') {
      dataUrl = await blobToDataUrl(data)
    } else if (data.startsWith('data:')) {
      dataUrl = data
    } else {
      // blob: / http(s): / 相对路径 —— 先取回成 Blob 再转 dataURL
      dataUrl = await blobToDataUrl(await (await fetch(data)).blob())
    }
    const res = await api.save_file(filename, dataUrl)
    if (res && res.ok === false && !res.canceled) throw new Error('保存失败')
    return !(res && res.canceled)
  }

  // 浏览器兜底：老办法
  const url = typeof data === 'string' ? data : URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}
