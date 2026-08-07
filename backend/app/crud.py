import uuid

from sqlalchemy.orm import Session

from app import models, schemas


def list_templates(db: Session, category: str | None = None):
    query = db.query(models.Template)
    if category and category != "全部分类":
        query = query.filter(models.Template.category == category)
    return query.order_by(models.Template.created_at.desc()).all()


def get_template(db: Session, template_id: str):
    return db.query(models.Template).filter(models.Template.id == template_id).first()


def create_template(db: Session, payload: schemas.TemplateCreate, is_official: bool = False, template_id: str | None = None):
    template = models.Template(
        id=template_id or f"tpl-{uuid.uuid4().hex[:12]}",
        name=payload.name,
        category=payload.category,
        canvas_width=payload.canvas_width,
        canvas_height=payload.canvas_height,
        background=payload.background,
        thumbnail=payload.thumbnail,
        elements=payload.elements,
        is_official=1 if is_official else 0,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update_template(db: Session, template_id: str, payload: schemas.TemplateUpdate):
    template = get_template(db, template_id)
    if not template:
        return None
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(template, key, value)
    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, template_id: str):
    template = get_template(db, template_id)
    if not template:
        return False
    db.delete(template)
    db.commit()
    return True
