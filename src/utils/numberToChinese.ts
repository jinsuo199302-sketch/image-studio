// 数字 → 中文：人民币金额大写、中文大写数字、中文小写数字。纯前端算法，无依赖。

const DIGITS_UPPER = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
const DIGITS_LOWER = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const SMALL_UNIT_UPPER = ['', '拾', '佰', '仟']
const SMALL_UNIT_LOWER = ['', '十', '百', '千']

interface Opts {
  upper: boolean
}

/** 0~9999 -> 中文（不含节单位）。needLeadingZero 表示这一节前面有更高位，若本节 <1000 要补"零"。 */
function fourToChinese(num: number, opts: Opts, needLeadingZero: boolean): string {
  const digits = opts.upper ? DIGITS_UPPER : DIGITS_LOWER
  const unit = opts.upper ? SMALL_UNIT_UPPER : SMALL_UNIT_LOWER
  if (num === 0) return ''
  let res = ''
  let zeroPending = false
  for (let pos = 3; pos >= 0; pos--) {
    const d = Math.floor(num / 10 ** pos) % 10
    if (d === 0) {
      if (res !== '') zeroPending = true
    } else {
      if (zeroPending) res += digits[0]
      zeroPending = false
      res += digits[d] + unit[pos]
    }
  }
  if (needLeadingZero && num < 1000) res = digits[0] + res
  return res
}

/** 8 位以内 -> 中文（含"万"，不含"亿"） */
function belowYi(n: number, opts: Opts, hasHigher: boolean): string {
  const wan = Math.floor(n / 10000)
  const rest = n % 10000
  if (wan === 0) return fourToChinese(rest, opts, hasHigher)
  let res = fourToChinese(wan, opts, hasHigher) + '万'
  if (rest !== 0) res += fourToChinese(rest, opts, true)
  return res
}

/** 非负整数字符串 -> 中文 */
function intToChinese(intStr: string, opts: Opts): string {
  const digits = opts.upper ? DIGITS_UPPER : DIGITS_LOWER
  intStr = intStr.replace(/^0+/, '') || '0'
  if (intStr === '0') return digits[0]

  // 按 10^8（亿）递归切
  if (intStr.length <= 8) {
    return belowYi(Number(intStr), opts, false)
  }
  const high = intStr.slice(0, intStr.length - 8)
  const low = Number(intStr.slice(-8))
  let res = intToChinese(high, opts) + '亿'
  if (low !== 0) res += belowYi(low, opts, low < 10 ** 7)
  return res
}

/** 人民币金额大写：如 12345.67 -> 壹万贰仟叁佰肆拾伍元陆角柒分 */
export function toRmbUpper(input: string | number): string {
  let s = String(input).trim().replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return '请输入有效数字'
  let neg = false
  if (s.startsWith('-')) {
    neg = true
    s = s.slice(1)
  }
  const [intPart, decRaw = ''] = s.split('.')
  const decPart = (decRaw + '00').slice(0, 2)
  const jiao = Number(decPart[0])
  const fen = Number(decPart[1])

  const intChinese = intToChinese(intPart, { upper: true })
  let out = ''
  if (intChinese !== '零') out += intChinese + '元'

  if (jiao === 0 && fen === 0) {
    out = (out || '零元') + '整'
  } else {
    if (jiao === 0 && out !== '') out += '零'
    if (jiao > 0) out += DIGITS_UPPER[jiao] + '角'
    if (fen > 0) out += DIGITS_UPPER[fen] + '分'
    if (out === '') out = '零元'
  }
  return (neg ? '负' : '') + out
}

/** 中文数字（大写或小写）：如 12345 -> 一万二千三百四十五 / 壹万贰仟叁佰肆拾伍 */
export function toChineseNumber(input: string | number, upper: boolean): string {
  let s = String(input).trim().replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return '请输入有效数字'
  let neg = false
  if (s.startsWith('-')) {
    neg = true
    s = s.slice(1)
  }
  const [intPart, decPart] = s.split('.')
  const digits = upper ? DIGITS_UPPER : DIGITS_LOWER
  let out = intToChinese(intPart, { upper })
  // 小写"一十X"在开头读作"十X"
  if (!upper && out.startsWith('一十')) out = out.slice(1)
  if (decPart) {
    out += '点' + decPart.split('').map((d) => digits[Number(d)]).join('')
  }
  return (neg ? '负' : '') + out
}
