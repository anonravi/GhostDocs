import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RefreshCw, ExternalLink, Ghost, AlertCircle, CheckCircle2, Clock, LogOut, User as UserIcon, Shield, Users, Trash2, Key, GitHub } from 'lucide-react';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const GOOGLE_CLIENT_ID = "703431618953-ems9fk5tg7rdlskf7vkop8usnqujre35.apps.googleusercontent.com";
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

// Axios Global Security
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const loginWithGithub = () => {
  window.location.href = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user,repo`;
};

const Navbar = ({ user, onLogout, activeTab, setActiveTab }) => (
  <header style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Ghost size={32} />
      <h1 style={{ fontSize: '2rem' }}>GhostDocs</h1>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <nav style={{ display: 'flex', gap: '10px' }}>
        <button className="neo-button" style={{ padding: '6px 12px', background: activeTab === 'dashboard' ? 'var(--primary)' : 'white' }} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        {user?.is_admin && <button className="neo-button" style={{ padding: '6px 12px', background: activeTab === 'admin' ? 'var(--accent)' : 'white' }} onClick={() => setActiveTab('admin')}>Admin</button>}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
        {user?.is_admin ? <Shield size={18} /> : <UserIcon size={18} />} {user?.name || user?.email}
      </div>
      <button className="neo-button" style={{ background: '#ffb3b3', padding: '6px 12px' }} onClick={onLogout}><LogOut size={16} /></button>
    </div>
  </header>
);

const UserLogin = ({ onLoginSuccess }) => (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <div className="neo-card" style={{ textAlign: 'center', padding: '60px', width: '400px' }}>
        <Ghost size={60} style={{ marginBottom: '20px' }} />
        <h1 style={{ marginBottom: '10px' }}>GhostDocs</h1>
        <p style={{ marginBottom: '40px', opacity: 0.7 }}>Secure AI Documentation</p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <GoogleLogin onSuccess={onLoginSuccess} onError={() => alert('Login Failed')} width="280px" />
          <button className="neo-button" style={{ width: '280px', background: '#1a1a1a', color: 'white', border: 'none', display: 'flex', justifyContent: 'center', gap: '12px', height: '40px', padding: '0' }} onClick={loginWithGithub}>
            <GitHub size={18} /> Sign in with GitHub
          </button>
        </div>
      </div>
    </div>
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
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)' }}>
      <form className="neo-card" style={{ width: '400px', padding: '40px' }} onSubmit={handleSubmit}>
        <Key size={40} style={{ marginBottom: '20px' }} />
        <h2>Secret Entry</h2>
        <div style={{ marginBottom: '20px', marginTop: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>Username</label>
          <input className="neo-input" value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>Password</label>
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

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '60px 20px' }}>
      <Navbar user={user} onLogout={onLogout} activeTab={activeTab} setActiveTab={setActiveTab} />
      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' ? (
          <motion.div key="dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <section className="neo-card" style={{ marginBottom: '40px' }}>
              <h2 style={{ marginBottom: '20px' }}>Trigger Generation</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <input className="neo-input" value={repo} onChange={e => setRepo(e.target.value)} />
                <input className="neo-input" value={sha} onChange={e => setSha(e.target.value)} />
              </div>
              <button className="neo-button" onClick={triggerDocs} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? <RefreshCw className="spinner" /> : <Send size={20} />} Raise PR
              </button>
            </section>
            <section>
              <h2>Activities</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                {jobs.map(job => (
                  <div key={job.id} className="neo-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><h3>{job.repo_name}</h3><small style={{ opacity: 0.6 }}>{job.status}</small></div>
                    {job.pr_url && <a href={job.pr_url} target="_blank" rel="noreferrer" className="neo-button" style={{ padding: '6px 12px', background: 'white' }}>PR</a>}
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        ) : (
          <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <section className="neo-card">
              <h2>Users</h2>
              <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '2px solid #000' }}><th style={{ textAlign: 'left', padding: '10px' }}>Email</th><th style={{ textAlign: 'left', padding: '10px' }}>Role</th><th style={{ textAlign: 'left', padding: '10px' }}>Status</th><th style={{ textAlign: 'left', padding: '10px' }}>Action</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{u.email}</td>
                      <td style={{ padding: '10px' }}>{u.is_admin ? 'Admin' : 'User'}</td>
                      <td style={{ padding: '10px' }}>{u.is_active ? 'Active' : 'Banned'}</td>
                      <td style={{ padding: '10px' }}><button className="neo-button" style={{ padding: '4px 8px', background: u.is_active ? '#ffb3b3' : 'var(--secondary)' }} onClick={() => toggleUserActive(u.id)}>{u.is_active ? 'Ban' : 'Unban'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
    } catch (e) { alert("Auth failed"); }
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
    <Routes>
      <Route path="/admin" element={<AdminLogin onAdminLogin={loginSuccess} />} />
      <Route path="/" element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <UserLogin onLoginSuccess={handleGoogleSuccess} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router><MainApp /></Router>
  );
}
