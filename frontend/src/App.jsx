import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RefreshCw, ExternalLink, Ghost, AlertCircle, CheckCircle2, Clock, LogOut, User as UserIcon, Shield, Users, Trash2, Key, Code, ChevronDown, Eye, Lock, GitBranch, BarChart2, FileText, Bug, X } from 'lucide-react';
import { GoogleOAuthProvider, useGoogleLogin, googleLogout } from '@react-oauth/google';
import './index.css';

// ─── Toast Notification System ──────────────────────────────────
const ToastContainer = ({ toasts, removeToast }) => (
  <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '380px' }}>
    <AnimatePresence>
      {toasts.map(t => (
        <motion.div
          key={t.id}
          initial={{ opacity: 0, x: 80, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 80, scale: 0.9 }}
          style={{
            padding: '14px 16px',
            border: '3px solid #000',
            borderBottom: '5px solid #000',
            borderRight: '5px solid #000',
            background: t.type === 'success' ? 'var(--accent)' : t.type === 'error' ? 'var(--secondary)' : 'white',
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            fontWeight: 800, fontSize: '0.88rem', lineHeight: 1.4,
          }}
        >
          <span style={{ flexShrink: 0, marginTop: '2px' }}>
            {t.type === 'success' ? <CheckCircle2 size={16}/> : t.type === 'error' ? <AlertCircle size={16}/> : <Clock size={16}/>}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => removeToast(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', flexShrink: 0 }}>
            <X size={14}/>
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

const API_URL = import.meta.env.VITE_API_URL || 'https://ghostdocs-backend.onrender.com';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '703431618953-ems9fk5tg7rdlskf7vkop8usnqujre35.apps.googleusercontent.com';
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || 'Ov23liQl9MQxnrasYDXF';

axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const loginWithGithub = () => {
  try { localStorage.setItem('github_intent', 'login'); } catch(e) {}
  window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user,repo`;
};

const connectGithub = () => {
  try { localStorage.setItem('github_intent', 'connect'); } catch(e) {}
  window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user,repo`;
};

// ─── Navbar ─────────────────────────────────────────────────────
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

// ─── Login Screen ───────────────────────────────────────────────
const UserLoginContent = ({ onLoginSuccess }) => {
  const [processing, setProcessing] = useState(false);
  const [loginError, setLoginError] = useState('');

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      if (processing) return;
      setProcessing(true);
      setLoginError('');
      try {
        const { data } = await axios.post(`${API_URL}/auth/google`, { token: tokenResponse.access_token, is_access_token: true });
        onLoginSuccess(data);
      } catch (e) { 
        if (e.message === 'Network Error') {
          setLoginError('👻 The server is waking up (Render free tier). Please wait 30–50 seconds and try again.');
        } else {
          setLoginError('Sign-in failed. Please try again.');
        }
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
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '20px' }}>GhostDocs</h1>
        <p style={{ marginBottom: '30px', fontWeight: 700, fontSize: '1.1rem', opacity: 0.7 }}>
          Sign In or Create an Account
        </p>

        {loginError && (
          <div style={{ background: 'var(--secondary)', border: '3px solid #000', padding: '12px 16px', marginBottom: '20px', fontWeight: 800, fontSize: '0.88rem', textAlign: 'left', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }}/>
            <span>{loginError}</span>
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <button className="neo-button" style={{ background: 'white', justifyContent: 'center', padding: '16px', fontSize: '1.1rem' }} onClick={() => login()} disabled={processing}>
            {processing ? <><RefreshCw size={18} className="spinner"/> Signing in...</> : <><img src="https://www.google.com/favicon.ico" style={{ width: '20px' }} alt="Google" /> Continue with Google</>}
          </button>
          <button className="neo-button" style={{ background: '#000', color: 'white', border: 'none', justifyContent: 'center', padding: '16px', fontSize: '1.1rem' }} onClick={loginWithGithub} disabled={processing}>
            <Users size={20} /> Continue with GitHub
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const UserLogin = ({ onLoginSuccess }) => (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <UserLoginContent onLoginSuccess={onLoginSuccess} />
  </GoogleOAuthProvider>
);

// ─── Dashboard ──────────────────────────────────────────────────
function Dashboard({ user, onLogout, setUser }) {
  const [jobs, setJobs] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Repo picker state
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [branch, setBranch] = useState('main');
  const [repoSearch, setRepoSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatingSeconds, setGeneratingSeconds] = useState(0);
  const [preview, setPreview] = useState(null);
  const [pushing, setPushing] = useState(false);

  // Admin states
  const [adminTab, setAdminTab] = useState('overview'); // 'overview'|'users'|'jobs'|'errors'
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminJobFilter, setAdminJobFilter] = useState('all');
  const [selectedJobLogs, setSelectedJobLogs] = useState(null);
  const [errorLogs, setErrorLogs] = useState([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [adminLastRefresh, setAdminLastRefresh] = useState(null);

  // Toast notification state
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);
  const removeToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // Live elapsed-seconds timer while generating
  useEffect(() => {
    if (!generating) { setGeneratingSeconds(0); return; }
    const interval = setInterval(() => setGeneratingSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [generating]);

  const fetchJobs = async () => {
    try {
      const jRes = await axios.get(`${API_URL}/jobs`);
      setJobs(jRes.data);
      if (user?.is_admin) {
        const [uRes, aRes] = await Promise.all([
          axios.get(`${API_URL}/users`),
          axios.get(`${API_URL}/admin/analytics`),
        ]);
        setUsers(uRes.data);
        setAnalytics(aRes.data);
        setAdminLastRefresh(new Date());
      }
    } catch (e) { if (e.response?.status === 401 || e.response?.status === 403) onLogout(); }
  };

  const fetchErrorLogs = async () => {
    if (!user?.is_admin) return;
    setErrorLogsLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/admin/error-logs`);
      setErrorLogs(data);
    } catch (e) {
      console.error('Failed to fetch error logs:', e);
    } finally { setErrorLogsLoading(false); }
  };

  const clearErrorLogs = async () => {
    if (!window.confirm('Clear all error logs? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/admin/error-logs`);
      setErrorLogs([]);
      showToast('All error logs cleared.', 'success');
    } catch (e) {
      showToast('Failed to clear logs. Please try again.', 'error');
    }
  };

  const fetchRepos = async () => {
    setReposLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/repos`);
      setRepos(data);
    } catch (e) { 
      console.error('Failed to fetch repos:', e);
      // If the backend returns a 400, 401, or 502, it means the GitHub token is invalid/expired/missing.
      // We update the user state to has_github = false to let them re-connect seamlessly!
      if (e.response?.status === 400 || e.response?.status === 401 || e.response?.status === 502) {
        const updatedUser = { ...user, has_github: false };
        setUser(updatedUser);
        try {
          localStorage.setItem('user', JSON.stringify(updatedUser));
        } catch(err) {}
      }
    }
    finally { setReposLoading(false); }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-fetch error logs when admin switches to errors tab
  useEffect(() => {
    if (activeTab === 'admin' && adminTab === 'errors') fetchErrorLogs();
  }, [activeTab, adminTab]);

  useEffect(() => {
    if (user?.has_github) fetchRepos();
  }, [user?.has_github]);

  const handleSelectRepo = (repo) => {
    setSelectedRepo(repo);
    setBranch(repo.default_branch);
    setRepoSearch('');
    setDropdownOpen(false);
    setPreview(null);
  };

  const handleGenerate = async () => {
    if (!selectedRepo) return;
    setGenerating(true);
    setPreview(null);
    try {
      // 🚀 Step 1: Fire off the job — backend returns immediately with job_id
      const { data: jobStart } = await axios.post(`${API_URL}/generate/preview`, { repo_name: selectedRepo.full_name, branch });
      const jobId = jobStart.job_id;

      // 🔄 Step 2: Poll /jobs/{job_id} every 3 seconds until it's done
      // This avoids Render's 30-second HTTP timeout killing long AI calls
      await new Promise((resolve, reject) => {
        const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minute max
        const POLL_INTERVAL_MS = 3000;
        const startTime = Date.now();

        const poll = async () => {
          try {
            const { data: jobStatus } = await axios.get(`${API_URL}/jobs/${jobId}`);
            if (jobStatus.status === 'preview') {
              setPreview(jobStatus);
              resolve();
            } else if (jobStatus.status === 'failed') {
              reject(new Error(jobStatus.error_message || 'Generation failed on the server.'));
            } else if (Date.now() - startTime > MAX_WAIT_MS) {
              reject(new Error('Generation timed out after 5 minutes. Try a smaller repository.'));
            } else {
              setTimeout(poll, POLL_INTERVAL_MS);
            }
          } catch (pollErr) {
            reject(pollErr);
          }
        };
        setTimeout(poll, POLL_INTERVAL_MS);
      });
    } catch (e) {
      showToast('Documentation generation failed. Please try again or select a different repository.', 'error');
    } finally { setGenerating(false); }
  };

  const handlePush = async () => {
    if (!preview?.job_id) return;
    setPushing(true);
    try {
      const { data } = await axios.post(`${API_URL}/generate/push`, { job_id: preview.job_id });
      showToast('✅ Pull Request created successfully! Check your repository.', 'success');
      setPreview(null);
      setSelectedRepo(null);
      fetchJobs();
    } catch (e) {
      showToast('Push failed. Please check your repository permissions and try again.', 'error');
    } finally { setPushing(false); }
  };

  const toggleUserActive = async (id) => {
    await axios.post(`${API_URL}/users/${id}/toggle-active`);
    fetchJobs();
  };

  const toggleUserAdmin = async (id) => {
    await axios.post(`${API_URL}/users/${id}/toggle-admin`);
    fetchJobs();
  };

  const filteredRepos = repos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));

  const filteredUsers = users.filter(u => 
    (u.full_name || '').toLowerCase().includes(adminUserSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(adminUserSearch.toLowerCase())
  );

  return (
    <div className="container">
      <Navbar user={user} onLogout={onLogout} activeTab={activeTab} setActiveTab={setActiveTab} />
      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' ? (
          <motion.div key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            
            {/* ─── GitHub Connection Gate ─── */}
            {!user?.has_github ? (
              <section className="neo-card" style={{ padding: '30px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: '3px solid #000', paddingBottom: '16px' }}>
                  <Ghost size={36} className="floating" />
                  <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 900 }}>Welcome to GhostDocs! 👻</h2>
                    <p style={{ fontSize: '0.95rem', opacity: 0.7, fontWeight: 700 }}>Let's get your autonomous documentation agent set up in a few simple steps.</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Step 1 */}
                  <div style={{ 
                    border: '3px solid #000', 
                    padding: '20px', 
                    background: 'white', 
                    borderBottom: '6px solid #000', 
                    borderRight: '6px solid #000',
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: '0.8rem' }}>1</span>
                        Connect GitHub Profile
                      </h4>
                      <span style={{ background: 'var(--secondary)', padding: '4px 8px', fontSize: '0.75rem', fontWeight: 900, border: '2px solid #000' }}>REQUIRED</span>
                    </div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 700, opacity: 0.8 }}>
                      To pull repository structures, parse code abstract syntax trees (AST), and commit pull requests automatically, GhostDocs requires secure authorization.
                    </p>
                    <button className="neo-button" style={{ background: '#000', color: 'white', border: 'none', alignSelf: 'flex-start', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={connectGithub}>
                      <Users size={16} /> Link GitHub Profile
                    </button>
                  </div>

                  {/* Step 2 */}
                  <div style={{ 
                    border: '3px solid #ccc', 
                    padding: '20px', 
                    background: '#fafafa', 
                    opacity: 0.6,
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px' 
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: '#ccc', color: 'white', fontSize: '0.8rem', fontWeight: 900 }}>2</span>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 900, color: '#666' }}>Choose a Repository</h4>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#888', marginTop: '2px' }}>Search and choose from any of your public or private repositories.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div style={{ 
                    border: '3px solid #ccc', 
                    padding: '20px', 
                    background: '#fafafa', 
                    opacity: 0.6,
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px' 
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: '#ccc', color: 'white', fontSize: '0.8rem', fontWeight: 900 }}>3</span>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 900, color: '#666' }}>Review Generated README</h4>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#888', marginTop: '2px' }}>Our AI parses functions, architectures, and generates an AST-grounded README + Mermaid diagrams.</p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div style={{ 
                    border: '3px solid #ccc', 
                    padding: '20px', 
                    background: '#fafafa', 
                    opacity: 0.6,
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px' 
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: '#ccc', color: 'white', fontSize: '0.8rem', fontWeight: 900 }}>4</span>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 900, color: '#666' }}>Push Pull Request</h4>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#888', marginTop: '2px' }}>Approve & push directly to a new git branch and automatically open a PR for merging.</p>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <>
                {/* ─── New User Welcome & Empty State Banner ─── */}
                {jobs.filter(j => j.status !== 'preview').length === 0 && (
                  <div className="neo-card" style={{ background: 'var(--primary)', color: 'black', marginBottom: '24px', padding: '24px', borderBottom: '6px solid #000', borderRight: '6px solid #000' }}>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '8px' }}>Welcome to GhostDocs, {user.name || 'Developer'}! 👻</h3>
                    <p style={{ fontWeight: 700, opacity: 0.9, lineHeight: 1.4 }}>
                      Your GitHub is connected successfully. You're ready to automate your documentation!
                      Follow the quick guide below to generate your very first autonomous README.
                    </p>
                    <ol style={{ marginTop: '12px', paddingLeft: '20px', fontWeight: 800, fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '6px', listStyleType: 'decimal' }}>
                      <li>Select your target repository from the search dropdown below.</li>
                      <li>Click "Generate README Preview" to let our AI agent analyze the project architecture.</li>
                      <li>Review the generated markdown, then click "Approve & Push to GitHub" to create a Pull Request automatically.</li>
                    </ol>
                  </div>
                )}
                {/* ─── Repository Picker ─── */}
                <section className="neo-card">
                  <h2 style={{ marginBottom: '20px' }}>Generate Documentation</h2>
                  
                  <div style={{ marginBottom: '20px', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ opacity: 0.8, fontWeight: 700 }}>Select Repository</label>
                      {user?.has_github && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchRepos();
                          }}
                          disabled={reposLoading}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontSize: '0.8rem', 
                            fontWeight: 800, 
                            color: 'var(--primary)',
                            padding: '2px 6px',
                          }}
                          className="hover-opacity"
                        >
                          <RefreshCw size={12} className={reposLoading ? 'spinner' : ''} />
                          {reposLoading ? 'Refreshing...' : 'Refresh'}
                        </button>
                      )}
                    </div>
                    <div 
                      className="neo-input" 
                      onClick={() => {
                        const nextState = !dropdownOpen;
                        setDropdownOpen(nextState);
                        if (nextState && user?.has_github) {
                          fetchRepos();
                        }
                      }}
                      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      {selectedRepo ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {selectedRepo.private && <Lock size={14} />}
                          {selectedRepo.full_name}
                        </span>
                      ) : (
                        <span style={{ opacity: 0.5 }}>{reposLoading ? 'Loading repositories...' : 'Choose a repository...'}</span>
                      )}
                      <ChevronDown size={16} />
                    </div>

                    {dropdownOpen && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '3px solid #000', zIndex: 100, maxHeight: '300px', overflowY: 'auto' }}>
                        <input 
                          className="neo-input"
                          value={repoSearch}
                          onChange={e => setRepoSearch(e.target.value)}
                          placeholder="Search repos..."
                          style={{ borderBottom: '2px solid #eee', position: 'sticky', top: 0, background: 'white' }}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                        {filteredRepos.length === 0 && (
                          <div style={{ padding: '16px', opacity: 0.5, textAlign: 'center' }}>No repos found</div>
                        )}
                        {filteredRepos.map(r => (
                          <div 
                            key={r.full_name} 
                            onClick={() => handleSelectRepo(r)}
                            style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #eee', fontWeight: 600, transition: 'background 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                          >
                            {r.private ? <Lock size={14} color="#888" /> : <Code size={14} color="#888" />}
                            {r.full_name}
                            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.5 }}>{r.default_branch}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedRepo && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', opacity: 0.8, fontWeight: 700 }}>
                        <GitBranch size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Branch
                      </label>
                      <input className="neo-input" value={branch} onChange={e => setBranch(e.target.value)} />
                    </div>
                  )}

                  {selectedRepo && !preview && (
                    <button className="neo-button" onClick={handleGenerate} disabled={generating} style={{ width: '100%', justifyContent: 'center', background: 'var(--accent)', padding: '16px', fontSize: '1.1rem' }}>
                      {generating ? <><RefreshCw className="spinner" size={20} /> Analyzing repo... {generatingSeconds}s (AI is thinking)</> : <><Eye size={20} /> Generate README Preview</>}
                    </button>
                  )}
                </section>

                {/* ─── README Preview ─── */}
                {preview && (
                  <motion.section className="neo-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Eye size={24} /> Generated README Preview
                    </h2>
                    <div style={{ background: '#f8f9fa', border: '2px solid #eee', padding: '24px', marginBottom: '20px', maxHeight: '500px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {preview.readme}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <button className="neo-button" onClick={handlePush} disabled={pushing} style={{ flex: 1, justifyContent: 'center', background: 'var(--accent)', padding: '16px', fontSize: '1rem' }}>
                        {pushing ? <><RefreshCw className="spinner" size={16} /> Pushing...</> : <><CheckCircle2 size={16} /> Approve & Push to GitHub</>}
                      </button>
                      <button className="neo-button" onClick={handleGenerate} disabled={generating} style={{ flex: 1, justifyContent: 'center', background: 'var(--primary)', padding: '16px', fontSize: '1rem' }}>
                        {generating ? <><RefreshCw className="spinner" size={16} /> Regenerating...</> : <><RefreshCw size={16} /> Regenerate</>}
                      </button>
                    </div>
                  </motion.section>
                )}
              </>
            )}

            {/* ─── Job History ─── */}
            <section style={{ marginTop: '24px' }}>
              <h2 style={{ marginBottom: '20px' }}>Recent Jobs</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {jobs.length === 0 && <p style={{ opacity: 0.5 }}>No jobs found yet...</p>}
                {jobs.filter(j => j.status !== 'preview').map(job => (
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
            {/* ─── Admin Console Header ─── */}
            <div className="neo-card" style={{ background: '#fff', borderLeft: '10px solid var(--primary)', marginBottom: '24px', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Shield size={32} color="var(--primary)" />
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Admin Platform Console</h2>
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, opacity: 0.7 }}>
                    Restricted · Admin: <strong>ravi492002@gmail.com</strong>
                    {adminLastRefresh && <span style={{ marginLeft: '12px', opacity: 0.5 }}>· Refreshed {Math.round((Date.now() - adminLastRefresh) / 1000)}s ago</span>}
                  </p>
                </div>
              </div>
              <button className="neo-button" onClick={fetchJobs} style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
                <RefreshCw size={14}/> Refresh
              </button>
            </div>

            {/* ─── Admin Sub-Tab Nav ─── */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', borderBottom: '3px solid #000', paddingBottom: '0', flexWrap: 'wrap' }}>
              {[
                { key: 'overview', label: 'Overview', icon: <BarChart2 size={15}/> },
                { key: 'users',    label: `Users (${users.length})`, icon: <Users size={15}/> },
                { key: 'jobs',     label: `Jobs (${jobs.length})`, icon: <FileText size={15}/> },
                { key: 'errors',   label: `Errors ${analytics?.total_errors > 0 ? `(${analytics.total_errors})` : ''}`, icon: <Bug size={15}/> },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setAdminTab(tab.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '10px 18px', fontWeight: 900, fontSize: '0.9rem',
                    border: '3px solid #000', borderBottom: adminTab === tab.key ? '3px solid white' : '3px solid #000',
                    borderRadius: '0', cursor: 'pointer',
                    background: adminTab === tab.key ? 'white' : '#f5f5f5',
                    marginBottom: adminTab === tab.key ? '-3px' : '0',
                    color: tab.key === 'errors' && analytics?.total_errors > 0 ? '#c62828' : 'inherit',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* ══════════════ TAB: OVERVIEW ══════════════ */}
            {adminTab === 'overview' && analytics && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                  {[
                    { label: 'Total Users', value: analytics.total_users, bg: 'white' },
                    { label: 'Active Users', value: analytics.active_users, bg: 'white' },
                    { label: 'GitHub Linked', value: `${analytics.github_connected} (${analytics.total_users > 0 ? Math.round(analytics.github_connected/analytics.total_users*100) : 0}%)`, bg: 'var(--primary)' },
                    { label: 'Total Jobs', value: analytics.total_jobs, bg: 'white' },
                    { label: 'Completed', value: analytics.completed_jobs, bg: 'var(--accent)' },
                    { label: 'Failed', value: analytics.failed_jobs, bg: analytics.failed_jobs > 0 ? 'var(--secondary)' : 'white' },
                    { label: 'Success Rate', value: `${analytics.success_rate}%`, bg: 'white' },
                    { label: 'Error Log Entries', value: analytics.total_errors, bg: analytics.total_errors > 0 ? '#fff3e0' : 'white' },
                  ].map((card, i) => (
                    <div key={i} style={{ background: card.bg, padding: '20px', border: '3px solid #000', borderBottom: '6px solid #000', borderRight: '6px solid #000' }}>
                      <h3 style={{ fontSize: '0.8rem', opacity: 0.7, textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px' }}>{card.label}</h3>
                      <p style={{ fontSize: '2.2rem', fontWeight: 900, lineHeight: 1 }}>{card.value}</p>
                    </div>
                  ))}
                </div>

                <div className="neo-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '20px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'green', flexShrink: 0 }} className="floating" />
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '1rem' }}>AI Provider: {analytics.ai_provider} → DeepSeek (fallback)</div>
                    <div style={{ fontSize: '0.82rem', opacity: 0.6, fontWeight: 700, marginTop: '4px' }}>System status: {analytics.system_health} · {analytics.processing_jobs} job(s) currently running</div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ══════════════ TAB: USERS ══════════════ */}
            {adminTab === 'users' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <section className="neo-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', borderBottom: '3px solid #000', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>User Management</h2>
                    <input
                      className="neo-input"
                      value={adminUserSearch}
                      onChange={e => setAdminUserSearch(e.target.value)}
                      placeholder="Filter by name or email..."
                      style={{ maxWidth: '320px' }}
                    />
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                      <thead>
                        <tr style={{ borderBottom: '3px solid #000' }}>
                          {['Name', 'Email', 'GitHub', 'Role', 'Status', 'Jobs', 'Joined', 'Actions'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '12px', fontWeight: 900, fontSize: '0.82rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(u => (
                          <tr key={u.id} style={{ borderBottom: '2px solid #eee' }}>
                            <td style={{ padding: '12px', fontWeight: 800, fontSize: '0.9rem' }}>{u.full_name || '—'}</td>
                            <td style={{ padding: '12px', fontSize: '0.82rem', fontWeight: 700, opacity: 0.8 }}>{u.email}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ background: u.has_github ? '#e8f5e9' : '#ffebee', color: u.has_github ? '#2e7d32' : '#c62828', border: `2px solid ${u.has_github ? '#2e7d32' : '#c62828'}`, padding: '3px 7px', fontSize: '0.7rem', fontWeight: 900 }}>
                                {u.has_github ? 'LINKED' : 'NONE'}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ padding: '3px 7px', fontSize: '0.7rem', fontWeight: 900, border: '2px solid #000', background: u.is_admin ? 'var(--primary)' : '#fff' }}>
                                {u.is_admin ? 'ADMIN' : 'USER'}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ padding: '3px 7px', background: u.is_active ? 'var(--accent)' : 'var(--secondary)', fontWeight: 800, fontSize: '0.7rem', border: '2px solid #000' }}>
                                {u.is_active ? 'ACTIVE' : 'BANNED'}
                              </span>
                            </td>
                            <td style={{ padding: '12px', fontWeight: 800 }}>
                              {jobs.filter(j => j.user_id === u.id).length}
                            </td>
                            <td style={{ padding: '12px', fontSize: '0.78rem', opacity: 0.6, fontWeight: 700 }}>
                              {new Date(u.created_at).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <button
                                className="neo-button"
                                style={{ padding: '4px 8px', fontSize: '0.72rem', background: u.is_active ? 'var(--secondary)' : 'var(--accent)' }}
                                onClick={() => toggleUserActive(u.id)}
                              >
                                {u.is_active ? 'BAN' : 'RESTORE'}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredUsers.length === 0 && (
                          <tr><td colSpan="8" style={{ textAlign: 'center', padding: '24px', opacity: 0.4, fontWeight: 700 }}>No users found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </motion.div>
            )}

            {/* ══════════════ TAB: JOBS ══════════════ */}
            {adminTab === 'jobs' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <section className="neo-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', borderBottom: '3px solid #000', paddingBottom: '16px' }}>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Job Audit Log</h2>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {['all', 'processing', 'preview', 'completed', 'failed'].map(f => (
                        <button
                          key={f}
                          onClick={() => setAdminJobFilter(f)}
                          className="neo-button"
                          style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 900, background: adminJobFilter === f ? '#000' : 'white', color: adminJobFilter === f ? '#fff' : '#000' }}
                        >
                          {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '750px' }}>
                      <thead>
                        <tr style={{ borderBottom: '3px solid #000' }}>
                          {['User', 'Repository', 'Branch', 'Status', 'Date', 'Output'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '12px', fontWeight: 900, fontSize: '0.82rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {jobs
                          .filter(j => adminJobFilter === 'all' || j.status === adminJobFilter)
                          .map(job => {
                            const jobUser = users.find(u => u.id === job.user_id);
                            return (
                              <React.Fragment key={job.id}>
                                <tr style={{ borderBottom: '2px solid #eee' }}>
                                  <td style={{ padding: '12px', fontWeight: 700, fontSize: '0.82rem' }}>
                                    {jobUser ? <span>{jobUser.full_name || jobUser.email.split('@')[0]}<br/><span style={{ opacity: 0.5, fontSize: '0.72rem' }}>{jobUser.email}</span></span> : <span style={{ opacity: 0.4 }}>Unknown</span>}
                                  </td>
                                  <td style={{ padding: '12px', fontWeight: 800, fontSize: '0.85rem' }}>{job.repo_name}</td>
                                  <td style={{ padding: '12px', fontSize: '0.8rem', fontFamily: 'monospace' }}>{job.commit_sha}</td>
                                  <td style={{ padding: '12px' }}>
                                    <span style={{ padding: '3px 8px', fontSize: '0.7rem', fontWeight: 900, border: '2px solid #000', background: job.status === 'completed' ? 'var(--accent)' : job.status === 'failed' ? 'var(--secondary)' : job.status === 'processing' ? '#fff9c4' : '#fff' }}>
                                      {job.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px', fontSize: '0.78rem', opacity: 0.6, fontWeight: 700 }}>
                                    {new Date(job.created_at).toLocaleString()}
                                  </td>
                                  <td style={{ padding: '12px' }}>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      {job.pr_url && (
                                        <a href={job.pr_url} target="_blank" rel="noreferrer" className="neo-button" style={{ padding: '3px 7px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                          <ExternalLink size={11}/> PR
                                        </a>
                                      )}
                                      {job.error_message && (
                                        <button
                                          className="neo-button"
                                          style={{ padding: '3px 7px', fontSize: '0.68rem', background: selectedJobLogs === job.id ? '#000' : 'white', color: selectedJobLogs === job.id ? '#fff' : '#000', display: 'flex', alignItems: 'center', gap: '3px' }}
                                          onClick={() => setSelectedJobLogs(selectedJobLogs === job.id ? null : job.id)}
                                        >
                                          <AlertCircle size={11}/> {selectedJobLogs === job.id ? 'Hide' : 'Error'}
                                        </button>
                                      )}
                                      {!job.pr_url && !job.error_message && <span style={{ opacity: 0.35, fontSize: '0.72rem', fontWeight: 700 }}>—</span>}
                                    </div>
                                  </td>
                                </tr>
                                {selectedJobLogs === job.id && job.error_message && (
                                  <tr>
                                    <td colSpan="6" style={{ background: '#fff8f8', padding: '14px', border: '3px dashed var(--secondary)' }}>
                                      <div style={{ fontWeight: 900, color: '#c62828', marginBottom: '6px', fontSize: '0.88rem' }}>Job Error Message (user-safe):</div>
                                      <pre style={{ margin: 0, padding: '10px', background: 'white', border: '2px solid #000', fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'pre-wrap', color: '#b71c1c' }}>{job.error_message}</pre>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        {jobs.filter(j => adminJobFilter === 'all' || j.status === adminJobFilter).length === 0 && (
                          <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', opacity: 0.4, fontWeight: 700 }}>No jobs match the selected filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </motion.div>
            )}

            {/* ══════════════ TAB: ERROR LOGS ══════════════ */}
            {adminTab === 'errors' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <section className="neo-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', borderBottom: '3px solid #000', paddingBottom: '16px' }}>
                    <div>
                      <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#c62828' }}>🔴 Error Log — Admin Only</h2>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, opacity: 0.6, marginTop: '4px' }}>Full tracebacks. Users only ever see generic messages.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="neo-button" onClick={fetchErrorLogs} style={{ padding: '8px 14px', fontSize: '0.82rem' }}>
                        <RefreshCw size={13}/> Refresh
                      </button>
                      {errorLogs.length > 0 && (
                        <button className="neo-button" onClick={clearErrorLogs} style={{ padding: '8px 14px', fontSize: '0.82rem', background: 'var(--secondary)' }}>
                          <Trash2 size={13}/> Clear All
                        </button>
                      )}
                    </div>
                  </div>

                  {errorLogsLoading ? (
                    <div style={{ textAlign: 'center', padding: '32px', opacity: 0.5, fontWeight: 700 }}><RefreshCw size={20} className="spinner"/> Loading error logs...</div>
                  ) : errorLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px', opacity: 0.4 }}>
                      <CheckCircle2 size={40} style={{ marginBottom: '12px' }} />
                      <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>No errors logged 🎉</div>
                      <div style={{ fontSize: '0.85rem', marginTop: '6px' }}>All systems running clean.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                      {errorLogs.map(err => (
                        <div key={err.id} style={{ borderBottom: '2px solid #eee', padding: '14px 4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', align: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <span style={{ background: 'var(--secondary)', border: '2px solid #000', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 900 }}>{err.error_type || 'Error'}</span>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.5 }}>{err.endpoint}</span>
                              {err.job_id && <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', opacity: 0.4 }}>job:{err.job_id.slice(0,8)}</span>}
                            </div>
                            <span style={{ fontSize: '0.75rem', opacity: 0.45, fontWeight: 700 }}>{new Date(err.timestamp).toLocaleString()}</span>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: '8px', color: '#c62828' }}>
                            {err.sanitized_message}
                          </div>
                          {err.full_traceback && (
                            <details>
                              <summary style={{ cursor: 'pointer', fontSize: '0.78rem', fontWeight: 900, opacity: 0.6, marginBottom: '6px' }}>▶ View Full Traceback</summary>
                              <pre style={{ margin: 0, padding: '10px', background: '#1a1a1a', color: '#ff8a80', fontFamily: 'monospace', fontSize: '0.72rem', whiteSpace: 'pre-wrap', borderRadius: '4px', border: '2px solid #000', overflowX: 'auto' }}>
                                {err.full_traceback}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </motion.div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

const Footer = () => (
  <footer style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.6, fontSize: '0.9rem', fontWeight: 700, marginTop: 'auto' }}>
    © {new Date().getFullYear()} Ravi Yadav @ Shoolini University GF202218734
  </footer>
);

// ─── Landing Page ───────────────────────────────────────────────
const LandingPage = () => {
  const navigate = useNavigate();
  return (
    <div className="landing-container" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden' }}>
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
        <section style={{ textAlign: 'center', marginBottom: '150px' }}>
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}>
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

        <motion.div 
          initial={{ y: 100, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }}
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
              <motion.div key={i} initial={{ y: 30, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="feature-card neo-card">
                <div style={{ width: '60px', height: '60px', background: 'var(--primary)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '25px', color: 'white' }}>
                  {feat.icon}
                </div>
                <h3 style={{ fontWeight: 900, fontSize: '1.8rem', marginBottom: '15px' }}>{feat.title}</h3>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.6, opacity: 0.8 }}>{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

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

// ─── Main App Router ────────────────────────────────────────────
function MainApp() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));
  const navigate = useNavigate();
  
  // Capture the search string immediately before React Router's <Navigate> clears it
  const initialSearch = window.location.search;

  const loginSuccess = (data) => {
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    navigate('/dashboard');
  };

  const handleGithubCallback = async (code) => {
    try {
      let intent = 'login';
      try { intent = localStorage.getItem('github_intent'); } catch(e) {}
      
      const endpoint = intent === 'connect' ? `${API_URL}/auth/github/connect` : `${API_URL}/auth/github`;
      const { data } = await axios.post(endpoint, { code });
      
      if (intent === 'connect') {
        const updatedUser = { ...user, has_github: true };
        setUser(updatedUser);
        try {
          localStorage.setItem('user', JSON.stringify(updatedUser));
          localStorage.removeItem('github_intent');
        } catch(e) {}
        navigate('/dashboard');
      } else {
        loginSuccess(data);
      }
    } catch (e) { 
      alert(`GitHub Auth failed: ${e.response?.data?.detail || e.message}`); 
      navigate('/login');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(initialSearch);
    const code = params.get('code');
    if (code) {
      handleGithubCallback(code);
      window.history.replaceState({}, document.title, "/dashboard");
    }
  }, []);

  const handleLogout = () => {
    googleLogout();
    localStorage.clear();
    setUser(null);
    navigate('/');
  };

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401 || error.response?.status === 403) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
        <Route path="/login" element={<UserLogin onLoginSuccess={loginSuccess} />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} onLogout={handleLogout} setUser={setUser} /> : <Navigate to="/login" />} />
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
