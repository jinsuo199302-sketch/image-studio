"""设计 token 的 Python 镜像，跟 src/theme/tokens.ts 手动保持数值一致（token 改动频率低，
不引入代码生成基础设施）。写新模板（seed.py / 生成脚本）时应该从这里取色，
不要再现造十六进制。"""

NEUTRAL = {
    "textPrimary": "#374151",
    "textSecondary": "#6b7280",
    "textMuted": "#9ca3af",
    "border": "#e5e7eb",
    "borderStrong": "#d1d5db",
    "white": "#ffffff",
    "black": "#000000",
}

STATUS = {
    "success": "#22c55e",
    "danger": "#ef4444",
    "warning": "#f59e0b",
    "info": "#3b82f6",
}

CHART_PALETTE = ["#8b5cf6", "#ec4899", "#38bdf8", "#22c55e", "#f59e0b", "#6366f1"]

CIVIC_THEME = {
    "red": "#c8161d",
    "redDark": "#a10f16",
    "blue": "#1c6fb0",
    "blueDark": "#0f5488",
    "gold": "#f6c92e",
}

SPACE = {"xs": 4, "sm": 8, "md": 12, "lg": 16, "xl": 24, "xxl": 32}

FONT_SIZE = {"xs": 11, "sm": 12, "base": 13, "md": 14, "lg": 16, "xl": 18, "xxl": 20, "display": 52}

RADIUS = {"sm": 3, "md": 6, "lg": 10}

COMPONENT_SIZE = {
    "iconList": {"badge": 22, "rowH": 34, "labelW": 180},
    "ribbon": {"height": 32, "tailW": 9, "defaultW": 220},
    "table": {"cellW": 90, "cellH": 36},
}
