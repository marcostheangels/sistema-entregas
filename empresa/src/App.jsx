import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import Dashboard from './Dashboard';
import './App.css';

function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (err) {
      alert("Erro ao entrar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{fontSize:'3rem', marginBottom:'1rem'}}>🏢</div>
        <h1>Painel de Logística</h1>
        <p>Acesse o gerenciamento de entregas</p>
        <form onSubmit={handleLogin}>
          <input type="email" placeholder="E-mail da Empresa" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input type="password" placeholder="Senha" value={senha} onChange={e=>setSenha(e.target.value)} required />
          <button type="submit" disabled={loading}>
            {loading ? "Verificando..." : "ACESSAR PAINEL"}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  if (initializing) return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Iniciando...</div>;

  return user ? <Dashboard user={user} /> : <Login />;
}

export default App;
