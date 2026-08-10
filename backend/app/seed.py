from sqlalchemy.orm import Session

from app import models


def thumb(seed: str, w: int = 300, h: int = 400) -> str:
    return f"https://picsum.photos/seed/{seed}/{w}/{h}"


SEED_TEMPLATES = [
    {
        "id": "tpl-poster-sale",
        "name": "促销海报",
        "category": "广告设计",
        "scene": "促销活动",
        "industry": "电商零售",
        "canvas_width": 600,
        "canvas_height": 800,
        "background": "#fef3c7",
        "thumbnail": thumb("sale-poster"),
        "elements": [
            {"type": "image", "x": 0, "y": 0, "width": 600, "height": 400, "src": thumb("sale-poster-bg", 600, 400)},
            {"type": "text", "x": 40, "y": 430, "width": 520, "text": "全场大促", "fontSize": 56, "fontWeight": "bold", "color": "#dc2626", "align": "center"},
            {"type": "text", "x": 40, "y": 510, "width": 520, "text": "低至 3 折起", "fontSize": 28, "color": "#78350f", "align": "center"},
            {"type": "rect", "x": 200, "y": 600, "width": 200, "height": 56, "fill": "#dc2626", "rx": 28},
            {"type": "text", "x": 200, "y": 616, "width": 200, "text": "立即抢购", "fontSize": 22, "color": "#ffffff", "align": "center"},
        ],
    },
    {
        "id": "tpl-flyer-open",
        "name": "开业宣传单",
        "category": "宣传海报",
        "scene": "开业宣传",
        "industry": "餐饮美食",
        "canvas_width": 600,
        "canvas_height": 800,
        "background": "#dbeafe",
        "thumbnail": thumb("open-flyer"),
        "elements": [
            {"type": "text", "x": 40, "y": 60, "width": 520, "text": "盛大开业", "fontSize": 48, "fontWeight": "bold", "color": "#1d4ed8", "align": "center"},
            {"type": "image", "x": 60, "y": 160, "width": 480, "height": 360, "src": thumb("open-flyer-bg", 480, 360)},
            {"type": "text", "x": 40, "y": 560, "width": 520, "text": "开业期间全场 8 折", "fontSize": 26, "color": "#1e3a8a", "align": "center"},
            {"type": "text", "x": 40, "y": 700, "width": 520, "text": "地址：XX市XX路XX号", "fontSize": 18, "color": "#374151", "align": "center"},
        ],
    },
    {
        "id": "tpl-print-menu",
        "name": "菜单印刷",
        "category": "印刷制品",
        "scene": "门店物料",
        "industry": "餐饮美食",
        "canvas_width": 600,
        "canvas_height": 800,
        "background": "#fff7ed",
        "thumbnail": thumb("menu-print"),
        "elements": [
            {"type": "rect", "x": 0, "y": 0, "width": 600, "height": 120, "fill": "#ea580c"},
            {"type": "text", "x": 40, "y": 40, "width": 520, "text": "菜单", "fontSize": 40, "fontWeight": "bold", "color": "#ffffff", "align": "center"},
            {"type": "text", "x": 60, "y": 160, "width": 480, "text": "招牌菜品 A ........ 38", "fontSize": 20, "color": "#374151"},
            {"type": "text", "x": 60, "y": 210, "width": 480, "text": "招牌菜品 B ........ 28", "fontSize": 20, "color": "#374151"},
            {"type": "text", "x": 60, "y": 260, "width": 480, "text": "招牌菜品 C ........ 18", "fontSize": 20, "color": "#374151"},
            {"type": "image", "x": 60, "y": 340, "width": 480, "height": 300, "src": thumb("menu-print-bg", 480, 300)},
        ],
    },
    {
        "id": "tpl-ecom-banner",
        "name": "电商主图",
        "category": "电商营销",
        "scene": "促销活动",
        "industry": "电商零售",
        "canvas_width": 800,
        "canvas_height": 800,
        "background": "#f0fdf4",
        "thumbnail": thumb("ecom-banner", 300, 300),
        "elements": [
            {"type": "image", "x": 0, "y": 0, "width": 800, "height": 800, "src": thumb("ecom-banner-bg", 800, 800)},
            {"type": "rect", "x": 40, "y": 40, "width": 260, "height": 80, "fill": "#16a34a", "rx": 16},
            {"type": "text", "x": 40, "y": 62, "width": 260, "text": "新品上市", "fontSize": 28, "color": "#ffffff", "align": "center"},
            {"type": "text", "x": 40, "y": 680, "width": 720, "text": "限时特惠 ¥99", "fontSize": 44, "fontWeight": "bold", "color": "#166534", "align": "center"},
        ],
    },
    {
        "id": "tpl-social-post",
        "name": "公众号封面",
        "category": "自媒体配图",
        "scene": "内容封面",
        "industry": "通用场景",
        "canvas_width": 900,
        "canvas_height": 500,
        "background": "#ede9fe",
        "thumbnail": thumb("social-post", 300, 167),
        "elements": [
            {"type": "image", "x": 0, "y": 0, "width": 900, "height": 500, "src": thumb("social-post-bg", 900, 500)},
            {"type": "rect", "x": 0, "y": 380, "width": 900, "height": 120, "fill": "rgba(0,0,0,0.45)"},
            {"type": "text", "x": 40, "y": 410, "width": 820, "text": "在这里输入你的标题", "fontSize": 36, "fontWeight": "bold", "color": "#ffffff", "align": "center"},
        ],
    },
    {
        "id": "tpl-card-thankyou",
        "name": "感谢卡",
        "category": "宣传海报",
        "scene": "感恩贺卡",
        "industry": "通用场景",
        "canvas_width": 600,
        "canvas_height": 800,
        "background": "#fce7f3",
        "thumbnail": thumb("thankyou-card"),
        "elements": [
            {"type": "text", "x": 40, "y": 80, "width": 520, "text": "Thank You", "fontSize": 44, "fontWeight": "bold", "color": "#be185d", "align": "center"},
            {"type": "image", "x": 100, "y": 200, "width": 400, "height": 400, "src": thumb("thankyou-card-bg", 400, 400)},
            {"type": "text", "x": 40, "y": 640, "width": 520, "text": "感谢一路有你", "fontSize": 24, "color": "#831843", "align": "center"},
        ],
    },
    {
        "id": "tpl-handnews-traffic",
        "name": "交通安全手抄报",
        "category": "创意手作",
        "scene": "校园手抄报",
        "industry": "教育培训",
        "canvas_width": 700,
        "canvas_height": 900,
        "background": "#dbeafe",
        "thumbnail": thumb("handnews-traffic", 300, 386),
        "elements": [
            {"type": "image", "x": 0, "y": 0, "width": 700, "height": 380, "src": thumb("handnews-traffic-bg", 700, 380)},
            {"type": "text", "x": 40, "y": 400, "width": 620, "text": "交通安全", "fontSize": 64, "fontWeight": "bold", "color": "#dc2626", "align": "center"},
            {"type": "rect", "x": 40, "y": 500, "width": 290, "height": 350, "fill": "#ffffff", "rx": 20},
            {"type": "rect", "x": 370, "y": 500, "width": 290, "height": 350, "fill": "#ffffff", "rx": 20},
            {"type": "text", "x": 60, "y": 530, "width": 250, "text": "1.要走人行道，没\n有人行道时靠边\n走。\n2.结伴外出时，不\n打闹嬉戏。\n3.过马路时不看手\n机，注意观察车辆", "fontSize": 20, "color": "#1f2937"},
            {"type": "text", "x": 390, "y": 530, "width": 250, "text": "骑车出行要戴头\n盔，不可载人，\n出行前检查车\n辆，不逆行，应\n走非机动车道", "fontSize": 20, "color": "#1f2937"},
        ],
    },
    {
        "id": "tpl-handnews-reading",
        "name": "读书手抄报",
        "category": "创意手作",
        "scene": "校园手抄报",
        "industry": "教育培训",
        "canvas_width": 700,
        "canvas_height": 900,
        "background": "#fef9e7",
        "thumbnail": thumb("handnews-reading", 300, 386),
        "elements": [
            {"type": "image", "x": 60, "y": 40, "width": 580, "height": 320, "src": thumb("handnews-reading-bg", 580, 320)},
            {"type": "text", "x": 40, "y": 380, "width": 620, "text": "好书伴我成长", "fontSize": 56, "fontWeight": "bold", "color": "#b45309", "align": "center"},
            {"type": "rect", "x": 40, "y": 470, "width": 620, "height": 180, "fill": "#ffffff", "rx": 20},
            {"type": "text", "x": 70, "y": 500, "width": 560, "text": "推荐理由：这本书教会我遇到困难\n不放弃，主人公勇敢善良的品质\n很值得我们学习。", "fontSize": 22, "color": "#374151"},
            {"type": "rect", "x": 40, "y": 680, "width": 620, "height": 180, "fill": "#ffffff", "rx": 20},
            {"type": "text", "x": 70, "y": 710, "width": 560, "text": "读后感：读完这本书，我明白了坚\n持的意义，以后我也要做一个不\n轻言放弃的人。", "fontSize": 22, "color": "#374151"},
        ],
    },
    {
        "id": "tpl-office-resume",
        "name": "个人简历",
        "category": "职场文档",
        "scene": "简历文档",
        "industry": "企业办公",
        "canvas_width": 700,
        "canvas_height": 950,
        "background": "#ffffff",
        "thumbnail": thumb("office-resume", 300, 407),
        "elements": [
            {"type": "rect", "x": 0, "y": 0, "width": 700, "height": 150, "fill": "#1f2937"},
            {"type": "text", "x": 40, "y": 30, "width": 500, "text": "张三", "fontSize": 36, "fontWeight": "bold", "color": "#ffffff"},
            {"type": "text", "x": 40, "y": 86, "width": 500, "text": "求职意向：前端开发工程师", "fontSize": 18, "color": "#dbeafe"},
            {"type": "text", "x": 40, "y": 118, "width": 600, "text": "138-0000-0000  |  zhangsan@email.com  |  北京", "fontSize": 14, "color": "#9ca3af"},
            {"type": "rect", "x": 40, "y": 190, "width": 6, "height": 24, "fill": "#2563eb"},
            {"type": "text", "x": 60, "y": 188, "width": 300, "text": "教育经历", "fontSize": 20, "fontWeight": "bold", "color": "#1f2937"},
            {"type": "text", "x": 40, "y": 232, "width": 500, "text": "北京大学  ·  计算机科学与技术  ·  本科", "fontSize": 16, "color": "#374151"},
            {"type": "text", "x": 40, "y": 258, "width": 500, "text": "2018.09 - 2022.06", "fontSize": 14, "color": "#9ca3af"},
            {"type": "rect", "x": 40, "y": 310, "width": 6, "height": 24, "fill": "#2563eb"},
            {"type": "text", "x": 60, "y": 308, "width": 300, "text": "工作经历", "fontSize": 20, "fontWeight": "bold", "color": "#1f2937"},
            {"type": "text", "x": 40, "y": 352, "width": 500, "text": "某某科技有限公司  ·  前端开发工程师", "fontSize": 16, "color": "#374151"},
            {"type": "text", "x": 40, "y": 378, "width": 500, "text": "2022.07 - 至今", "fontSize": 14, "color": "#9ca3af"},
            {"type": "text", "x": 40, "y": 408, "width": 620, "text": "• 负责公司核心产品的前端架构设计与开发\n• 主导性能优化专项，首屏加载速度提升 40%\n• 带领 3 人小组完成组件库建设，提升团队协作效率", "fontSize": 16, "color": "#374151"},
            {"type": "rect", "x": 40, "y": 540, "width": 6, "height": 24, "fill": "#2563eb"},
            {"type": "text", "x": 60, "y": 538, "width": 300, "text": "技能特长", "fontSize": 20, "fontWeight": "bold", "color": "#1f2937"},
            {"type": "text", "x": 40, "y": 582, "width": 620, "text": "• 熟练掌握 Vue3 / React / TypeScript\n• 熟悉前端工程化、性能优化与自动化测试\n• 良好的沟通表达与团队协作能力", "fontSize": 16, "color": "#374151"},
            {"type": "rect", "x": 40, "y": 712, "width": 6, "height": 24, "fill": "#2563eb"},
            {"type": "text", "x": 60, "y": 710, "width": 300, "text": "自我评价", "fontSize": 20, "fontWeight": "bold", "color": "#1f2937"},
            {"type": "text", "x": 40, "y": 754, "width": 620, "text": "工作认真负责，学习能力强，能够快速适应新\n技术栈，具备良好的问题排查与解决能力。", "fontSize": 16, "color": "#374151"},
        ],
    },
    {
        "id": "tpl-office-leave",
        "name": "请假条",
        "category": "职场文档",
        "scene": "通知公文",
        "industry": "企业办公",
        "canvas_width": 700,
        "canvas_height": 700,
        "background": "#ffffff",
        "thumbnail": thumb("office-leave", 300, 300),
        "elements": [
            {"type": "text", "x": 40, "y": 50, "width": 620, "text": "请假条", "fontSize": 40, "fontWeight": "bold", "color": "#1f2937", "align": "center"},
            {"type": "rect", "x": 260, "y": 112, "width": 180, "height": 3, "fill": "#9ca3af"},
            {"type": "text", "x": 60, "y": 170, "width": 580, "text": "尊敬的领导：", "fontSize": 18, "color": "#374151"},
            {"type": "text", "x": 60, "y": 216, "width": 580, "text": "本人因＿＿＿＿＿＿＿＿＿＿＿＿＿＿事由，\n需请假＿＿天，自＿＿＿＿年＿＿月＿＿日起，\n至＿＿＿＿年＿＿月＿＿日止，请予批准。", "fontSize": 18, "color": "#374151"},
            {"type": "text", "x": 60, "y": 360, "width": 580, "text": "特此申请，谢谢！", "fontSize": 18, "color": "#374151"},
            {"type": "text", "x": 60, "y": 560, "width": 400, "text": "申请人：＿＿＿＿＿＿", "fontSize": 18, "color": "#1f2937"},
            {"type": "text", "x": 60, "y": 604, "width": 400, "text": "日 期：＿＿＿＿年＿＿月＿＿日", "fontSize": 18, "color": "#1f2937"},
            {"type": "text", "x": 380, "y": 560, "width": 280, "text": "部门负责人：＿＿＿＿＿＿", "fontSize": 18, "color": "#1f2937"},
        ],
    },
    {
        "id": "tpl-office-meeting",
        "name": "会议通知",
        "category": "职场文档",
        "scene": "通知公文",
        "industry": "企业办公",
        "canvas_width": 700,
        "canvas_height": 780,
        "background": "#ffffff",
        "thumbnail": thumb("office-meeting", 300, 334),
        "elements": [
            {"type": "rect", "x": 0, "y": 0, "width": 700, "height": 96, "fill": "#0f766e"},
            {"type": "text", "x": 40, "y": 30, "width": 620, "text": "会议通知", "fontSize": 32, "fontWeight": "bold", "color": "#ffffff", "align": "center"},
            {"type": "text", "x": 60, "y": 136, "width": 580, "text": "各部门负责人：\n兹定于近期召开月度工作总结会议，请相关\n人员准时参加，具体安排如下：", "fontSize": 18, "color": "#1f2937"},
            {"type": "rect", "x": 60, "y": 260, "width": 580, "height": 220, "fill": "#f0fdfa", "rx": 12},
            {"type": "text", "x": 90, "y": 288, "width": 520, "text": "时间：＿＿＿＿年＿＿月＿＿日 ＿＿:＿＿", "fontSize": 18, "color": "#0f766e", "fontWeight": "bold"},
            {"type": "text", "x": 90, "y": 328, "width": 520, "text": "地点：公司三楼会议室", "fontSize": 18, "color": "#0f766e", "fontWeight": "bold"},
            {"type": "text", "x": 90, "y": 368, "width": 520, "text": "参会人员：各部门负责人", "fontSize": 18, "color": "#0f766e", "fontWeight": "bold"},
            {"type": "text", "x": 90, "y": 408, "width": 520, "text": "会议主题：月度工作总结", "fontSize": 18, "color": "#0f766e", "fontWeight": "bold"},
            {"type": "text", "x": 60, "y": 520, "width": 580, "text": "请与会人员提前做好相关准备工作，如有特殊\n情况无法参加，请提前向行政部请假。", "fontSize": 16, "color": "#374151"},
            {"type": "text", "x": 300, "y": 660, "width": 340, "text": "XX 公司行政部", "fontSize": 16, "color": "#1f2937", "align": "right"},
            {"type": "text", "x": 300, "y": 690, "width": 340, "text": "＿＿＿＿年＿＿月＿＿日", "fontSize": 16, "color": "#1f2937", "align": "right"},
        ],
    },
    {
        "id": "tpl-office-invitation",
        "name": "邀请函",
        "category": "职场文档",
        "scene": "邀请函卡",
        "industry": "企业办公",
        "canvas_width": 700,
        "canvas_height": 900,
        "background": "#1e293b",
        "thumbnail": thumb("office-invitation", 300, 386),
        "elements": [
            {"type": "rect", "x": 30, "y": 30, "width": 640, "height": 4, "fill": "#d4af37"},
            {"type": "rect", "x": 30, "y": 866, "width": 640, "height": 4, "fill": "#d4af37"},
            {"type": "rect", "x": 30, "y": 30, "width": 4, "height": 840, "fill": "#d4af37"},
            {"type": "rect", "x": 666, "y": 30, "width": 4, "height": 840, "fill": "#d4af37"},
            {"type": "text", "x": 40, "y": 130, "width": 620, "text": "邀 请 函", "fontSize": 46, "fontWeight": "bold", "color": "#d4af37", "align": "center"},
            {"type": "text", "x": 40, "y": 196, "width": 620, "text": "I N V I T A T I O N", "fontSize": 14, "color": "#d4af37", "align": "center"},
            {"type": "text", "x": 70, "y": 320, "width": 560, "text": "尊敬的＿＿＿＿＿＿ 先生/女士：", "fontSize": 20, "color": "#e2e8f0"},
            {"type": "text", "x": 70, "y": 370, "width": 560, "text": "诚挚邀请您拨冗出席我们的年度盛典，\n期待您的莅临与支持，共襄盛举。", "fontSize": 18, "color": "#cbd5e1"},
            {"type": "rect", "x": 70, "y": 500, "width": 560, "height": 2, "fill": "#475569"},
            {"type": "text", "x": 70, "y": 540, "width": 560, "text": "时间：＿＿＿＿年＿＿月＿＿日 ＿＿:＿＿", "fontSize": 18, "color": "#e2e8f0"},
            {"type": "text", "x": 70, "y": 580, "width": 560, "text": "地点：＿＿＿＿＿＿＿＿＿＿＿＿＿＿", "fontSize": 18, "color": "#e2e8f0"},
            {"type": "text", "x": 70, "y": 620, "width": 560, "text": "主办方：＿＿＿＿＿＿＿＿＿＿＿＿", "fontSize": 18, "color": "#e2e8f0"},
            {"type": "text", "x": 70, "y": 780, "width": 560, "text": "敬请回复", "fontSize": 16, "color": "#94a3b8"},
        ],
    },
]


def seed_if_empty(db: Session):
    if db.query(models.Template).count() > 0:
        backfill_scene_industry(db)
        return
    for data in SEED_TEMPLATES:
        db.add(models.Template(is_official=1, **data))
    db.commit()


def backfill_scene_industry(db: Session):
    """老部署的官方模板行是在 scene/industry 列加进来之前建的，migrate_schema 只能填统一默认值，
    这里按 id 对上 SEED_TEMPLATES 把每条模板具体的 scene/industry 补齐"""
    by_id = {t["id"]: t for t in SEED_TEMPLATES}
    changed = False
    for row in db.query(models.Template).filter(models.Template.is_official == 1):
        seed = by_id.get(row.id)
        if not seed:
            continue
        if row.scene != seed["scene"] or row.industry != seed["industry"]:
            row.scene = seed["scene"]
            row.industry = seed["industry"]
            changed = True
    if changed:
        db.commit()
