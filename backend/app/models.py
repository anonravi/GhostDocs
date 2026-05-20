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
    artifacts = Column(JSON, nullable=True)  # Store generated README, API docs, etc.

    owner = relationship("User", back_populates="jobs")
