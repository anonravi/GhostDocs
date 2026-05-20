from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class GenerateRequest(BaseModel):
    repo_name: str
    commit_sha: str

class PreviewRequest(BaseModel):
    repo_name: str
    branch: str = "main"

class PushRequest(BaseModel):
    job_id: str

class RepoResponse(BaseModel):
    full_name: str
    private: bool
    default_branch: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    is_admin: int
    is_active: int
    has_github: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

class JobResponse(BaseModel):
    id: str
    repo_name: str
    commit_sha: str
    status: str
    coverage_before: Optional[float]
    coverage_after: Optional[float]
    pr_url: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    updated_at: datetime
    artifacts: Optional[Dict[str, Any]]

    class Config:
        from_attributes = True

class PreviewResponse(BaseModel):
    job_id: str
    readme: str
    api_docs: str
    mermaid_diagram: str
