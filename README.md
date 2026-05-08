# 👻 GhostDocs

**GhostDocs** is an autonomous AI documentation agent that generates professional READMEs, API documentation, and architectural diagrams for your GitHub repositories automatically.

## 🚀 Features

- **AST-Powered Parsing**: Understands Python, JS, TS, and HTML structures.
- **Gemini 1.5 Flash**: High-speed, high-context AI generation.
- **Automatic PRs**: Creates branches and submits documentation PRs directly.
- **Neobrutalist Dashboard**: Sleek, minimalist UI for managing jobs.
- **Role-Based Access**: Secure Admin panel for user management.
- **Multi-Auth**: Sign in with Google or GitHub.

## 🛠 Tech Stack

- **Backend**: FastAPI, SQLAlchemy, Celery, Redis.
- **Frontend**: Vite + React, Framer Motion, Lucide Icons.
- **AI**: Google Gemini.
- **Deployment**: Fly.io (Backend), Vercel (Frontend).

## 📦 Installation

### Backend
1. `cd backend`
2. `pip install -r requirements.txt`
3. Configure `.env` (GITHUB_TOKEN, GEMINI_API_KEY, etc.)
4. `uvicorn app.main:app --reload`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`

## 🛡 Security

- JWT-based authentication.
- Hidden admin portal (`/admin`).
- Role-based endpoint protection.

---
Built with 🦴 by **GhostDocs Team**.
