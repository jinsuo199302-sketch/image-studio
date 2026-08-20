from datetime import datetime
from typing import Any, Dict, List, Optional

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
    created_at: datetime


class TokenResponse(BaseModel):
    token: str
    user: UserOut


class ChatMessage(BaseModel):
    role: str
    content: str


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
