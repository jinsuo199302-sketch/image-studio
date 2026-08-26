from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, JSON, String, Text

from app.database import Base


class Template(Base):
    __tablename__ = "templates"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    scene = Column(String, nullable=False, default="全部场景", index=True)
    industry = Column(String, nullable=False, default="通用场景", index=True)
    canvas_width = Column(Integer, nullable=False)
    canvas_height = Column(Integer, nullable=False)
    background = Column(String, nullable=False, default="#ffffff")
    thumbnail = Column(Text, nullable=False)
    elements = Column(JSON, nullable=False)
    is_official = Column(Integer, nullable=False, default=0)
    user_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TextSnippet(Base):
    __tablename__ = "text_snippets"

    id = Column(String, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class GeneratedAsset(Base):
    """AI 生成的图片素材（目前只有"参考图生成"的背景图会自动存），私有——只有生成者自己能看到/删除。
    只存 file_name（磁盘上的相对文件名），不存完整 URL，域名/端口变了也不用改数据。"""
    __tablename__ = "generated_assets"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    category = Column(String, nullable=False, default="reference-background", index=True)
    file_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
