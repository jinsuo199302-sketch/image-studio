from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import crud, models
from app.ai_proxy import router as ai_proxy_router
from app.auth import get_current_user, get_current_user_optional
from app.auth_routes import router as auth_router
from app.database import Base, SessionLocal, engine, get_db, migrate_schema
from app.pdf_tools import router as pdf_router
from app.schemas import (
    DeleteResponse,
    SnippetCreate,
    SnippetItem,
    TemplateCreate,
    TemplateItem,
    TemplateListResponse,
    TemplateUpdate,
)
from app.seed import seed_if_empty

Base.metadata.create_all(bind=engine)
migrate_schema()
with SessionLocal() as _db:
    seed_if_empty(_db)

app = FastAPI(title="万能画图 模板服务 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf_router)
app.include_router(auth_router)
app.include_router(ai_proxy_router)


@app.get("/api/templates", response_model=TemplateListResponse)
def list_templates(
    category: Optional[str] = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    if mine and not user:
        raise HTTPException(status_code=401, detail="请先登录再查看我的设计")
    rows = crud.list_templates(db, category=category, user_id=user.id if user else None, mine=mine)
    return {"list": rows}


@app.get("/api/templates/{template_id}", response_model=TemplateItem)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: Optional[models.User] = Depends(get_current_user_optional),
):
    template = crud.get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    if not template.is_official and template.user_id != (user.id if user else None):
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@app.post("/api/templates", response_model=TemplateItem)
def create_template(
    payload: TemplateCreate, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    return crud.create_template(db, payload, user_id=user.id)


@app.put("/api/templates/{template_id}", response_model=TemplateItem)
def update_template(
    template_id: str,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    existing = crud.get_template(db, template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="模板不存在")
    if existing.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能修改自己保存的设计")
    return crud.update_template(db, template_id, payload)


@app.delete("/api/templates/{template_id}", response_model=DeleteResponse)
def delete_template(
    template_id: str, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)
):
    existing = crud.get_template(db, template_id)
    if not existing:
        raise HTTPException(status_code=404, detail="模板不存在")
    if existing.user_id != user.id:
        raise HTTPException(status_code=403, detail="只能删除自己保存的设计")
    deleted = crud.delete_template(db, template_id)
    return {"deleted": deleted}


@app.post("/api/snippets", response_model=SnippetItem)
def create_snippet(payload: SnippetCreate, db: Session = Depends(get_db)):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="内容不能为空")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="内容太长，最多 2000 字")
    return crud.create_snippet(db, content)


@app.get("/api/snippets/{snippet_id}", response_model=SnippetItem)
def get_snippet(snippet_id: str, db: Session = Depends(get_db)):
    snippet = crud.get_snippet(db, snippet_id)
    if not snippet:
        raise HTTPException(status_code=404, detail="内容不存在或已被删除")
    return snippet


@app.get("/api/health")
def health():
    return {"status": "ok"}
