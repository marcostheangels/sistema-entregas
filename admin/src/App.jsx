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

  const aprovar = async (id) => {
    const s = lista.find(x => x.id === id);
    await update(ref(db, `aprovacoes/${id}`), { aprovado: true, aprovadoEm: Date.now() });
    // Cria/atualiza o perfil do aprovado automaticamente com os dados do cadastro
    try {
      if (s?.tipo === 'entregador') {
        const snap = await get(ref(db, `entregadores/${id}`));
        const p = snap.val() || {};
        await update(ref(db, `entregadores/${id}`), {
          nome: s.nome || p.nome || '',
          email: s.email || p.email || '',
          telefone: s.telefone || p.telefone || '',
          cpf: s.cpf || p.cpf || '',
          veiculo: s.veiculo || p.veiculo || '',
          placa: s.placa || p.placa || '',
          endereco: s.endereco || p.endereco || '',
          status: p.status || 'disponivel',
          createdAt: p.createdAt || Date.now()
        });
      } else if (s?.tipo === 'empresa') {
        const snap = await get(ref(db, `empresas/${id}`));
        const p = snap.val() || {};
        await update(ref(db, `empresas/${id}`), {
          nome: s.nome || p.nome || '',
          email: s.email || p.email || '',
          telefone: s.telefone || p.telefone || '',
          endereco: s.endereco || p.endereco || '',
          createdAt: p.createdAt || Date.now()
        });
      }
    } catch (e) {
      window.alert('Aprovado, mas houve erro ao sincronizar o perfil: ' + e.message);
    }
  };
  const revogar = (id) => update(ref(db, `aprovacoes/${id}`), { aprovado: false, aprovadoEm: null });
  const excluir = (id) => { if (window.confirm('Excluir esta solicitação? O cadastro ficará bloqueado até nova solicitação.')) remove(ref(db, `aprovacoes/${id}`)); };

  // ---- Dados completos do cadastro ----
  const [detalhes, setDetalhes] = useState(null); // { tipo, nome, dados }
  const verDados = async (s) => {
    const no = s.tipo === 'empresa' ? 'empresas' : 'entregadores';
    try {
      const snap = await get(ref(db, `${no}/${s.id}`));
      setDetalhes({ tipo: s.tipo, nome: s.nome, dados: snap.val() || { '(aviso)': 'Perfil não encontrado no banco (talvez já tenha sido resetado).' } });
    } catch (e) {
      setDetalhes({ tipo: s.tipo, nome: s.nome, dados: { '(erro)': e.message } });
    }
  };

  // ---- Reset geral ----
  const [resetando, setResetando] = useState('');
  const resetarAprovacoes = async (tipo) => {
    const snap = await get(ref(db, 'aprovacoes'));
    const removidos = [];
    snap.forEach(c => { if (c.val()?.tipo === tipo) removidos.push(c.key); });
    for (const id of removidos) await remove(ref(db, `aprovacoes/${id}`));
    return removidos.length;
  };

  const resetarEntregadores = async () => {
    const msg = 'RESETAR TODOS OS ENTREGADORES?\n\nSerão apagados permanentemente:\n- Todos os perfis de entregadores\n- Todas as posições/rastreamentos\n- Todas as mensagens\n- As solicitações de aprovação de entregadores\n\nNão dá para desfazer!';
    if (!window.confirm(msg)) return;
    setResetando('entregadores');
    try {
      await remove(ref(db, 'entregadores'));
      await remove(ref(db, 'posicoes'));
      await remove(ref(db, 'mensagens'));
      const n = await resetarAprovacoes('entregador');
      window.alert(`Entregadores resetados! ${n} solicitação(ões) de aprovação removida(s).`);
    } catch (e) {
      window.alert('Erro no reset: ' + e.message);
    } finally {
      setResetando('');
    }
  };

  const resetarEmpresas = async () => {
    const msg = 'RESETAR TODAS AS EMPRESAS?\n\nSerão apagados permanentemente:\n- Todos os perfis de empresas\n- Todas as entregas\n- Todas as mensagens\n- As solicitações de aprovação de empresas\n\nNão dá para desfazer!';
    if (!window.confirm(msg)) return;
    setResetando('empresas');
    try {
      await remove(ref(db, 'empresas'));
      await remove(ref(db, 'entregas'));
      await remove(ref(db, 'mensagens'));
      const n = await resetarAprovacoes('empresa');
      window.alert(`Empresas resetadas! ${n} solicitação(ões) de aprovação removida(s).`);
    } catch (e) {
      window.alert('Erro no reset: ' + e.message);
    } finally {
      setResetando('');
    }
  };

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
              <button className="admin-btn dados" onClick={() => verDados(s)}>VER DADOS</button>
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

      <div className="admin-manutencao">
        <h4>⚠️ Zona de Manutenção</h4>
        <p>Apaga permanentemente os dados do banco. Use com cuidado!</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="admin-btn reset" disabled={resetando !== ''} onClick={resetarEntregadores}>
            {resetando === 'entregadores' ? 'RESETANDO...' : '🔄 RESETAR ENTREGADORES'}
          </button>
          <button className="admin-btn reset" disabled={resetando !== ''} onClick={resetarEmpresas}>
            {resetando === 'empresas' ? 'RESETANDO...' : '🔄 RESETAR EMPRESAS'}
          </button>
        </div>
      </div>

      {detalhes && (
        <div className="admin-modal-fundo" onClick={() => setDetalhes(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>{detalhes.tipo === 'empresa' ? '🏢' : '🛵'} {detalhes.nome || 'Cadastro'}</h3>
              <button className="admin-btn excluir" onClick={() => setDetalhes(null)}>FECHAR</button>
            </div>
            <div className="admin-dados">
              {Object.entries(detalhes.dados || {}).map(([chave, valor]) => (
                <div key={chave} className="admin-dado-linha">
                  <span className="admin-dado-chave">{chave}</span>
                  <span className="admin-dado-valor">{typeof valor === 'object' && valor !== null ? JSON.stringify(valor) : String(valor)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
