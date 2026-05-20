from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List
import uuid
import os
import jwt
import threading
import concurrent.futures
from datetime import datetime, timedelta
from . import models, database, schemas, worker
from fastapi.responses import JSONResponse
import logging
import httpx

app = FastAPI(title="GhostDocs API")
security = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-bone")
JWT_ALGORITHM = "HS256"
GH_HEADERS = {"User-Agent": "GhostDocs/1.0", "Accept": "application/json"}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Security Helpers ───────────────────────────────────────────
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

ADMIN_EMAIL = "ravi492002@gmail.com"

async def get_current_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin only: Authorized email only")
    return current_user

# ─── Middleware ──────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global Error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=getattr(exc, "status_code", 500),
        content={"detail": str(exc) or "Internal Ghost Error"},
    )

# Initialize Database Tables
models.Base.metadata.create_all(bind=database.engine)

# ─── Health ──────────────────────────────────────────────────────
@app.get("/health")
async def health(db: Session = Depends(database.get_db)):
    db.query(models.User).count()
    return {"status": "healthy", "database": "connected"}

# ─── Repository Listing ─────────────────────────────────────────
@app.get("/repos", response_model=List[schemas.RepoResponse])
async def list_repos(user: models.User = Depends(get_current_user)):
    if not user.github_token:
        raise HTTPException(400, "GitHub not connected. Please connect GitHub first.")
    
    try:
        async with httpx.AsyncClient() as client:
            repos = []
            page = 1
            while True:
                res = await client.get(
                    f"https://api.github.com/user/repos?per_page=100&page={page}&sort=updated&affiliation=owner,collaborator,organization_member",
                    headers={**GH_HEADERS, "Authorization": f"Bearer {user.github_token}"}
                )
                if res.status_code != 200:
                    raise HTTPException(502, f"GitHub API error: {res.text}")
                data = res.json()
                if not data:
                    break
                for r in data:
                    repos.append({
                        "full_name": r["full_name"],
                        "private": r["private"],
                        "default_branch": r.get("default_branch", "main")
                    })
                page += 1
                if len(data) < 100:
                    break
            return repos
    except httpx.RequestError as e:
        raise HTTPException(502, f"Failed to reach GitHub: {str(e)}")

# ─── Background Generation Thread Helper ────────────────────────
def _run_generation_in_background(job_id: str, repo_name: str, branch: str, gh_token: str):
    """Runs git clone + AI generation in a background thread, then updates the DB."""
    db = database.SessionLocal()
    try:
        db_job = db.query(models.Job).filter(models.Job.id == job_id).first()
        if not db_job:
            return
        docs = worker.generate_docs_only(repo_name, branch, gh_token)
        db_job.status = "preview"
        db_job.artifacts = docs
        db.commit()
    except Exception as e:
        logger.error(f"Background generation failed for job {job_id}: {e}", exc_info=True)
        try:
            db_job = db.query(models.Job).filter(models.Job.id == job_id).first()
            if db_job:
                db_job.status = "failed"
                db_job.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()

# ─── Generate Preview (Async — returns immediately) ───────────────
@app.post("/generate/preview")
async def generate_preview(payload: schemas.PreviewRequest, user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    gh_token = user.github_token or os.getenv("GITHUB_TOKEN")
    if not gh_token:
        raise HTTPException(400, "No GitHub token available. Connect GitHub first.")

    job_id = str(uuid.uuid4())
    db_job = models.Job(
        id=job_id,
        user_id=user.id,
        repo_name=payload.repo_name,
        commit_sha=payload.branch,
        status="processing"
    )
    db.add(db_job)
    db.commit()

    # 🚀 Fire off generation in a background thread — return immediately so
    # the HTTP connection isn't held open past Render's 30-second timeout.
    t = threading.Thread(
        target=_run_generation_in_background,
        args=(job_id, payload.repo_name, payload.branch, gh_token),
        daemon=True
    )
    t.start()

    return {"job_id": job_id, "status": "processing"}

# ─── Push Approved Docs to GitHub ────────────────────────────────
@app.post("/generate/push")
async def push_to_github(payload: schemas.PushRequest, user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    job = db.query(models.Job).filter(models.Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "preview":
        raise HTTPException(400, f"Job is in '{job.status}' state, not 'preview'. Cannot push.")
    if not job.artifacts:
        raise HTTPException(400, "No generated docs found for this job.")

    gh_token = user.github_token or os.getenv("GITHUB_TOKEN")
    if not gh_token:
        raise HTTPException(400, "No GitHub token available.")

    try:
        pr_url = worker.push_docs_to_github(
            repo_name=job.repo_name,
            base_branch=job.commit_sha,
            docs=job.artifacts,
            commit_sha=job.commit_sha,
            job_id=job.id,
            gh_token=gh_token
        )
        job.status = "completed"
        job.pr_url = pr_url
        db.commit()
        return {"status": "completed", "pr_url": pr_url}
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        raise HTTPException(500, f"Push failed: {str(e)}")

# ─── Single Job Status (for polling) ───────────────────────────
@app.get("/jobs/{job_id}")
async def get_job(job_id: str, user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.user_id != user.id and not user.is_admin:
        raise HTTPException(403, "Access denied")
    return {
        "job_id": job.id,
        "status": job.status,
        "error_message": job.error_message,
        "readme": (job.artifacts or {}).get("readme", ""),
        "api_docs": (job.artifacts or {}).get("api_docs", ""),
        "mermaid_diagram": (job.artifacts or {}).get("mermaid_diagram", ""),
    }

# ─── Job History (Scoped to User) ───────────────────────────────
@app.get("/jobs", response_model=List[schemas.JobResponse])
async def list_jobs(user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    if user.is_admin:
        return db.query(models.Job).order_by(models.Job.created_at.desc()).all()
    return db.query(models.Job).filter(models.Job.user_id == user.id).order_by(models.Job.created_at.desc()).all()

# ─── Admin: User Management ─────────────────────────────────────
@app.get("/users", response_model=List[schemas.UserResponse])
async def list_users(admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    users = db.query(models.User).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "is_admin": u.is_admin,
            "is_active": u.is_active,
            "has_github": bool(u.github_token),
            "created_at": u.created_at,
        }
        for u in users
    ]

@app.post("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: int, admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user: raise HTTPException(status_code=404, detail="User not found")
    user.is_active = 0 if user.is_active == 1 else 1
    db.commit()
    return {"message": "User status updated"}

@app.post("/users/{user_id}/toggle-admin")
async def toggle_user_admin(user_id: int, admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    raise HTTPException(status_code=403, detail="User roles are hard-locked to prevent unauthorized access")

# ─── Admin: Analytics ────────────────────────────────────────────
@app.get("/admin/analytics")
async def get_admin_analytics(admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    total_users = db.query(models.User).count()
    github_connected = db.query(models.User).filter(models.User.github_token != None).count()
    total_jobs = db.query(models.Job).count()
    completed_jobs = db.query(models.Job).filter(models.Job.status == "completed").count()
    failed_jobs = db.query(models.Job).filter(models.Job.status == "failed").count()
    pending_jobs = db.query(models.Job).filter(models.Job.status == "pending").count()
    
    return {
        "total_users": total_users,
        "github_connected": github_connected,
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "pending_jobs": pending_jobs,
        "system_health": "Optimal"
    }

# ─── Auth: Google OAuth ─────────────────────────────────────────
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

@app.post("/auth/google")
async def google_auth(req: dict, db: Session = Depends(database.get_db)):
    if not req:
        return JSONResponse(status_code=400, content={"detail": "Ghost request"})
    
    token = req.get("token") or req.get("credential")
    if not token:
        raise HTTPException(400, "Token is missing from request")
    
    if req.get("is_access_token"):
        async with httpx.AsyncClient() as client:
            res = await client.get("https://www.googleapis.com/oauth2/v3/userinfo", headers={"Authorization": f"Bearer {token}"})
            if res.status_code != 200: raise HTTPException(401, "Invalid Google Access Token")
            payload = res.json()
    else:
        payload = id_token.verify_oauth2_token(token, google_requests.Request(), os.getenv("GOOGLE_CLIENT_ID"))
    
    email = payload["email"]
    name = payload.get("name", "")
    is_admin_val = 1 if email == ADMIN_EMAIL else 0
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(email=email, full_name=name, is_admin=is_admin_val)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if user.is_admin != is_admin_val:
            user.is_admin = is_admin_val
            db.commit()
            db.refresh(user)
    
    if not user.is_active: raise HTTPException(403, "Your account is banned")
    
    access_token = create_access_token(data={"sub": user.email})
    return {
        "id": user.id, 
        "email": user.email, 
        "name": user.full_name, 
        "is_admin": bool(user.is_admin),
        "access_token": access_token,
        "has_github": bool(user.github_token)
    }

# ─── Auth: GitHub OAuth (Login) ─────────────────────────────────
@app.post("/auth/github")
async def github_auth(data: dict, db: Session = Depends(database.get_db)):
    code = data.get("code")
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post("https://github.com/login/oauth/access_token", headers=GH_HEADERS, data={
                "client_id": os.getenv("GITHUB_CLIENT_ID"),
                "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
                "code": code
            })
            gh_token = res.json().get("access_token")
            if not gh_token: raise HTTPException(401, f"Invalid GitHub Code: {res.text}")

            res = await client.get("https://api.github.com/user", headers={**GH_HEADERS, "Authorization": f"Bearer {gh_token}"})
            gh_user = res.json()
            email = gh_user.get("email") or f"{gh_user.get('login', 'unknown')}@github.com"
            
            is_admin_val = 1 if email == ADMIN_EMAIL else 0
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                user = models.User(email=email, full_name=gh_user.get("name", gh_user.get("login")), is_admin=is_admin_val)
                db.add(user)
            else:
                if user.is_admin != is_admin_val:
                    user.is_admin = is_admin_val
            
            user.github_token = gh_token
            db.commit()
            db.refresh(user)
    except httpx.RequestError as e:
        raise HTTPException(500, f"Failed to connect to GitHub: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"GitHub Auth Error: {str(e)}")
        
    if not user.is_active: raise HTTPException(status_code=403, detail="Banned")
    
    access_token = create_access_token(data={"sub": user.email})
    return {
        "id": user.id, 
        "email": user.email, 
        "name": user.full_name, 
        "is_admin": bool(user.is_admin),
        "access_token": access_token,
        "has_github": bool(user.github_token)
    }

# ─── Auth: GitHub Connect (Link to existing account) ────────────
@app.post("/auth/github/connect")
async def connect_github(data: dict, user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    code = data.get("code")
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post("https://github.com/login/oauth/access_token", headers=GH_HEADERS, data={
                "client_id": os.getenv("GITHUB_CLIENT_ID"),
                "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
                "code": code
            })
            gh_token = res.json().get("access_token")
            if not gh_token: raise HTTPException(401, f"Invalid GitHub Code: {res.text}")
            
            user.github_token = gh_token
            db.commit()
    except httpx.RequestError as e:
        raise HTTPException(500, f"Failed to connect to GitHub: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"GitHub Connect Error: {str(e)}")
        
    return {"status": "connected", "has_github": True}
