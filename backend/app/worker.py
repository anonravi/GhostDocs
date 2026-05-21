import os
import subprocess
import shutil
import uuid
import logging
from celery import Celery
from . import models, database, ast_parser, agent, github_client

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery = Celery(__name__)
celery.conf.broker_url = REDIS_URL
celery.conf.result_backend = REDIS_URL

# ─── Paths/extensions to skip during file scanning ───────────────
SKIP_DIRS = {
    "node_modules", "venv", ".venv", "env", "dist", "build",
    ".git", "__pycache__", ".next", "coverage", ".nyc_output",
    "vendor", ".cache", "tmp", "temp", "logs", "migrations",
}
SKIP_EXTENSIONS = {
    ".lock", ".log", ".map", ".min.js", ".min.css",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".zip", ".tar", ".gz",
    ".pyc", ".pyo", ".DS_Store",
}
SKIP_FILE_PATTERNS = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "Pipfile.lock", ".gitignore", ".env",
}
TARGET_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".md"}

# Files that rank highest for importance (entry points, configs)
HIGH_VALUE_NAMES = {
    "main.py", "app.py", "index.py", "server.py", "run.py",
    "index.js", "index.ts", "app.js", "app.ts", "server.js", "server.ts",
    "index.jsx", "index.tsx", "App.jsx", "App.tsx",
    "README.md", "package.json", "requirements.txt",
    "Dockerfile", "docker-compose.yml",
}

MAX_FILES = 40
MAX_CODE_PREVIEW = 600   # chars per file
MAX_TOTAL_CHARS = 80_000 # hard cap on total context sent to AI


def _should_skip_path(rel_path: str) -> bool:
    """Return True if a file/dir should be excluded from analysis."""
    parts = rel_path.replace("\\", "/").split("/")
    for part in parts:
        if part in SKIP_DIRS:
            return True
    filename = parts[-1]
    if filename in SKIP_FILE_PATTERNS:
        return True
    _, ext = os.path.splitext(filename)
    if ext in SKIP_EXTENSIONS:
        return True
    # Skip test files
    if filename.startswith("test_") or filename.endswith(("_test.py", ".test.js", ".test.ts", ".spec.js", ".spec.ts")):
        return True
    return False


def generate_docs_only(repo_name: str, commit_sha: str, gh_token: str = None):
    """Clone repo (shallow), parse AST, run AI agent, return docs dict."""
    token = gh_token or os.getenv("GITHUB_TOKEN")
    temp_dir = f"/tmp/ghostdocs-{uuid.uuid4()}"

    try:
        # ── 1. Shallow clone (depth=1 = only latest snapshot, no history) ──
        repo_url = f"https://x-access-token:{token}@github.com/{repo_name}.git"
        result = subprocess.run(
            ["git", "clone", "--depth=1", "--single-branch", repo_url, temp_dir],
            capture_output=True, timeout=120
        )
        if result.returncode != 0:
            raise RuntimeError(f"Git clone failed: {result.stderr.decode()[:300]}")

        # Checkout specific branch/sha if not default
        if commit_sha and commit_sha not in ("main", "master", "HEAD"):
            subprocess.run(
                ["git", "checkout", commit_sha],
                cwd=temp_dir, capture_output=True, timeout=30
            )

        # ── 2. Smart file collection ──────────────────────────────────────
        parser = ast_parser.ASTParser()
        high_value = []
        normal_value = []

        for root, dirs, files in os.walk(temp_dir):
            # Prune skip-dirs in place so os.walk doesn't descend into them
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, temp_dir)

                if _should_skip_path(rel_path):
                    continue

                _, ext = os.path.splitext(file)
                if ext not in TARGET_EXTENSIONS:
                    continue

                entry = {"file_path": rel_path, "file": file, "full_path": file_path}
                if file in HIGH_VALUE_NAMES:
                    high_value.append(entry)
                else:
                    normal_value.append(entry)

        # Rank: high-value first, then alphabetical
        selected = (high_value + normal_value)[:MAX_FILES]

        # ── 3. Build context ──────────────────────────────────────────────
        codebase_context = []
        total_chars = 0

        for entry in selected:
            if total_chars >= MAX_TOTAL_CHARS:
                break
            try:
                with open(entry["full_path"], "r", errors="ignore") as f:
                    code = f.read()
            except Exception:
                continue

            preview = code[:MAX_CODE_PREVIEW]
            total_chars += len(preview)
            symbols = parser.get_symbols(entry["file"], code)

            codebase_context.append({
                "file_path": entry["file_path"],
                "symbols": symbols,
                "code_preview": preview,
            })

        logger.info(f"[GhostDocs] Analysing {len(codebase_context)} files ({total_chars:,} chars) for {repo_name}")

        # ── 4. Generate documentation ─────────────────────────────────────
        doc_agent = agent.DocumentationAgent()
        docs = doc_agent.generate_documentation({"files": codebase_context})
        return docs

    except subprocess.TimeoutExpired:
        raise RuntimeError("Repository clone timed out — the repository may be too large.")
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


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
        logger.error(f"Celery task failed for job {job_id}: {e}", exc_info=True)
        job.status = "failed"
        job.error_message = "Documentation generation failed. Please try again."
        db.commit()
    finally:
        db.close()
