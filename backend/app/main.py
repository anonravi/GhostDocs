from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
import jwt
from datetime import datetime, timedelta
from . import models, database, schemas, ast_parser, agent, github_client
from .worker import process_docs_task

app = FastAPI(title="GhostDocs API")
security = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-bone")
JWT_ALGORITHM = "HS256"

# Security Helpers
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security), db: Session = Depends(database.get_db)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="User inactive or missing")
    return user

async def get_current_admin(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only cave")
    return current_user

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Should be restricted in production!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    database.init_db()

@app.get("/health")
async def health():
    return {"status": "healthy", "alive": True}

@app.post("/generate", response_model=schemas.JobResponse)
async def generate_docs(payload: schemas.GenerateRequest, user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    job_id = str(uuid.uuid4())
    db_job = models.Job(
        id=job_id,
        repo_name=payload.repo_name,
        commit_sha=payload.commit_sha,
        status="pending"
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    process_docs_task.delay(job_id, payload.repo_name, payload.commit_sha)
    return db_job

@app.get("/jobs", response_model=List[schemas.JobResponse])
async def list_jobs(user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    return db.query(models.Job).all()

@app.get("/users", response_model=List[schemas.UserResponse])
async def list_users(admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    return db.query(models.User).all()

@app.post("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: int, admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    user.is_active = 0 if user.is_active == 1 else 1
    db.commit()
    return {"message": "User status updated"}

@app.post("/users/{user_id}/toggle-admin")
async def toggle_user_admin(user_id: int, admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = 0 if user.is_admin == 1 else 1
    db.commit()
    return {"message": "User role updated"}

# Auth Routes
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

@app.post("/auth/google")
async def google_auth(req: dict, db: Session = Depends(database.get_db)):
    try:
        if req.get("is_access_token"):
            # Verify via userinfo endpoint
            import httpx
            async with httpx.AsyncClient() as client:
                res = await client.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {req['token']}"})
                if res.status_code != 200: raise HTTPException(401, "Invalid access token")
                payload = res.json()
        else:
            # Verify via ID Token (Old way)
            payload = id_token.verify_oauth2_token(req["token"], google_requests.Request(), os.getenv("GOOGLE_CLIENT_ID"))
        
        email = payload["email"]
        name = payload.get("name", "")
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            is_first = db.query(models.User).count() == 0
            user = models.User(email=email, full_name=name, is_admin=1 if is_first else 0)
            db.add(user)
            db.commit()
            db.refresh(user)
        
        if not user.is_active: raise HTTPException(403, "Banned")
        
        access_token = create_access_token(data={"sub": user.email})
        return {
            "id": user.id, 
            "email": user.email, 
            "name": user.full_name, 
            "is_admin": bool(user.is_admin),
            "access_token": access_token
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/auth/github")
async def github_auth(data: dict, db: Session = Depends(database.get_db)):
    code = data.get("code")
    import httpx
    async with httpx.AsyncClient() as client:
        # Get access token
        res = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": os.getenv("GITHUB_CLIENT_ID"),
                "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
                "code": code
            },
            headers={"Accept": "application/json"}
        )
        token_data = res.json()
        token = token_data.get("access_token")
        if not token: 
            raise HTTPException(status_code=401, detail=f"GitHub auth failed: {token_data.get('error_description', 'No token')}")
        
        # Get user info
        user_res = await client.get("https://api.github.com/user", headers={"Authorization": f"token {token}"})
        user_info = user_res.json()
        
    email = user_info.get("email") or f"{user_info.get('login')}@github.user"
    name = user_info.get("name") or user_info.get('login')
    
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        is_first = db.query(models.User).count() == 0
        user = models.User(email=email, full_name=name, is_admin=1 if is_first else 0)
        db.add(user)
        db.commit()
        db.refresh(user)
        
    if not user.is_active: raise HTTPException(status_code=403, detail="Banned")
    
    access_token = create_access_token(data={"sub": user.email})
    return {
        "id": user.id, 
        "email": user.email, 
        "name": user.full_name, 
        "is_admin": bool(user.is_admin),
        "access_token": access_token
    }
