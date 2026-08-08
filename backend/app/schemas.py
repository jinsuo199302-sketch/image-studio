from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class TemplateBase(BaseModel):
    name: str
    category: str
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
