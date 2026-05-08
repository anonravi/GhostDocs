from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class GenerateRequest(BaseModel):
    repo_name: str
    commit_sha: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    is_admin: int
    is_active: int
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
