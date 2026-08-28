/**
 * 极简 ZIP 打包（store 模式，不压缩）——图片本身已经是压缩格式，再 deflate 收益极小，
 * store 模式省掉一个第三方库。只实现打包，不实现解包。
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d = new Date()): { date: number; time: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { date, time }
}

export function makeStoreZip(entries: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder()
  const { date, time } = dosDateTime()
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const nameBytes = enc.encode(e.name)
    const crc = crc32(e.data)
    const size = e.data.length

    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true)
    lh.setUint16(4, 20, true) // version
    lh.setUint16(6, 0x0800, true) // flags: UTF-8 name
    lh.setUint16(8, 0, true) // method: store
    lh.setUint16(10, time, true)
    lh.setUint16(12, date, true)
    lh.setUint32(14, crc, true)
    lh.setUint32(18, size, true)
    lh.setUint32(22, size, true)
    lh.setUint16(26, nameBytes.length, true)
    lh.setUint16(28, 0, true)
    locals.push(new Uint8Array(lh.buffer), nameBytes, e.data)

    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true)
    ch.setUint16(4, 20, true)
    ch.setUint16(6, 20, true)
    ch.setUint16(8, 0x0800, true)
    ch.setUint16(10, 0, true)
    ch.setUint16(12, time, true)
    ch.setUint16(14, date, true)
    ch.setUint32(16, crc, true)
    ch.setUint32(20, size, true)
    ch.setUint32(24, size, true)
    ch.setUint16(28, nameBytes.length, true)
    ch.setUint32(42, offset, true)
    central.push(new Uint8Array(ch.buffer), nameBytes)

    offset += 30 + nameBytes.length + size
  }

  const centralSize = central.reduce((s, a) => s + a.length, 0)
  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, offset, true)

  const chunks = [...locals, ...central, new Uint8Array(eocd.buffer)]
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return new Blob([out.buffer as ArrayBuffer], { type: 'application/zip' })
}
