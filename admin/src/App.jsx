import { useState, useEffect } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set, onValue, update, remove } from 'firebase/database';
import { auth, db } from './firebase';

function LoginScreen({ adminExists }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!adminExists) {
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        // Primeiro acesso: reivindica o posto de administrador
        await set(ref(db, `admin/${cred.user.uid}`), true);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, senha);
        const s = await get(ref(db, `admin/${cred.user.uid}`));
        if (s.val() !== true) {
          await signOut(auth);
          setError('Esta conta não é o administrador do sistema.');
        }
      }
    } catch (err) {
      const map = {
        'auth/email-already-in-use': 'Este e-mail já está em uso.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
        'auth/user-not-found': 'E-mail ou senha incorretos.',
        'auth/wrong-password': 'E-mail ou senha incorretos.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'PERMISSION_DENIED': 'Operação negada: já existe um administrador.'
      };
      setError(map[err.code] || 'Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <div className="admin-logo">🛡️</div>
        <h1>Administração</h1>
        <p>{adminExists ? 'Acesso restrito do administrador' : 'Primeiro acesso — crie a conta do administrador'}</p>
        {!adminExists && <div className="admin-notice">A primeira conta criada aqui se tornará o administrador do sistema. Guarde bem este e-mail e senha!</div>}
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="E-mail do administrador" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? 'Processando...' : (adminExists ? 'ENTRAR' : 'CRIAR CONTA DE ADMINISTRADOR')}</button>
        </form>
        {error && <div className="admin-error">{error}</div>}
      </div>
    </div>
  );
}

function PainelAprovacoes({ user }) {
  const [solicitacoes, setSolicitacoes] = useState(null);
  const [aba, setAba] = useState('pendentes');

  useEffect(() => {
    const unsub = onValue(ref(db, 'aprovacoes'), snap => setSolicitacoes(snap.val() || {}));
    return unsub;
  }, []);

  const lista = Object.entries(solicitacoes || {})
    .map(([id, val]) => ({ id, ...val }))
    .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

  const pendentes = lista.filter(s => !s.aprovado);
  const aprovadas = lista.filter(s => s.aprovado);
  const visivel = aba === 'pendentes' ? pendentes : aprovadas;

  const aprovar = (id) => update(ref(db, `aprovacoes/${id}`), { aprovado: true, aprovadoEm: Date.now() });
  const revogar = (id) => update(ref(db, `aprovacoes/${id}`), { aprovado: false, aprovadoEm: null });
  const excluir = (id) => { if (window.confirm('Excluir esta solicitação? O cadastro ficará bloqueado até nova solicitação.')) remove(ref(db, `aprovacoes/${id}`)); };

  return (
    <div className="admin-painel">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-brand-icon">🛡️</span>
          <div>
            <h1>Central de Aprovações</h1>
            <p>{user.email}</p>
          </div>
        </div>
        <button className="admin-btn-sair" onClick={() => signOut(auth)}>SAIR</button>
      </header>

      <div className="admin-stats">
        <button className={`admin-stat ${aba === 'pendentes' ? 'active' : ''}`} onClick={() => setAba('pendentes')}>
          <h3>⏳ Pendentes</h3>
          <p>{pendentes.length}</p>
        </button>
        <button className={`admin-stat ${aba === 'aprovadas' ? 'active' : ''}`} onClick={() => setAba('aprovadas')}>
          <h3>✅ Aprovados</h3>
          <p>{aprovadas.length}</p>
        </button>
      </div>

      <div className="admin-lista">
        {visivel.length === 0 && (
          <div className="admin-vazio">{aba === 'pendentes' ? 'Nenhuma solicitação aguardando aprovação.' : 'Nenhum cadastro aprovado ainda.'}</div>
        )}
        {visivel.map(s => (
          <div key={s.id} className="admin-item">
            <div className="admin-item-badge">
              <span className={`badge-tipo ${s.tipo}`}>{s.tipo === 'empresa' ? '🏢 EMPRESA' : '🛵 ENTREGADOR'}</span>
              {s.aprovado ? <span className="badge-status aprovado">APROVADO</span> : <span className="badge-status pendente">AGUARDANDO</span>}
            </div>
            <div className="admin-item-info">
              <div className="admin-item-nome">{s.nome || 'Sem nome'}</div>
              <div className="admin-item-email">{s.email}</div>
              <div className="admin-item-data">Solicitado em {s.criadoEm ? new Date(s.criadoEm).toLocaleString('pt-BR') : '--'}</div>
            </div>
            <div className="admin-item-acoes">
              {!s.aprovado ? (
                <button className="admin-btn aprovar" onClick={() => aprovar(s.id)}>APROVAR</button>
              ) : (
                <button className="admin-btn revogar" onClick={() => revogar(s.id)}>REVOGAR</button>
              )}
              <button className="admin-btn excluir" onClick={() => excluir(s.id)}>EXCLUIR</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [adminExists, setAdminExists] = useState(null);

  useEffect(() => {
    get(ref(db, 'admin')).then(s => setAdminExists(s.exists())).catch(() => setAdminExists(false));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  if (initializing || adminExists === null) {
    return <div className="admin-loading">Carregando...</div>;
  }

  return (
    <div className="admin-app">
      <GatedContent user={user} adminExists={adminExists} />
    </div>
  );
}

function GatedContent({ user, adminExists }) {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    get(ref(db, `admin/${user.uid}`)).then(s => setIsAdmin(s.val() === true)).catch(() => setIsAdmin(false));
  }, [user]);

  if (!user) return <LoginScreen adminExists={adminExists} />;
  if (isAdmin === null) return <div className="admin-loading">Verificando permissões...</div>;
  if (!isAdmin) {
    return (
      <div className="admin-login-wrap">
        <div className="admin-login-card">
          <div className="admin-logo">⛔</div>
          <h1>Acesso negado</h1>
          <p>Esta conta não é o administrador do sistema.</p>
          <button onClick={() => signOut(auth)}>SAIR</button>
        </div>
      </div>
    );
  }
  return <PainelAprovacoes user={user} />;
}
