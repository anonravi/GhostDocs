import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RefreshCw, ExternalLink, Ghost, AlertCircle, CheckCircle2, Clock, LogOut, User as UserIcon, Shield, Users, Trash2, Key } from 'lucide-react';
import { GoogleOAuthProvider, useGoogleLogin, googleLogout } from '@react-oauth/google';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const GOOGLE_CLIENT_ID = "703431618953-ems9fk5tg7rdlskf7vkop8usnqujre35.apps.googleusercontent.com";
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const loginWithGithub = () => {
  window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user,repo`;
};

const Navbar = ({ user, onLogout, activeTab, setActiveTab }) => (
  <header className="navbar-header" style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Ghost size={32} />
      <h1 style={{ fontSize: '1.8rem', fontWeight: 900 }}>GhostDocs</h1>
    </div>
    
    <div className="navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <nav style={{ display: 'flex', gap: '10px' }}>
        <button className="neo-button" style={{ background: activeTab === 'dashboard' ? 'var(--primary)' : 'white' }} onClick={() => setActiveTab('dashboard')}>Dash</button>
        {user?.is_admin && <button className="neo-button" style={{ background: activeTab === 'admin' ? 'var(--accent)' : 'white' }} onClick={() => setActiveTab('admin')}>Admin</button>}
      </nav>
      <button className="neo-button" style={{ background: 'var(--secondary)' }} onClick={onLogout}><LogOut size={16} /></button>
    </div>
  </header>
);

const UserLoginContent = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const { data } = await axios.post(`${API_URL}/auth/google`, { token: tokenResponse.access_token, is_access_token: true });
        onLoginSuccess(data);
      } catch (e) { 
        alert(`Google Auth failed: ${e.response?.data?.detail || e.message}`); 
      }
    }
  });

  const handleManualAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isRegister ? 'register' : 'login';
      const payload = isRegister ? { email, password, name } : { email, password };
      const { data } = await axios.post(`${API_URL}/auth/${endpoint}`, payload);
      onLoginSuccess(data);
    } catch (e) {
      alert(`${isRegister ? 'Sign Up' : 'Login'} failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="neo-card login-card" 
        style={{ textAlign: 'center', width: '100%', maxWidth: '420px', padding: '40px 30px' }}
      >
        <div className="floating" style={{ display: 'inline-block', marginBottom: '20px' }}>
          <Ghost size={60} strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '5px' }}>GhostDocs</h1>
        <p style={{ marginBottom: '30px', fontSize: '1rem', opacity: 0.7 }}>{isRegister ? 'Create your account' : 'Welcome back'}</p>
        
        <form onSubmit={handleManualAuth} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {isRegister && (
            <input className="neo-input" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required />
          )}
          <input className="neo-input" type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="neo-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button className="neo-button" style={{ background: 'var(--accent)', justifyContent: 'center', padding: '12px' }}>
            {isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ height: '2px', background: '#eee', flex: 1 }}></div>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, opacity: 0.5 }}>OR</span>
          <div style={{ height: '2px', background: '#eee', flex: 1 }}></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="neo-button" style={{ background: 'white', justifyContent: 'center', padding: '12px' }} onClick={() => login()}>
            <img src="https://www.google.com/favicon.ico" style={{ width: '16px' }} /> Continue with Google
          </button>
          <button className="neo-button" style={{ background: '#000', color: 'white', border: 'none', justifyContent: 'center', padding: '12px', fontWeight: 500 }} onClick={loginWithGithub}>
            <Users size={16} /> Continue with GitHub
          </button>
        </div>
        
        <button 
          onClick={() => setIsRegister(!isRegister)}
          style={{ marginTop: '24px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)' }}
        >
          {isRegister ? 'Already have an account? Sign In' : 'No account? Create one now'}
        </button>
      </motion.div>
    </div>
  );
};

const UserLogin = ({ onLoginSuccess }) => (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <UserLoginContent onLoginSuccess={onLoginSuccess} />
  </GoogleOAuthProvider>
);

const AdminLogin = ({ onAdminLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === 'admin' && password === 'ravi') {
      onAdminLogin({ name: "Admin Chief", email: "admin@ghostdocs.ai", is_admin: true, access_token: "internal-chief-token" });
    } else alert("Wrong words!");
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', padding: '20px' }}>
      <form className="neo-card login-card" style={{ width: '100%', maxWidth: '400px' }} onSubmit={handleSubmit}>
        <Key size={40} style={{ marginBottom: '20px' }} />
        <h2>Secret Entry</h2>
        <div style={{ marginBottom: '20px', marginTop: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 800 }}>Username</label>
          <input className="neo-input" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 800 }}>Password</label>
          <input className="neo-input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <button className="neo-button" style={{ width: '100%', justifyContent: 'center' }}>Enter</button>
      </form>
    </div>
  );
};

function Dashboard({ user, onLogout }) {
  const [jobs, setJobs] = useState([]);
  const [users, setUsers] = useState([]);
  const [repo, setRepo] = useState('anonravi/Echo');
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
  <footer style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.6, fontSize: '0.9rem', fontWeight: 700 }}>
    © {new Date().getFullYear()} Ravi Yadav @ Shoolini University GF202218734
  </footer>
);

function MainApp() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));
  const navigate = useNavigate();

  const loginSuccess = (data) => {
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    navigate('/');
  };

  const handleGithubCallback = async (code) => {
    try {
      const { data } = await axios.post(`${API_URL}/auth/github`, { code });
      loginSuccess(data);
    } catch (e) { 
      alert(`GitHub Auth failed at ${API_URL}: ${e.response?.data?.detail || e.message}`); 
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

  const handleGoogleSuccess = async (res) => {
    try {
      const { data } = await axios.post(`${API_URL}/auth/google`, { token: res.credential });
      loginSuccess(data);
    } catch (e) { alert("Auth failed"); }
  };

  const handleLogout = () => {
    googleLogout();
    localStorage.clear();
    setUser(null);
    navigate('/');
  };

  return (
    <>
      <Routes>
        <Route path="/admin" element={<AdminLogin onAdminLogin={loginSuccess} />} />
        <Route path="/" element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <UserLogin onLoginSuccess={handleGoogleSuccess} />} />
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
