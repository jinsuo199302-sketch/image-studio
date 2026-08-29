// 办公计算器：表达式求值、房贷、个税、价税分离、日期。纯函数，无依赖。

/** 安全表达式求值：只认数字、+ - * / ( ) . % 和 × ÷，不用 eval */
export function evalExpr(input: string): number | null {
  const s = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '')
  if (!s) return null
  if (!/^[0-9+\-*/().%]+$/.test(s)) return null

  const tokens = s.match(/(\d+\.?\d*|\.\d+|[+\-*/()%])/g)
  if (!tokens || tokens.join('') !== s) return null

  // 转后缀（调度场），% 作为"除以100"的一元后缀
  const out: (number | string)[] = []
  const ops: string[] = []
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
  let prev: string | null = null
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (/^[\d.]/.test(t)) {
      out.push(Number(t))
      prev = 'num'
    } else if (t === '%') {
      out.push(0.01, '*')
      prev = 'num'
    } else if (t === '(') {
      ops.push(t)
      prev = '('
    } else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!)
      if (!ops.length) return null
      ops.pop()
      prev = 'num'
    } else {
      // 一元负号
      if (t === '-' && (prev === null || prev === '(' || prev === 'op')) {
        out.push(0)
      }
      while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[t]) {
        out.push(ops.pop()!)
      }
      ops.push(t)
      prev = 'op'
    }
  }
  while (ops.length) {
    const op = ops.pop()!
    if (op === '(') return null
    out.push(op)
  }

  const st: number[] = []
  for (const t of out) {
    if (typeof t === 'number') {
      st.push(t)
    } else {
      const b = st.pop()
      const a = st.pop()
      if (a === undefined || b === undefined) return null
      st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : a / b)
    }
  }
  const r = st.length === 1 ? st[0] : null
  return r === null || !isFinite(r) ? null : Math.round(r * 1e10) / 1e10
}

// ---------------- 房贷 ----------------
export interface MortgageResult {
  method: 'equal-payment' | 'equal-principal'
  firstMonth: number
  lastMonth: number
  totalInterest: number
  totalPayment: number
  months: number
}

export function mortgage(
  principalWan: number,
  annualRatePct: number,
  years: number,
  method: 'equal-payment' | 'equal-principal',
): MortgageResult | null {
  const P = principalWan * 10000
  const n = Math.round(years * 12)
  const r = annualRatePct / 100 / 12
  if (P <= 0 || n <= 0 || r < 0) return null

  if (method === 'equal-payment') {
    const m = r === 0 ? P / n : (P * r * (1 + r) ** n) / ((1 + r) ** n - 1)
    const total = m * n
    return {
      method,
      firstMonth: m,
      lastMonth: m,
      totalInterest: total - P,
      totalPayment: total,
      months: n,
    }
  }
  const basePrincipal = P / n
  const first = basePrincipal + P * r
  const last = basePrincipal + basePrincipal * r
  const totalInterest = (P * r * (n + 1)) / 2
  return {
    method,
    firstMonth: first,
    lastMonth: last,
    totalInterest,
    totalPayment: P + totalInterest,
    months: n,
  }
}

// ---------------- 个税（工资薪金，累计预扣法，2024 起征点 5000）----------------
const TAX_BRACKETS = [
  { cap: 36000, rate: 0.03, quick: 0 },
  { cap: 144000, rate: 0.1, quick: 2520 },
  { cap: 300000, rate: 0.2, quick: 16920 },
  { cap: 420000, rate: 0.25, quick: 31920 },
  { cap: 660000, rate: 0.3, quick: 52920 },
  { cap: 960000, rate: 0.35, quick: 85920 },
  { cap: Infinity, rate: 0.45, quick: 181920 },
]

export interface TaxResult {
  monthly: { month: number; tax: number; net: number }[]
  yearTax: number
  avgNet: number
}

/** 假设全年月薪、五险一金、专项附加扣除都不变，按累计预扣法逐月算 */
export function incomeTax(
  monthlySalary: number,
  monthlyInsurance: number,
  monthlySpecialDeduction: number,
): TaxResult | null {
  if (monthlySalary < 0) return null
  const rows: TaxResult['monthly'] = []
  let paidTax = 0
  let netSum = 0
  for (let month = 1; month <= 12; month++) {
    const cumTaxable =
      monthlySalary * month - 5000 * month - monthlyInsurance * month - monthlySpecialDeduction * month
    let cumTax = 0
    if (cumTaxable > 0) {
      const b = TAX_BRACKETS.find((x) => cumTaxable <= x.cap)!
      cumTax = cumTaxable * b.rate - b.quick
    }
    const monthTax = Math.max(0, cumTax - paidTax)
    paidTax += monthTax
    const net = monthlySalary - monthlyInsurance - monthTax
    netSum += net
    rows.push({ month, tax: monthTax, net })
  }
  return { monthly: rows, yearTax: paidTax, avgNet: netSum / 12 }
}

// ---------------- 价税分离 ----------------
export function vatSplit(
  amount: number,
  ratePct: number,
  mode: 'incl' | 'excl',
): { exclusive: number; tax: number; inclusive: number } | null {
  if (amount < 0 || ratePct < 0) return null
  const rate = ratePct / 100
  if (mode === 'incl') {
    const exclusive = amount / (1 + rate)
    return { exclusive, tax: amount - exclusive, inclusive: amount }
  }
  const tax = amount * rate
  return { exclusive: amount, tax, inclusive: amount + tax }
}

// ---------------- 日期 ----------------
export function daysBetween(a: string, b: string): number | null {
  const d1 = new Date(a)
  const d2 = new Date(b)
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  return Math.round((d2.getTime() - d1.getTime()) / 86400000)
}

export function dateAdd(base: string, days: number): string | null {
  const d = new Date(base)
  if (isNaN(d.getTime())) return null
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
