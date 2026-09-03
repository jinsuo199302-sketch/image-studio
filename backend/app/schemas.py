from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict


class TemplateBase(BaseModel):
    name: str
    category: str
    scene: str = "全部场景"
    industry: str = "通用场景"
    canvas_width: int
    canvas_height: int
    background: str = "#ffffff"
    thumbnail: str
    elements: List[Dict[str, Any]]


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    scene: Optional[str] = None
    industry: Optional[str] = None
    canvas_width: Optional[int] = None
    canvas_height: Optional[int] = None
    background: Optional[str] = None
    thumbnail: Optional[str] = None
    elements: Optional[List[Dict[str, Any]]] = None


class TemplateItem(TemplateBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_official: int
    created_at: datetime


class TemplateListResponse(BaseModel):
    list: List[TemplateItem]


class DeleteResponse(BaseModel):
    deleted: bool


class SnippetCreate(BaseModel):
    content: str


class SnippetItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    content: str
    created_at: datetime


class UserRegister(BaseModel):
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    credits: int = 0
    is_member: bool = False
    membership_until: datetime | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    token: str
    user: UserOut


class ChatMessage(BaseModel):
    role: str
    # 一次性诊断用：content 支持 str（原有全部调用点）或 OpenAI vision 格式的
    # content-part 数组（[{"type":"text",...},{"type":"image_url",...}]），
    # 用来验证 OpenLux 代理是否真的转发多模态输入——不是长期要保留的设计，
    # 验证完看结果决定要不要正式做「参考图生成」功能再说
    content: Union[str, List[Dict[str, Any]]]


class ChatCompletionRequest(BaseModel):
    model: str = "gemini-3-flash-preview"
    messages: List[ChatMessage]
    # 透传给 OPENLUX/底层模型的可选工具声明（比如 Gemini 原生的 Search grounding：
    # [{"google_search": {}}]）——不设置就完全不影响现有行为，只有联网检索这类需要真实
    # 引用来源的场景才会用到。
    tools: Optional[List[dict]] = None


class ImageGenerationRequest(BaseModel):
    model: str = "gpt-image-2"
    prompt: str
    n: int = 1
    size: str = "1024x1024"


class VideoGenerateRequest(BaseModel):
    model: str = "viduq3-turbo"
    prompt: str
    duration: int = 5
    aspect_ratio: str = "9:16"
    bgm: bool = True


class FontOption(BaseModel):
    label: str
    value: str


class DesignGenerateRequest(BaseModel):
    prompt: str
    canvas_width: int
    canvas_height: int
    fonts: List[FontOption]


class ContentResearchRequest(BaseModel):
    topic: str


class DesignLayoutRequest(BaseModel):
    """跟 DesignGenerateRequest 是两码事——这个是用户已经写好正文的场景，AI 只负责排版/选组件，
    不负责编内容。prompt 类接口（"设计一版海报，主题是..."）走的还是 DesignGenerateRequest。"""
    canvas_width: int
    canvas_height: int
    fonts: List[FontOption]
    raw_text: Optional[str] = None
    blocks: Optional[List[str]] = None


class LayoutPresetSection(BaseModel):
    heading: str
    items: List[str]


class LayoutPresetRequest(BaseModel):
    """参数化排版预设——不调用 AI，纯确定性代码排版，见 app/layout_presets.py。
    跟 DesignLayoutRequest 的区别：那边靠 AI 判断怎么切分/排版；这边内容已经是
    调用方分好类的结构化数据（标题/引言/要点，或者标题/若干分区），系统只管算坐标。"""
    structure: Literal["bullet-list", "dense-board"]
    canvas_width: int
    canvas_height: int
    title: str
    intro: Optional[str] = None
    items: Optional[List[str]] = None  # structure == 'bullet-list' 时用
    sections: Optional[List[LayoutPresetSection]] = None  # structure == 'dense-board' 时用
    # 供"参考图生成"复用 dense-board 的分区栏格算法时用：跳过内置标题、自定标题下方留白起点
    include_title: bool = True
    top_offset: Optional[int] = None
