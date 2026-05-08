# 👻 GhostDocs: Autonomous AI Documentation Agent

GhostDocs is a production-ready AI platform that automatically generates high-quality READMEs, API documentation, and architecture diagrams for your GitHub repositories. Powered by **Gemini 1.5 Flash**, it integrates directly into your workflow via Pull Requests.

## 🚀 Key Features
- **Multi-Tenant OAuth**: Securely connect with Google or GitHub.
- **Autonomous Documentation**: Scans your codebase using AST parsing and generates context-aware docs.
- **Automated PRs**: Directly creates documentation Pull Requests in your repository.
- **Neobrutalist UI**: A high-performance, responsive interface built with React and Framer Motion.
- **Asynchronous Processing**: Background tasks managed by Celery and Redis for horizontal scaling.

## 🛠️ Technology Stack
- **Frontend**: React (Vite), Framer Motion, Axios.
- **Backend**: FastAPI (Python), SQLAlchemy, SQLite.
- **Worker**: Celery, Redis.
- **AI**: Google Gemini 1.5 Flash.
- **Deployment**: Render (Backend/Worker), Cloudflare Pages (Frontend).

## 📦 Local Setup

### Backend
1. `cd backend`
2. `pip install -r requirements.txt`
3. Create `.env` with:
   - `GEMINI_API_KEY`
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GOOGLE_CLIENT_ID`
   - `REDIS_URL`
4. `uvicorn app.main:app --reload`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`

## 🛡️ Security
- JWT-based session management.
- Multi-user data isolation (each user uses their own GitHub token).
- Secure password hashing with Bcrypt.

## 📜 License
© 2026 Ravi Yadav @ Shoolini University GF202218734. All rights reserved.
