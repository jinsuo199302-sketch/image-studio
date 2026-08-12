import time

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import crud, models
from app.config import JWT_ALGORITHM, JWT_EXPIRE_SECONDS, JWT_SECRET
from app.database import get_db


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": int(time.time()) + JWT_EXPIRE_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    token = auth_header[len("Bearer ") :]
    user_id = decode_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> models.User | None:
    """跟 get_current_user 一样解析 token，但未登录/token 失效时返回 None 而不是 401，供公开列表接口区分匿名/登录访客"""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    user_id = decode_token(auth_header[len("Bearer ") :])
    if not user_id:
        return None
    return crud.get_user(db, user_id)
