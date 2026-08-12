import uuid

from sqlalchemy.orm import Session

from app import models, schemas


def list_templates(db: Session, category: str | None = None, user_id: str | None = None, mine: bool = False):
    query = db.query(models.Template)
    if mine:
        # "我的设计"：只看自己保存的，不管 is_official（这里其实用不到，私人保存的都是 is_official=0）
        query = query.filter(models.Template.user_id == user_id)
    else:
        # 公共模板库：只看官方模板，其他用户保存的私人设计不会混进来
        query = query.filter(models.Template.is_official == 1)
    if category and category != "全部分类":
        query = query.filter(models.Template.category == category)
    return query.order_by(models.Template.created_at.desc()).all()


def get_template(db: Session, template_id: str):
    return db.query(models.Template).filter(models.Template.id == template_id).first()


def create_template(
    db: Session,
    payload: schemas.TemplateCreate,
    is_official: bool = False,
    template_id: str | None = None,
    user_id: str | None = None,
):
    template = models.Template(
        id=template_id or f"tpl-{uuid.uuid4().hex[:12]}",
        name=payload.name,
        category=payload.category,
        scene=payload.scene,
        industry=payload.industry,
        canvas_width=payload.canvas_width,
        canvas_height=payload.canvas_height,
        background=payload.background,
        thumbnail=payload.thumbnail,
        elements=payload.elements,
        is_official=1 if is_official else 0,
        user_id=user_id,
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


def create_snippet(db: Session, content: str):
    snippet = models.TextSnippet(id=uuid.uuid4().hex[:10], content=content)
    db.add(snippet)
    db.commit()
    db.refresh(snippet)
    return snippet


def get_snippet(db: Session, snippet_id: str):
    return db.query(models.TextSnippet).filter(models.TextSnippet.id == snippet_id).first()


def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()


def get_user(db: Session, user_id: str):
    return db.query(models.User).filter(models.User.id == user_id).first()


def create_user(db: Session, email: str, password_hash: str):
    user = models.User(id=uuid.uuid4().hex[:16], email=email, password_hash=password_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
