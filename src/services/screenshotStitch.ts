/**
 * 微信长截图拼接——纯前端 Canvas 处理，不调用任何后端接口，零 AI 成本。
 * 核心思路：相邻两张截图之间必然有一段重叠内容（微信长截图本来就是"往下滑一点再截一张"），
 * 找到这段重叠区域的高度，拼接时只保留一份，而不是简单地把图片依次贴在一起（会导致重复内容）。
 */

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

function drawToImageData(img: HTMLImageElement, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

function rowDiff(a: ImageData, b: ImageData, rowA: number, rowB: number, width: number): number {
  let sum = 0
  const stride = 4
  let count = 0
  for (let x = 0; x < width; x += stride) {
    const ia = (rowA * width + x) * 4
    const ib = (rowB * width + x) * 4
    sum += Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2])
    count++
  }
  return count ? sum / count : Infinity
}

/**
 * 在低分辨率代理图上搜索最佳重叠高度（占图片高度的比例），避免直接在原图全分辨率上
 * 逐行比较——截图动辄上千像素高，全分辨率搜索会很慢，降采样后搜索快且足够准。
 * 每个候选重叠高度取样多行比较（不是只比较边缘一行），减少偶然对上一行就误判的情况。
 */
function findOverlapFraction(prevData: ImageData, curData: ImageData, width: number, prevH: number, curH: number): number {
  const minH = Math.floor(Math.min(prevH, curH) * 0.05)
  const maxH = Math.floor(Math.min(prevH, curH) * 0.85)
  let bestH = 0
  let bestScore = Infinity
  const samples = 6
  for (let h = minH; h <= maxH; h++) {
    let score = 0
    for (let s = 0; s < samples; s++) {
      const rowPrev = prevH - h + Math.floor((h * s) / samples)
      const rowCur = Math.floor((h * s) / samples)
      score += rowDiff(prevData, curData, rowPrev, rowCur, width)
    }
    if (score < bestScore) {
      bestScore = score
      bestH = h
    }
  }
  // 分数太高说明根本没找到像样的重叠（比如两张图内容完全不连续），此时不硬拼掉一截，返回 0
  const avgScore = bestScore / samples
  return avgScore < 30 ? bestH / Math.min(prevH, curH) : 0
}

export async function stitchScreenshots(files: File[]): Promise<string> {
  if (files.length < 2) throw new Error('至少需要 2 张截图')
  const dataUrls = await Promise.all(files.map(fileToDataUrl))
  const imgs = await Promise.all(dataUrls.map(loadImage))

  const targetWidth = imgs[0].naturalWidth
  // 每张图按第一张的宽度等比缩放后的实际高度——截图理论上应该同宽，万一不同也不至于拼歪
  const scaledHeights = imgs.map((img) => Math.round(img.naturalHeight * (targetWidth / img.naturalWidth)))

  const SEARCH_WIDTH = 120
  const overlapFractions: number[] = [0]
  for (let i = 1; i < imgs.length; i++) {
    const prevSearchH = Math.round(SEARCH_WIDTH * (scaledHeights[i - 1] / targetWidth))
    const curSearchH = Math.round(SEARCH_WIDTH * (scaledHeights[i] / targetWidth))
    const prevData = drawToImageData(imgs[i - 1], SEARCH_WIDTH, prevSearchH)
    const curData = drawToImageData(imgs[i], SEARCH_WIDTH, curSearchH)
    overlapFractions.push(findOverlapFraction(prevData, curData, SEARCH_WIDTH, prevSearchH, curSearchH))
  }

  // 每张图（除第一张外）实际要贴上去的高度 = 缩放后高度 - 跟上一张重叠的部分
  const drawHeights = scaledHeights.map((h, i) => (i === 0 ? h : h - Math.round(h * overlapFractions[i])))
  const totalHeight = drawHeights.reduce((a, b) => a + b, 0)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = totalHeight
  const ctx = canvas.getContext('2d')!

  let y = 0
  for (let i = 0; i < imgs.length; i++) {
    const skipTop = i === 0 ? 0 : Math.round(scaledHeights[i] * overlapFractions[i])
    // drawImage 的裁剪源坐标要按原图真实分辨率换算，不能直接用缩放后的像素值
    const sourceScale = imgs[i].naturalWidth / targetWidth
    ctx.drawImage(
      imgs[i],
      0,
      skipTop * sourceScale,
      imgs[i].naturalWidth,
      (scaledHeights[i] - skipTop) * sourceScale,
      0,
      y,
      targetWidth,
      scaledHeights[i] - skipTop,
    )
    y += drawHeights[i]
  }

  return canvas.toDataURL('image/png')
}
