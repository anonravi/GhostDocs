from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    hashed_password = Column(String, nullable=True)
    github_token = Column(String, nullable=True)
    is_admin = Column(Integer, default=0) # 0 for user, 1 for admin
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    jobs = relationship("Job", back_populates="owner")

class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    repo_name = Column(String)
    commit_sha = Column(String)
    status = Column(String, default="pending")  # pending, preview, processing, completed, failed
    coverage_before = Column(Float, nullable=True)
    coverage_after = Column(Float, nullable=True)
    pr_url = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    artifacts = Column(JSON, nullable=True)

    owner = relationship("User", back_populates="jobs")

class ErrorLog(Base):
    """Stores full error details visible only to admins. Users never see this."""
    __tablename__ = "error_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    user_id = Column(Integer, nullable=True)
    job_id = Column(String, nullable=True)
    endpoint = Column(String, nullable=True)
    error_type = Column(String, nullable=True)       # e.g. "RepoCloneError", "AIGenerationError"
    full_traceback = Column(Text, nullable=True)     # full Python traceback
    sanitized_message = Column(String, nullable=True) # safe string shown to admin only
