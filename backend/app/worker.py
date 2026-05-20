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

@celery.task(name="process_docs_task")
def process_docs_task(job_id: str, repo_name: str, commit_sha: str, gh_token: str = None):
    db = database.SessionLocal()
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    
    # Fallback to global token if user's token is missing
    token = gh_token or os.getenv("GITHUB_TOKEN")
    
    if not job:
        db.close()
        return

    try:
        job.status = "processing"
        db.commit()

        # 1. Clone Repo
        temp_dir = f"/tmp/ghostdocs-{job_id}"
        repo_url = f"https://x-access-token:{token}@github.com/{repo_name}.git"
        subprocess.run(["git", "clone", repo_url, temp_dir], check=True)
        subprocess.run(["git", "checkout", commit_sha], cwd=temp_dir, check=True)

        # 2. Scan Files & Parse AST
        parser = ast_parser.ASTParser()
        codebase_context = []
        for root, _, files in os.walk(temp_dir):
            if ".git" in root: continue
            for file in files:
                if file.endswith((".py", ".js", ".ts", ".html")):
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, temp_dir)
                    with open(file_path, "r") as f:
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

        # 4. Create Pull Request
        gh = github_client.GitHubClient(token=token)
        pr_url = gh.create_documentation_pr(repo_name, "main", docs, commit_sha, job_id)

        # 5. Success
        job.status = "completed"
        job.pr_url = pr_url
        job.artifacts = docs
        db.commit()

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        db.close()
