/**
 * 给 canvas.toDataURL('image/png') 产出的 PNG 手动塞一个 pHYs 分辨率块。
 *
 * 背景：Canvas API 画出来的图片本身没有"多少 DPI"这个概念——300dpi 那个数字只是我们
 * 自己在算"多少毫米该对应多少像素"时用的换算系数，图片文件本身默认不带任何分辨率
 * 元数据。大多数冲印店/家用打印机只看像素尺寸，不看这个不影响使用；但小部分会读取
 * 这个元数据的软件（比如 Photoshop 打开时判断"这张图是多大尺寸"）如果没有这个块，
 * 会按网页默认的 96dpi 去猜，显示出来的物理尺寸会不对——所以补上更规范。
 *
 * PNG 格式本身是公开、良好文档化的二进制格式，pHYs 块的写法（长度+类型+数据+CRC32）
 * 是标准里明文规定的，不是猜的。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint32BE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, false)
}

/** dpi -> 每米像素数（PNG pHYs 块要求的单位），1 英寸 = 0.0254 米 */
function dpiToPixelsPerMeter(dpi: number): number {
  return Math.round(dpi / 0.0254)
}

export function embedPngDpi(pngDataUrl: string, dpi: number): string {
  const base64 = pngDataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  // PNG 签名 8 字节 + 第一个块必然是 IHDR（长度4+类型4+数据13+CRC4=25字节），
  // pHYs 紧跟在 IHDR 后面插入，符合 PNG 规范里"pHYs 必须出现在第一个 IDAT 之前"的要求
  const ihdrEnd = 8 + 25
  const pxPerMeter = dpiToPixelsPerMeter(dpi)

  const chunkData = new Uint8Array(9)
  const dataView = new DataView(chunkData.buffer)
  writeUint32BE(dataView, 0, pxPerMeter)
  writeUint32BE(dataView, 4, pxPerMeter)
  chunkData[8] = 1 // unit specifier: 1 = meter

  const typeBytes = new Uint8Array([0x70, 0x48, 0x59, 0x73]) // "pHYs"
  const crcInput = new Uint8Array(typeBytes.length + chunkData.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(chunkData, typeBytes.length)
  const crc = crc32(crcInput)

  const chunk = new Uint8Array(4 + 4 + chunkData.length + 4)
  const chunkView = new DataView(chunk.buffer)
  writeUint32BE(chunkView, 0, chunkData.length)
  chunk.set(typeBytes, 4)
  chunk.set(chunkData, 8)
  writeUint32BE(chunkView, 8 + chunkData.length, crc)

  const result = new Uint8Array(bytes.length + chunk.length)
  result.set(bytes.subarray(0, ihdrEnd), 0)
  result.set(chunk, ihdrEnd)
  result.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length)

  let resultBinary = ''
  for (let i = 0; i < result.length; i++) resultBinary += String.fromCharCode(result[i])
  return 'data:image/png;base64,' + btoa(resultBinary)
}
