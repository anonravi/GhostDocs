import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RefreshCw, ExternalLink, Ghost, AlertCircle, CheckCircle2, Clock, LogOut, User as UserIcon, Shield, Users, Trash2, Key, Code } from 'lucide-react';
import { GoogleOAuthProvider, useGoogleLogin, googleLogout } from '@react-oauth/google';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://ghostdocs-backend.onrender.com';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '703431618953-ems9fk5tg7rdlskf7vkop8usnqujre35.apps.googleusercontent.com';
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || 'Ov23liQl9MQxnrasYDXF';

axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const loginWithGithub = () => {
  localStorage.setItem('github_intent', 'login');
  window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user,repo`;
};

const connectGithub = () => {
  localStorage.setItem('github_intent', 'connect');
  window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user,repo`;
};

const Navbar = ({ user, onLogout, activeTab, setActiveTab }) => (
  <header className="navbar-header" style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Ghost size={32} />
      <h1 style={{ fontSize: '1.8rem', fontWeight: 900 }}>GhostDocs</h1>
    </div>
    
    <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      {user && (
        <span style={{ fontWeight: 800, fontSize: '0.9rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <UserIcon size={16} /> {user.name || user.email.split('@')[0]}
        </span>
      )}
      <nav style={{ display: 'flex', gap: '10px' }}>
        <button className="neo-button" style={{ background: activeTab === 'dashboard' ? 'var(--primary)' : 'white' }} onClick={() => setActiveTab('dashboard')}>Dash</button>
        {user?.is_admin && <button className="neo-button" style={{ background: activeTab === 'admin' ? 'var(--accent)' : 'white' }} onClick={() => setActiveTab('admin')}>Admin</button>}
      </nav>
      <button className="neo-button" style={{ background: 'var(--secondary)' }} onClick={onLogout} title="Logout">
        <LogOut size={16} />
      </button>
    </div>
  </header>
);

const UserLoginContent = ({ onLoginSuccess }) => {
  const [view, setView] = useState('choice'); // 'choice', 'signin', 'signup'
  const [processing, setProcessing] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      if (processing) return;
      setProcessing(true);
      try {
        const { data } = await axios.post(`${API_URL}/auth/google`, { token: tokenResponse.access_token, is_access_token: true });
        onLoginSuccess(data);
      } catch (e) { 
        alert(`Google Auth failed: ${e.response?.data?.detail || e.message}`); 
        setProcessing(false);
      }
    }
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="neo-card login-card" 
        style={{ textAlign: 'center', width: '100%', maxWidth: '420px', padding: '40px 30px' }}
      >
        <div className="floating" style={{ display: 'inline-block', marginBottom: '20px' }}>
          <Ghost size={60} strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '30px' }}>GhostDocs</h1>
        
        <AnimatePresence mode="wait">
          {view === 'choice' ? (
            <motion.div key="choice" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button className="neo-button" style={{ background: 'var(--primary)', justifyContent: 'center', padding: '16px', fontSize: '1.1rem' }} onClick={() => setView('signin')}>
                Sign In
              </button>
              <button className="neo-button" style={{ background: 'var(--accent)', justifyContent: 'center', padding: '16px', fontSize: '1.1rem' }} onClick={() => setView('signup')}>
                Sign Up
              </button>
            </motion.div>
          ) : (
            <motion.div key="oauth" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <p style={{ marginBottom: '24px', fontWeight: 700, fontSize: '1.1rem', opacity: 0.7 }}>
                {view === 'signup' ? 'Create your account' : 'Welcome back'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <button className="neo-button" style={{ background: 'white', justifyContent: 'center', padding: '16px', fontSize: '1.1rem' }} onClick={() => login()} disabled={processing}>
                  <img src="https://www.google.com/favicon.ico" style={{ width: '20px' }} alt="Google" /> Continue with Google
                </button>
                <button className="neo-button" style={{ background: '#000', color: 'white', border: 'none', justifyContent: 'center', padding: '16px', fontSize: '1.1rem' }} onClick={loginWithGithub} disabled={processing}>
                  <Users size={20} /> Continue with GitHub
                </button>
              </div>
              <button 
                onClick={() => setView('choice')}
                style={{ marginTop: '24px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', opacity: 0.5 }}
              >
                ← Back to options
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

const UserLogin = ({ onLoginSuccess }) => (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <UserLoginContent onLoginSuccess={onLoginSuccess} />
  </GoogleOAuthProvider>
);


function Dashboard({ user, onLogout }) {
  const [jobs, setJobs] = useState([]);
  const [users, setUsers] = useState([]);
  const [repo, setRepo] = useState('');
  const [sha, setSha] = useState('main');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const fetchData = async () => {
    try {
      const jRes = await axios.get(`${API_URL}/jobs`);
      setJobs(jRes.data.reverse());
      if (user?.is_admin) {
        const uRes = await axios.get(`${API_URL}/users`);
        setUsers(uRes.data);
      }
    } catch (e) { if (e.response?.status === 401) onLogout(); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const triggerDocs = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/generate`, { repo_name: repo, commit_sha: sha });
      fetchData();
    } catch (e) { alert(e.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  };

  const toggleUserActive = async (id) => {
    await axios.post(`${API_URL}/users/${id}/toggle-active`);
    fetchData();
  };

  const toggleUserAdmin = async (id) => {
    await axios.post(`${API_URL}/users/${id}/toggle-admin`);
    fetchData();
  };

  return (
    <div className="container">
      <Navbar user={user} onLogout={onLogout} activeTab={activeTab} setActiveTab={setActiveTab} />
      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' ? (
          <motion.div key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <section className="neo-card">
              <h2 style={{ marginBottom: '20px' }}>Trigger Generation</h2>
              {!user?.has_github ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#ffebee', border: '2px solid #f44336', borderRadius: '12px', marginBottom: '24px' }}>
                  <AlertCircle size={40} color="#f44336" style={{ margin: '0 auto 16px auto', display: 'block' }} />
                  <h3 style={{ marginBottom: '10px', color: '#b71c1c' }}>GitHub Connection Required</h3>
                  <p style={{ marginBottom: '20px', color: '#c62828', maxWidth: '500px', margin: '0 auto 20px auto' }}>You need to link your GitHub account to allow GhostDocs to read your repositories and create pull requests.</p>
                  <button className="neo-button" style={{ background: '#000', color: 'white', border: 'none', margin: '0 auto', display: 'flex' }} onClick={connectGithub}>
                    <Users size={16} /> Connect GitHub Now
                  </button>
                </div>
              ) : (
                <>
                  <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', opacity: 0.8 }}>Repository</label>
                      <input className="neo-input" value={repo} onChange={e => setRepo(e.target.value)} placeholder="org/repo" />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', opacity: 0.8 }}>Branch/SHA</label>
                      <input className="neo-input" value={sha} onChange={e => setSha(e.target.value)} placeholder="main" />
                    </div>
                  </div>
                  <button className="neo-button" onClick={triggerDocs} disabled={loading} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent)' }}>
                    {loading ? <RefreshCw className="spinner" /> : <Send size={20} />} Generate & Pull Request
                  </button>
                </>
              )}
            </section>
            
            <section>
              <h2 style={{ marginBottom: '20px' }}>Recent Jobs</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {jobs.length === 0 && <p style={{ opacity: 0.5 }}>No jobs found yet...</p>}
                {jobs.map(job => (
                  <div key={job.id} className="neo-card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem' }}>{job.repo_name}</h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                        {job.status === 'completed' ? <CheckCircle2 size={16} color="green" /> : job.status === 'failed' ? <AlertCircle size={16} color="red" /> : <Clock size={16} />}
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>{job.status}</span>
                      </div>
                    </div>
                    {job.pr_url && (
                      <a href={job.pr_url} target="_blank" rel="noreferrer" className="neo-button" style={{ padding: '6px 12px' }}>
                        <ExternalLink size={16} /> View PR
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        ) : (
          <motion.div key="admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <section className="neo-card">
              <h2 style={{ marginBottom: '20px' }}>User Management</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '3px solid #000' }}>
                      <th style={{ textAlign: 'left', padding: '12px' }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '12px' }}>Role</th>
                      <th style={{ textAlign: 'left', padding: '12px' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '12px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '2px solid #eee' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{u.email}</td>
                        <td style={{ padding: '12px' }}>
                          <button onClick={() => toggleUserAdmin(u.id)} className="neo-button" style={{ padding: '4px 8px', fontSize: '0.7rem', background: u.is_admin ? 'var(--primary)' : 'white' }}>
                            {u.is_admin ? 'Admin' : 'User'}
                          </button>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ padding: '4px 8px', background: u.is_active ? 'var(--accent)' : 'var(--secondary)', fontWeight: 800, fontSize: '0.7rem' }}>
                            {u.is_active ? 'ACTIVE' : 'BANNED'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button className="neo-button" style={{ padding: '4px 8px', fontSize: '0.7rem', background: u.is_active ? 'var(--secondary)' : 'var(--accent)' }} onClick={() => toggleUserActive(u.id)}>
                            {u.is_active ? <Trash2 size={14} /> : 'RESTORE'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const Footer = () => (
  <footer style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.6, fontSize: '0.9rem', fontWeight: 700, marginTop: 'auto' }}>
    © {new Date().getFullYear()} Ravi Yadav @ Shoolini University GF202218734
  </footer>
);

const LandingPage = () => {
  const navigate = useNavigate();
  return (
    <div className="landing-container" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Background Elements */}
      <div className="bg-glow" style={{ position: 'absolute', top: '-10%', right: '-10%', width: '40vw', height: '40vw', background: 'var(--accent)', filter: 'blur(150px)', opacity: 0.1, zIndex: 0 }}></div>
      <div className="bg-glow" style={{ position: 'absolute', bottom: '-10%', left: '-10%', width: '40vw', height: '40vw', background: 'var(--primary)', filter: 'blur(150px)', opacity: 0.1, zIndex: 0 }}></div>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto', padding: '30px 20px', position: 'relative', zIndex: 10 }}>
        <motion.div 
          initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 950, fontSize: '1.8rem', letterSpacing: '-1px' }}
        >
          <div style={{ background: 'var(--primary)', padding: '5px', borderRadius: '8px' }}>
            <Ghost size={32} color="white" />
          </div>
          GhostDocs
        </motion.div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <button className="neo-button" onClick={() => navigate('/login')}>Get Started</button>
        </div>
      </nav>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '100px 20px', position: 'relative', zIndex: 10 }}>
        {/* Hero Section */}
        <section style={{ textAlign: 'center', marginBottom: '150px' }}>
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span style={{ background: 'var(--accent)', color: 'white', padding: '8px 20px', borderRadius: '50px', fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '24px', display: 'inline-block' }}>
              The Future of Open Source
            </span>
            <h1 style={{ fontSize: 'clamp(3.5rem, 10vw, 7.5rem)', fontWeight: 950, lineHeight: 0.9, marginBottom: '30px', letterSpacing: '-4px' }}>
              CODE ONCE.<br/>
              <span style={{ color: 'transparent', WebkitTextStroke: '2px black' }}>DOCUMENT</span> ALWAYS.
            </h1>
            <p style={{ fontSize: '1.4rem', opacity: 0.8, marginBottom: '40px', maxWidth: '800px', margin: '0 auto 40px auto', lineHeight: 1.5 }}>
              GhostDocs is the first autonomous agent that truly understands your architecture. It writes your docs, you write the future.
            </p>
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="neo-button" style={{ padding: '20px 40px', fontSize: '1.3rem', background: 'var(--primary)', color: 'white' }} onClick={() => navigate('/login')}>
                Deploy Your Ghost Agent
              </button>
              <button className="neo-button" style={{ padding: '20px 40px', fontSize: '1.3rem', background: 'white' }}>
                View Demo
              </button>
            </div>
          </motion.div>
        </section>

        {/* Floating Code Snippet Preview */}
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          className="neo-card"
          style={{ background: '#1a1a1a', color: '#fff', padding: '20px', borderRadius: '20px', maxWidth: '800px', margin: '0 auto 150px auto', transform: 'rotate(-2deg)', boxShadow: '20px 20px 0px var(--primary)' }}
        >
          <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }}></div>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }}></div>
          </div>
          <code style={{ fontFamily: 'monospace', fontSize: '1rem', lineHeight: 1.6 }}>
            <span style={{ color: '#ff79c6' }}>ghost</span> <span style={{ color: '#f1fa8c' }}>deploy</span> --repo <span style={{ color: '#50fa7b' }}>"ravi/ghostdocs"</span><br/>
            <span style={{ color: '#6272a4' }}>// Analysing AST...</span><br/>
            <span style={{ color: '#6272a4' }}>// Generating README.md...</span><br/>
            <span style={{ color: '#6272a4' }}>// Creating Pull Request...</span><br/>
            <span style={{ color: '#50fa7b' }}>✓ Documentation successfully deployed!</span>
          </code>
        </motion.div>

        {/* Features Grid */}
        <section style={{ marginBottom: '150px' }}>
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <h2 style={{ fontSize: '3rem', fontWeight: 950, letterSpacing: '-2px' }}>Ghost-Level Capabilities</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '40px' }}>
            {[
              { title: 'Semantic Context', desc: 'Doesn\'t just read text; understands your functions, classes, and logic flow.', icon: <Code size={32} /> },
              { title: 'PR Automation', desc: 'Automatically opens Pull Requests with updated documentation on every push.', icon: <Send size={32} /> },
              { title: 'Diagram Generation', desc: 'Visualizes your architecture with Mermaid.js diagrams generated by AI.', icon: <RefreshCw size={32} /> },
              { title: 'Multi-Repo Support', desc: 'Manage documentation for your entire organization from one dashboard.', icon: <Shield size={32} /> }
            ].map((feat, i) => (
              <motion.div 
                key={i} 
                initial={{ y: 30, opacity: 0 }} 
                whileInView={{ y: 0, opacity: 1 }} 
                viewport={{ once: true }} 
                transition={{ delay: i * 0.1 }} 
                className="feature-card neo-card"
              >
                <div style={{ width: '60px', height: '60px', background: 'var(--primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px', color: 'white' }}>
                  {feat.icon}
                </div>
                <h3 style={{ fontWeight: 900, fontSize: '1.8rem', marginBottom: '15px' }}>{feat.title}</h3>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.6, opacity: 0.8 }}>{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section style={{ background: 'var(--primary)', padding: '80px 40px', borderRadius: '30px', textAlign: 'center', color: 'white' }}>
          <h2 style={{ fontSize: '3.5rem', fontWeight: 950, marginBottom: '20px', letterSpacing: '-2px' }}>Ready to haunt your repos?</h2>
          <p style={{ fontSize: '1.3rem', marginBottom: '40px', opacity: 0.9 }}>Join 1,000+ developers automating their documentation.</p>
          <button className="neo-button" style={{ background: 'white', color: 'black', padding: '20px 60px', fontSize: '1.3rem' }} onClick={() => navigate('/login')}>
            Start Free Now
          </button>
        </section>
      </main>
    </div>
  );
};

function MainApp() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));
  const navigate = useNavigate();

  const loginSuccess = (data) => {
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    navigate('/dashboard');
  };

  const handleGithubCallback = async (code) => {
    try {
      const intent = localStorage.getItem('github_intent');
      const endpoint = intent === 'connect' ? `${API_URL}/auth/github/connect` : `${API_URL}/auth/github`;
      const { data } = await axios.post(endpoint, { code });
      
      if (intent === 'connect') {
        const updatedUser = { ...user, has_github: true };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        localStorage.removeItem('github_intent');
      } else {
        loginSuccess(data);
      }
    } catch (e) { 
      alert(`GitHub Auth failed: ${e.response?.data?.detail || e.message}`); 
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      handleGithubCallback(code);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const handleLogout = () => {
    googleLogout();
    localStorage.clear();
    setUser(null);
    navigate('/');
  };

  return (
    <>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
        <Route path="/login" element={<UserLogin onLoginSuccess={loginSuccess} />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
      </Routes>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <Router><MainApp /></Router>
  );
}
