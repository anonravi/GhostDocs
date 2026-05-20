import os
import subprocess
import shutil
import uuid
from celery import Celery
from . import models, database, ast_parser, agent, github_client

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery = Celery(__name__)
celery.conf.broker_url = REDIS_URL
celery.conf.result_backend = REDIS_URL

def generate_docs_only(repo_name: str, commit_sha: str, gh_token: str = None):
    """Clone repo, parse AST, run AI agent, and return generated docs dict."""
    token = gh_token or os.getenv("GITHUB_TOKEN")
    temp_dir = f"/tmp/ghostdocs-{uuid.uuid4()}"
    
    try:
        # 1. Clone Repo
        repo_url = f"https://x-access-token:{token}@github.com/{repo_name}.git"
        subprocess.run(["git", "clone", repo_url, temp_dir], check=True, capture_output=True)
        subprocess.run(["git", "checkout", commit_sha], cwd=temp_dir, check=True, capture_output=True)

        # 2. Scan Files & Parse AST
        parser = ast_parser.ASTParser()
        codebase_context = []
        for root, _, files in os.walk(temp_dir):
            if ".git" in root: continue
            for file in files:
                if file.endswith((".py", ".js", ".ts", ".html", ".jsx", ".tsx", ".css")):
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, temp_dir)
                    with open(file_path, "r", errors="ignore") as f:
                        code = f.read()
                    symbols = parser.get_symbols(file, code)
                    codebase_context.append({
                        "file_path": rel_path,
                        "symbols": symbols,
                        "code_preview": code[:1000]
                    })

        # 3. Generate Documentation
        doc_agent = agent.DocumentationAgent()
        docs = doc_agent.generate_documentation({"files": codebase_context})
        return docs

    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


def push_docs_to_github(repo_name: str, base_branch: str, docs: dict, commit_sha: str, job_id: str, gh_token: str = None):
    """Create branch, commit docs, and open PR. Returns the PR URL."""
    token = gh_token or os.getenv("GITHUB_TOKEN")
    gh = github_client.GitHubClient(token=token)
    return gh.create_documentation_pr(repo_name, base_branch, docs, commit_sha, job_id)


@celery.task(name="process_docs_task")
def process_docs_task(job_id: str, repo_name: str, commit_sha: str, gh_token: str = None):
    """Legacy Celery task — kept for backward compatibility."""
    db = database.SessionLocal()
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    
    token = gh_token or os.getenv("GITHUB_TOKEN")
    
    if not job:
        db.close()
        return

    try:
        job.status = "processing"
        db.commit()

        docs = generate_docs_only(repo_name, commit_sha, token)
        pr_url = push_docs_to_github(repo_name, "main", docs, commit_sha, job_id, token)

        job.status = "completed"
        job.pr_url = pr_url
        job.artifacts = docs
        db.commit()

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
    finally:
        db.close()
