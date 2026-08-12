import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'data.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_schema():
    """create_all() 只建表不改表结构，这里给已存在的 templates 表补齐新列，避免线上旧 data.db 缺列报错"""
    with engine.connect() as conn:
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(templates)"))}
        if "scene" not in existing:
            conn.execute(text("ALTER TABLE templates ADD COLUMN scene TEXT NOT NULL DEFAULT '全部场景'"))
        if "industry" not in existing:
            conn.execute(text("ALTER TABLE templates ADD COLUMN industry TEXT NOT NULL DEFAULT '通用场景'"))
        if "user_id" not in existing:
            conn.execute(text("ALTER TABLE templates ADD COLUMN user_id TEXT"))
        conn.commit()
