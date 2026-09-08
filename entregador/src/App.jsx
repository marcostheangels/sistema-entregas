import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, db } from './firebase';
import Auth from './Auth';
import Dashboard from './Dashboard';
import 'leaflet/dist/leaflet.css';
import './App.css';

function AguardandoAprovacao({ user }) {
  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade" style={{textAlign: 'center'}}>
        <div className="auth-header">
          <div className="auth-logo">⏳</div>
          <h1 className="auth-title">Cadastro em análise</h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8}}>
            Sua conta <strong>{user.email}</strong> está aguardando a aprovação do administrador.
          </p>
          <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 12}}>
            Tente entrar novamente mais tarde.
          </p>
        </div>
        <button
          className="btn-primary"
          style={{marginTop: 20}}
          onClick={() => signOut(auth)}
        >
          SAIR
        </button>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aprovado, setAprovado] = useState(null); // null = sem registro (antigo) | true | false

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) { setAprovado(null); setLoading(false); return; }
      // Verifica aprovação do administrador (cadastros antigos sem registro passam direto)
      get(ref(db, `aprovacoes/${u.uid}`)).then(s => {
        if (s.exists()) setAprovado(s.val().aprovado === true);
        else setAprovado(null);
        setLoading(false);
      }).catch(() => { setAprovado(null); setLoading(false); });
    });
    return unsub;
  }, []);

  if (loading) return <div className="loading">Carregando...</div>;

  if (user && aprovado === false) return <AguardandoAprovacao user={user} />;

  return user ? <Dashboard user={user} /> : <Auth onAuth={setUser} />;
}

export default App;
