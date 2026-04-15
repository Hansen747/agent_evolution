"""
Security utilities: password hashing, JWT tokens, auth dependencies.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from agentevo.core.config import settings
from agentevo.core.database import get_db
from agentevo.models.models import Agent

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


@dataclass
class ActorContext:
    user_id: str
    agent: Optional[Agent] = None


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    """FastAPI dependency: extract user_id from JWT."""
    payload = decode_token(token)
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )
    return user_id


def get_optional_user_id(token: Optional[str] = Depends(optional_oauth2_scheme)) -> Optional[str]:
    """Return the current user id when a JWT is present, otherwise None."""
    if not token:
        return None

    payload = decode_token(token)
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )
    return user_id


def get_current_agent(
    x_agent_key: Optional[str] = Header(None, alias="X-Agent-Key"),
    db=Depends(get_db),
) -> Agent:
    """FastAPI dependency: resolve an agent from its API key."""
    if not x_agent_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Agent-Key header",
        )

    agent = db.query(Agent).filter(Agent.api_key == x_agent_key).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent credential",
        )
    return agent


def get_optional_agent(
    x_agent_key: Optional[str] = Header(None, alias="X-Agent-Key"),
    db=Depends(get_db),
) -> Optional[Agent]:
    """Return the current agent when X-Agent-Key is present, otherwise None."""
    if not x_agent_key:
        return None

    agent = db.query(Agent).filter(Agent.api_key == x_agent_key).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid agent credential",
        )
    return agent


def get_current_actor_context(
    user_id: Optional[str] = Depends(get_optional_user_id),
    agent: Optional[Agent] = Depends(get_optional_agent),
) -> ActorContext:
    """Resolve the acting user from either a user JWT or a bound agent credential."""
    if user_id and agent:
        if agent.owner_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Agent is not bound to a user",
            )
        if agent.owner_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User token and agent credential belong to different users",
            )
        return ActorContext(user_id=user_id, agent=agent)

    if user_id:
        return ActorContext(user_id=user_id, agent=agent)

    if agent:
        if agent.owner_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Agent is not bound to a user",
            )
        return ActorContext(user_id=agent.owner_id, agent=agent)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing user token or agent credential",
        headers={"WWW-Authenticate": "Bearer"},
    )
