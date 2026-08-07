from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import crud
from app.database import Base, SessionLocal, engine, get_db
from app.schemas import (
    DeleteResponse,
    TemplateCreate,
    TemplateItem,
    TemplateListResponse,
    TemplateUpdate,
)
from app.seed import seed_if_empty

Base.metadata.create_all(bind=engine)
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


@app.get("/api/templates", response_model=TemplateListResponse)
def list_templates(category: Optional[str] = None, db: Session = Depends(get_db)):
    rows = crud.list_templates(db, category=category)
    return {"list": rows}


@app.get("/api/templates/{template_id}", response_model=TemplateItem)
def get_template(template_id: str, db: Session = Depends(get_db)):
    template = crud.get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@app.post("/api/templates", response_model=TemplateItem)
def create_template(payload: TemplateCreate, db: Session = Depends(get_db)):
    return crud.create_template(db, payload)


@app.put("/api/templates/{template_id}", response_model=TemplateItem)
def update_template(template_id: str, payload: TemplateUpdate, db: Session = Depends(get_db)):
    template = crud.update_template(db, template_id, payload)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


@app.delete("/api/templates/{template_id}", response_model=DeleteResponse)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    deleted = crud.delete_template(db, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="模板不存在")
    return {"deleted": deleted}


@app.get("/api/health")
def health():
    return {"status": "ok"}
