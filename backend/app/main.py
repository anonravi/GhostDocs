import os
import json
import uuid
import logging
import traceback
import threading
from datetime import datetime, timedelta
from typing import List, Optional

import jwt
import httpx
from fastapi import FastAPI, HTTPException, Depends, Security, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from . import models, database, schemas, worker

# ─── Logging ─────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# ─── Constants ───────────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "ghostdocs-secret-2024")
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = "ravi492002@gmail.com"
GH_HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "GhostDocs/1.0"}

app = FastAPI(title="GhostDocs API", version="2.0.0")
security = HTTPBearer()

# ─── Middleware ───────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── DB Init ─────────────────────────────────────────────────────
models.Base.metadata.create_all(bind=database.engine)

# ─── Error Logging Helper ─────────────────────────────────────────
def log_error_to_db(
    exc: Exception,
    endpoint: str = None,
    user_id: int = None,
    job_id: str = None,
    sanitized_message: str = None,
):
    """Persist a full error traceback to the ErrorLog table (admin-only visible)."""
    try:
        db = database.SessionLocal()
        entry = models.ErrorLog(
            timestamp=datetime.utcnow(),
            user_id=user_id,
            job_id=job_id,
            endpoint=endpoint,
            error_type=type(exc).__name__,
            full_traceback=traceback.format_exc(),
            sanitized_message=sanitized_message or "An unexpected error occurred.",
        )
        db.add(entry)
        db.commit()
        db.close()
    except Exception as log_err:
        logger.error(f"Failed to write to ErrorLog: {log_err}")

# ─── Global Exception Handler ─────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Never expose raw error details to users
    logger.error(f"Unhandled exception at {request.url.path}: {exc}", exc_info=True)
    try:
        log_error_to_db(exc, endpoint=str(request.url.path), sanitized_message=str(exc)[:300])
    except Exception:
        pass
    status = getattr(exc, "status_code", 500)
    if status == 500:
        # Generic message for server errors — never leak internals
        return JSONResponse(status_code=500, content={"detail": "Something went wrong. Our team has been notified."})
    return JSONResponse(status_code=status, content={"detail": getattr(exc, "detail", str(exc))})

# ─── JWT Helpers ─────────────────────────────────────────────────
def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(days=7)})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

# ─── Auth Dependencies ────────────────────────────────────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(database.get_db),
):
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
    if current_user.email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# ─── Health ───────────────────────────────────────────────────────
@app.get("/health")
async def health(db: Session = Depends(database.get_db)):
    db.query(models.User).count()
    return {"status": "healthy", "database": "connected"}

# ─── Repository Listing ───────────────────────────────────────────
@app.get("/repos", response_model=List[schemas.RepoResponse])
async def list_repos(user: models.User = Depends(get_current_user)):
    if not user.github_token:
        raise HTTPException(400, "GitHub not connected. Please connect GitHub first.")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            repos = []
            page = 1
            while True:
                res = await client.get(
                    f"https://api.github.com/user/repos?per_page=100&page={page}&sort=updated&affiliation=owner,collaborator,organization_member",
                    headers={**GH_HEADERS, "Authorization": f"Bearer {user.github_token}"}
                )
                if res.status_code != 200:
                    raise HTTPException(502, "Failed to fetch repositories from GitHub.")
                data = res.json()
                if not data:
                    break
                for r in data:
                    repos.append({
                        "full_name": r["full_name"],
                        "private": r["private"],
                        "default_branch": r.get("default_branch", "main"),
                    })
                page += 1
                if len(data) < 100:
                    break
            return repos
    except httpx.RequestError:
        raise HTTPException(502, "Could not reach GitHub. Please try again.")

# ─── Background Generation Thread ─────────────────────────────────
def _run_generation_in_background(job_id: str, repo_name: str, branch: str, gh_token: str, user_id: int):
    """Fire-and-forget: clones repo + calls AI + saves result to DB."""
    db = database.SessionLocal()
    try:
        db_job = db.query(models.Job).filter(models.Job.id == job_id).first()
        if not db_job:
            return

        docs = worker.generate_docs_only(repo_name, branch, gh_token)

        db_job.status = "preview"
        db_job.artifacts = docs
        db.commit()
        logger.info(f"[Gen] Job {job_id} completed for {repo_name}")

    except Exception as e:
        logger.error(f"[Gen] Job {job_id} failed: {e}", exc_info=True)
        # Store sanitized message for user, full traceback for admin
        log_error_to_db(e, endpoint="/generate/preview", user_id=user_id, job_id=job_id,
                        sanitized_message=f"Generation failed for {repo_name}. Please try again.")
        try:
            db_job = db.query(models.Job).filter(models.Job.id == job_id).first()
            if db_job:
                db_job.status = "failed"
                db_job.error_message = "Documentation generation failed. Please try again or select a different repository."
                db.commit()
        except Exception as inner:
            logger.error(f"[Gen] Could not update job status: {inner}")
    finally:
        db.close()

# ─── Generate Preview (non-blocking) ──────────────────────────────
@app.post("/generate/preview")
async def generate_preview(
    payload: schemas.PreviewRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    gh_token = user.github_token or os.getenv("GITHUB_TOKEN")
    if not gh_token:
        raise HTTPException(400, "No GitHub token available. Connect GitHub first.")

    job_id = str(uuid.uuid4())
    db_job = models.Job(
        id=job_id,
        user_id=user.id,
        repo_name=payload.repo_name,
        commit_sha=payload.branch,
        status="processing",
    )
    db.add(db_job)
    db.commit()

    threading.Thread(
        target=_run_generation_in_background,
        args=(job_id, payload.repo_name, payload.branch, gh_token, user.id),
        daemon=True,
    ).start()

    return {"job_id": job_id, "status": "processing"}

# ─── Single Job Status (for polling) ──────────────────────────────
@app.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.user_id != user.id and not user.is_admin:
        raise HTTPException(403, "Access denied")
    return {
        "job_id": job.id,
        "status": job.status,
        "error_message": job.error_message if job.error_message else None,
        "readme": (job.artifacts or {}).get("readme", ""),
        "api_docs": (job.artifacts or {}).get("api_docs", ""),
        "mermaid_diagram": (job.artifacts or {}).get("mermaid_diagram", ""),
    }

# ─── Push Approved Docs to GitHub ─────────────────────────────────
@app.post("/generate/push")
async def push_to_github(
    payload: schemas.PushRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    job = db.query(models.Job).filter(models.Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.status != "preview":
        raise HTTPException(400, "Job is not ready to push.")
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
            gh_token=gh_token,
        )
        job.status = "completed"
        job.pr_url = pr_url
        db.commit()
        return {"status": "completed", "pr_url": pr_url}
    except Exception as e:
        logger.error(f"[Push] Job {payload.job_id} push failed: {e}", exc_info=True)
        log_error_to_db(e, endpoint="/generate/push", user_id=user.id, job_id=payload.job_id,
                        sanitized_message=f"Push failed for {job.repo_name}.")
        job.status = "failed"
        job.error_message = "Failed to push to GitHub. Please check repository permissions and try again."
        db.commit()
        raise HTTPException(500, "Push failed. Please check your repository permissions.")

# ─── Job History ──────────────────────────────────────────────────
@app.get("/jobs", response_model=List[schemas.JobResponse])
async def list_jobs(user: models.User = Depends(get_current_user), db: Session = Depends(database.get_db)):
    if user.is_admin:
        return db.query(models.Job).order_by(models.Job.created_at.desc()).all()
    return db.query(models.Job).filter(models.Job.user_id == user.id).order_by(models.Job.created_at.desc()).all()

# ─── Admin: User Management ───────────────────────────────────────
@app.get("/users", response_model=List[schemas.UserResponse])
async def list_users(admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    users = db.query(models.User).all()
    return [
        {
            "id": u.id, "email": u.email, "full_name": u.full_name,
            "is_admin": u.is_admin, "is_active": u.is_active,
            "has_github": bool(u.github_token), "created_at": u.created_at,
        }
        for u in users
    ]

@app.post("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: int, admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_active = 0 if user.is_active == 1 else 1
    db.commit()
    return {"message": "User status updated", "is_active": user.is_active}

@app.post("/users/{user_id}/toggle-admin")
async def toggle_user_admin(user_id: int, admin: models.User = Depends(get_current_admin)):
    raise HTTPException(403, "Admin roles are hard-locked for security.")

# ─── Admin: Analytics ─────────────────────────────────────────────
@app.get("/admin/analytics")
async def get_admin_analytics(admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    total_users = db.query(models.User).count()
    active_users = db.query(models.User).filter(models.User.is_active == 1).count()
    github_connected = db.query(models.User).filter(models.User.github_token != None).count()
    total_jobs = db.query(models.Job).count()
    completed_jobs = db.query(models.Job).filter(models.Job.status == "completed").count()
    failed_jobs = db.query(models.Job).filter(models.Job.status == "failed").count()
    processing_jobs = db.query(models.Job).filter(models.Job.status.in_(["processing", "preview"])).count()
    total_errors = db.query(models.ErrorLog).count()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "github_connected": github_connected,
        "total_jobs": total_jobs,
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "processing_jobs": processing_jobs,
        "total_errors": total_errors,
        "success_rate": round((completed_jobs / total_jobs * 100), 1) if total_jobs > 0 else 0,
        "system_health": "Optimal",
        "ai_provider": os.getenv("LLM_PROVIDER", "gemini").upper(),
    }

# ─── Admin: Error Logs ─────────────────────────────────────────────
@app.get("/admin/error-logs", response_model=List[schemas.ErrorLogResponse])
async def get_error_logs(
    admin: models.User = Depends(get_current_admin),
    db: Session = Depends(database.get_db),
    limit: int = 100,
):
    return (
        db.query(models.ErrorLog)
        .order_by(models.ErrorLog.timestamp.desc())
        .limit(limit)
        .all()
    )

@app.delete("/admin/error-logs")
async def clear_error_logs(admin: models.User = Depends(get_current_admin), db: Session = Depends(database.get_db)):
    count = db.query(models.ErrorLog).count()
    db.query(models.ErrorLog).delete()
    db.commit()
    return {"message": f"Cleared {count} error log entries."}

# ─── Auth: Google OAuth ───────────────────────────────────────────
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

@app.post("/auth/google")
async def google_auth(req: dict, db: Session = Depends(database.get_db)):
    if not req:
        raise HTTPException(400, "Invalid request")

    token = req.get("token") or req.get("credential")
    if not token:
        raise HTTPException(400, "Token is missing")

    try:
        if req.get("is_access_token"):
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {token}"}
                )
                if res.status_code != 200:
                    raise HTTPException(401, "Google authentication failed. Please try again.")
                payload = res.json()
        else:
            payload = id_token.verify_oauth2_token(token, google_requests.Request(), os.getenv("GOOGLE_CLIENT_ID"))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Auth/Google] Token verification failed: {e}", exc_info=True)
        raise HTTPException(401, "Google authentication failed. Please try again.")

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

    if not user.is_active:
        raise HTTPException(403, "Your account has been suspended. Contact support.")

    access_token = create_access_token(data={"sub": user.email})
    return {
        "id": user.id, "email": user.email, "name": user.full_name,
        "is_admin": bool(user.is_admin), "access_token": access_token,
        "has_github": bool(user.github_token),
    }

# ─── Auth: GitHub OAuth Login ─────────────────────────────────────
@app.post("/auth/github")
async def github_auth(data: dict, db: Session = Depends(database.get_db)):
    code = data.get("code")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://github.com/login/oauth/access_token",
                headers=GH_HEADERS,
                data={
                    "client_id": os.getenv("GITHUB_CLIENT_ID"),
                    "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
                    "code": code,
                },
            )
            gh_token = res.json().get("access_token")
            if not gh_token:
                raise HTTPException(401, "GitHub authentication failed. Please try again.")

            res = await client.get(
                "https://api.github.com/user",
                headers={**GH_HEADERS, "Authorization": f"Bearer {gh_token}"}
            )
            gh_user = res.json()
            email = gh_user.get("email") or f"{gh_user.get('login', 'unknown')}@github.com"

            is_admin_val = 1 if email == ADMIN_EMAIL else 0
            user = db.query(models.User).filter(models.User.email == email).first()
            if not user:
                user = models.User(
                    email=email,
                    full_name=gh_user.get("name", gh_user.get("login")),
                    is_admin=is_admin_val,
                )
                db.add(user)
            else:
                if user.is_admin != is_admin_val:
                    user.is_admin = is_admin_val

            user.github_token = gh_token
            db.commit()
            db.refresh(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Auth/GitHub] Login failed: {e}", exc_info=True)
        raise HTTPException(500, "GitHub authentication failed. Please try again.")

    if not user.is_active:
        raise HTTPException(403, "Your account has been suspended. Contact support.")

    access_token = create_access_token(data={"sub": user.email})
    return {
        "id": user.id, "email": user.email, "name": user.full_name,
        "is_admin": bool(user.is_admin), "access_token": access_token,
        "has_github": bool(user.github_token),
    }

# ─── Auth: GitHub Connect (link to existing account) ──────────────
@app.post("/auth/github/connect")
async def connect_github(
    data: dict,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    code = data.get("code")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                "https://github.com/login/oauth/access_token",
                headers=GH_HEADERS,
                data={
                    "client_id": os.getenv("GITHUB_CLIENT_ID"),
                    "client_secret": os.getenv("GITHUB_CLIENT_SECRET"),
                    "code": code,
                },
            )
            gh_token = res.json().get("access_token")
            if not gh_token:
                raise HTTPException(401, "GitHub connection failed. Please try again.")

            user.github_token = gh_token
            db.commit()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Auth/GitHub/Connect] Failed for user {user.id}: {e}", exc_info=True)
        raise HTTPException(500, "Failed to connect GitHub. Please try again.")

    return {"status": "connected", "has_github": True}
