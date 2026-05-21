import os
import subprocess
import shutil
import uuid
import logging
import traceback
from celery import Celery
from . import models, database, agent, github_client

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
    ".lock", ".log", ".map",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".zip", ".tar", ".gz",
    ".pyc", ".pyo",
}
SKIP_FILE_PATTERNS = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "poetry.lock", "Pipfile.lock",
}
TARGET_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".md", ".json", ".yaml", ".yml"}

HIGH_VALUE_NAMES = {
    "main.py", "app.py", "index.py", "server.py", "run.py",
    "index.js", "index.ts", "app.js", "app.ts", "server.js", "server.ts",
    "index.jsx", "index.tsx", "App.jsx", "App.tsx",
    "README.md", "package.json", "requirements.txt",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
}

MAX_FILES = 35
MAX_CODE_PREVIEW = 800   # chars per file
MAX_TOTAL_CHARS = 70_000 # hard cap on total context


def _should_skip_path(rel_path: str) -> bool:
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
    if filename.startswith("test_") or filename.endswith(("_test.py", ".test.js", ".test.ts", ".spec.js", ".spec.ts")):
        return True
    return False


def _get_symbols_safe(filename: str, code: str):
    """Extract symbols safely — never crashes, returns [] on any error."""
    try:
        import ast as _ast
        if filename.endswith(".py"):
            tree = _ast.parse(code)
            symbols = []
            for node in _ast.walk(tree):
                if isinstance(node, _ast.FunctionDef):
                    symbols.append({"type": "function", "name": node.name, "line": node.lineno})
                elif isinstance(node, _ast.ClassDef):
                    symbols.append({"type": "class", "name": node.name, "line": node.lineno})
            return symbols[:20]  # cap at 20 symbols per file
    except Exception:
        pass
    return []


def generate_docs_only(repo_name: str, commit_sha: str, gh_token: str = None):
    """Clone repo (shallow), scan files, run AI, return docs dict."""
    token = gh_token or os.getenv("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("No GitHub token available. Please connect your GitHub account.")

    temp_dir = f"/tmp/ghostdocs-{uuid.uuid4()}"
    logger.info(f"[Worker] Starting generation for {repo_name} (branch: {commit_sha})")

    try:
        # ── 1. Shallow clone ─────────────────────────────────────
        repo_url = f"https://x-access-token:{token}@github.com/{repo_name}.git"

        # Build clone command — optionally specify branch
        clone_cmd = ["git", "clone", "--depth=1", "--single-branch"]
        if commit_sha and commit_sha not in ("HEAD",):
            clone_cmd += ["--branch", commit_sha]
        clone_cmd += [repo_url, temp_dir]

        logger.info(f"[Worker] Cloning {repo_name}...")
        result = subprocess.run(clone_cmd, capture_output=True, timeout=120)

        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="ignore")
            logger.error(f"[Worker] Clone failed: {stderr[:400]}")
            # If specific branch clone failed, try without branch (default branch)
            if commit_sha and commit_sha not in ("HEAD", "main", "master"):
                logger.info(f"[Worker] Retrying clone without branch specification...")
                fallback_cmd = ["git", "clone", "--depth=1", "--single-branch", repo_url, temp_dir]
                result2 = subprocess.run(fallback_cmd, capture_output=True, timeout=120)
                if result2.returncode != 0:
                    raise RuntimeError(f"Git clone failed: {result2.stderr.decode()[:200]}")
            else:
                raise RuntimeError(f"Git clone failed: {stderr[:200]}")

        logger.info(f"[Worker] Clone successful")

        # ── 2. Collect files ──────────────────────────────────────
        high_value = []
        normal_value = []

        for root, dirs, files in os.walk(temp_dir):
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

        selected = (high_value + normal_value)[:MAX_FILES]
        logger.info(f"[Worker] Found {len(selected)} files to analyse")

        if not selected:
            raise RuntimeError(f"No source files found in {repo_name}. Make sure the repository has code files.")

        # ── 3. Build context ──────────────────────────────────────
        codebase_context = []
        total_chars = 0

        for entry in selected:
            if total_chars >= MAX_TOTAL_CHARS:
                break
            try:
                with open(entry["full_path"], "r", errors="ignore") as f:
                    code = f.read()
            except Exception as read_err:
                logger.warning(f"[Worker] Could not read {entry['file_path']}: {read_err}")
                continue

            preview = code[:MAX_CODE_PREVIEW]
            total_chars += len(preview)
            # Safe symbol extraction — never crashes
            symbols = _get_symbols_safe(entry["file"], code)

            codebase_context.append({
                "file_path": entry["file_path"],
                "symbols": symbols,
                "code_preview": preview,
            })

        logger.info(f"[Worker] Context built: {len(codebase_context)} files, {total_chars:,} chars")

        # ── 4. AI generation ─────────────────────────────────────
        doc_agent = agent.DocumentationAgent()
        docs = doc_agent.generate_documentation({"files": codebase_context})

        if not docs or not isinstance(docs, dict):
            raise RuntimeError("AI returned empty or invalid response")

        # Ensure required keys exist
        docs.setdefault("readme", f"# {repo_name}\n\nDocumentation generated by GhostDocs.")
        docs.setdefault("api_docs", "No API documentation generated.")
        docs.setdefault("mermaid_diagram", "graph TD\n    A[App] --> B[Core]")

        logger.info(f"[Worker] Generation complete for {repo_name}")
        return docs

    except subprocess.TimeoutExpired:
        raise RuntimeError("Repository clone timed out. The repository may be too large or network is slow.")
    except RuntimeError:
        raise  # Re-raise our own errors with clear messages
    except Exception as e:
        logger.error(f"[Worker] Unexpected error for {repo_name}: {e}", exc_info=True)
        raise RuntimeError(f"Generation failed unexpectedly: {type(e).__name__}: {str(e)[:200]}")
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def push_docs_to_github(repo_name: str, base_branch: str, docs: dict, commit_sha: str, job_id: str, gh_token: str = None):
    """Create branch, commit docs, open PR. Returns the PR URL."""
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
        logger.error(f"[Worker] Celery task failed for job {job_id}: {e}", exc_info=True)
        job.status = "failed"
        job.error_message = "Documentation generation failed. Please try again."
        db.commit()
    finally:
        db.close()
