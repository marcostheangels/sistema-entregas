import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set } from 'firebase/database';
import { db } from './firebase';
import Dashboard from './Dashboard';
import './App.css';

function AguardandoAprovacao({ user, onSair }) {
  return (
    <div className="login-container">
      <div className="login-card" style={{textAlign: 'center'}}>
        <div style={{fontSize:'3rem', marginBottom:'1rem'}}>⏳</div>
        <h1>Cadastro em análise</h1>
        <p style={{marginTop:'10px'}}>Sua conta <strong>{user.email}</strong> foi criada e está aguardando a aprovação do administrador do sistema.</p>
        <p style={{marginTop:'10px', fontSize:'0.85rem', color:'#64748b'}}>Você será liberado em breve. Tente entrar novamente mais tarde.</p>
        <button onClick={onSair} style={{marginTop:'20px', padding:'10px 24px', borderRadius:'8px', border:'none', background:'#334155', color:'white', fontWeight:700, cursor:'pointer'}}>SAIR</button>
      </div>
    </div>
  );
}

function Login({ onAuth }) {
  const [isCadastro, setIsCadastro] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      if (isCadastro) {
        if (!nome.trim()) { setErro('Informe o nome da empresa.'); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        await set(ref(db, `empresas/${cred.user.uid}`), {
          nome: nome.trim(), email,
          telefone: telefone.replace(/\D/g, ''),
          endereco, createdAt: Date.now()
        });
        await set(ref(db, `aprovacoes/${cred.user.uid}`), {
          tipo: 'empresa', nome: nome.trim(), email,
          aprovado: false, criadoPor: cred.user.uid, criadoEm: Date.now()
        });
        onAuth(cred.user);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, senha);
        onAuth(cred.user);
      }
    } catch (err) {
      const map = {
        'auth/email-already-in-use': 'Este e-mail já está em uso.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
        'auth/user-not-found': 'E-mail ou senha incorretos.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.'
      };
      setErro(map[err.code] || 'Erro ao entrar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{fontSize:'3rem', marginBottom:'1rem'}}>🏢</div>
        <h1>Painel de Logística</h1>
        <p>{isCadastro ? 'Cadastre sua empresa (sujeito à aprovação)' : 'Acesse o gerenciamento de entregas'}</p>
        <form onSubmit={handleSubmit}>
          {isCadastro && (
            <>
              <input type="text" placeholder="Nome da Empresa *" value={nome} onChange={e=>setNome(e.target.value)} required />
              <input type="tel" placeholder="Telefone (WhatsApp) *" value={telefone} onChange={e=>setTelefone(e.target.value)} required />
              <input type="text" placeholder="Endereço" value={endereco} onChange={e=>setEndereco(e.target.value)} />
            </>
          )}
          <input type="email" placeholder="E-mail da Empresa" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input type="password" placeholder="Senha" value={senha} onChange={e=>setSenha(e.target.value)} required />
          <button type="submit" disabled={loading}>
            {loading ? "Processando..." : (isCadastro ? "ENVIAR CADASTRO" : "ACESSAR PAINEL")}
          </button>
        </form>
        {erro && <div style={{color:'#ef4444', fontSize:'0.8rem', marginTop:'10px'}}>{erro}</div>}
        <div onClick={() => setIsCadastro(!isCadastro)} style={{marginTop:'16px', fontSize:'0.85rem', color:'#6366f1', cursor:'pointer', fontWeight:600}}>
          {isCadastro ? 'Já possui conta? Fazer login' : 'Sua empresa ainda não tem conta? Cadastre-se'}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [aprovado, setAprovado] = useState(null); // null = sem registro (antigo) | true | false

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) { setAprovado(null); setInitializing(false); return; }
      // Verifica aprovação do administrador (cadastros antigos sem registro passam direto)
      get(ref(db, `aprovacoes/${u.uid}`)).then(s => {
        if (s.exists()) setAprovado(s.val().aprovado === true);
        else setAprovado(null);
        setInitializing(false);
      }).catch(() => { setAprovado(null); setInitializing(false); });
    });
  }, []);

  if (initializing) return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Iniciando...</div>;

  if (user && aprovado === false) return <AguardandoAprovacao user={user} onSair={() => signOut(auth)} />;

  return user ? <Dashboard user={user} /> : <Login onAuth={setUser} />;
}

export default App;
