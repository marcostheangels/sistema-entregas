import { useState, useEffect } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set, onValue, update, remove, query, orderByChild } from 'firebase/database';
import { auth, db } from './firebase';

// Conta fixa do administrador principal (senha NUNCA fica no codigo)
const ADMIN_EMAIL = 'marcostheangels@gmail.com';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setError('Apenas a conta fixa do administrador pode acessar este painel.');
      setLoading(false);
      return;
    }
    try {
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email.trim(), senha);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          // Primeira configuracao: cria a conta fixa do administrador
          cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        } else {
          throw err;
        }
      }
      // Garante o registro de administrador (substitui qualquer registro antigo)
      await set(ref(db, 'admin'), { [cred.user.uid]: true });
    } catch (err) {
      const map = {
        'auth/email-already-in-use': 'Esta conta já existe com outra senha. Restaure a senha correta no Console do Firebase.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
        'auth/user-not-found': 'E-mail ou senha incorretos.',
        'auth/wrong-password': 'E-mail ou senha incorretos.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'PERMISSION_DENIED': 'Operação negada. Publique as regras atualizadas no Console do Firebase.'
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
        <h1>ConectaEntregas Master</h1>
        <p>Painel Super Admin — acesso exclusivo</p>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="E-mail do administrador" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? 'Processando...' : 'ENTRAR'}</button>
        </form>
        {error && <div className="admin-error">{error}</div>}
      </div>
    </div>
  );
}

function PainelAprovacoes({ user }) {
  const [solicitacoes, setSolicitacoes] = useState(null);
  const [grupo, setGrupo] = useState('entregadores'); // 'entregadores' | 'empresas'
  const [aba, setAba] = useState('pendentes'); // 'pendentes' | 'aprovados'
  const [busca, setBusca] = useState('');
  const [entregas, setEntregas] = useState([]);
  const [posicoes, setPosicoes] = useState({});
  const [entregadores, setEntregadores] = useState({});

  useEffect(() => {
    const unsub = onValue(ref(db, 'aprovacoes'), snap => setSolicitacoes(snap.val() || {}));
    return unsub;
  }, []);

  // Dados ao vivo para a visao geral e o monitor de entregas
  useEffect(() => {
    const q = query(ref(db, 'entregas'), orderByChild('criadoEm'));
    const u1 = onValue(q, snap => {
      const list = [];
      snap.forEach(c => list.push({ id: c.key, ...c.val() }));
      setEntregas(list);
    });
    const u2 = onValue(ref(db, 'posicoes'), snap => setPosicoes(snap.val() || {}));
    const u3 = onValue(ref(db, 'entregadores'), snap => setEntregadores(snap.val() || {}));
    return () => { u1(); u2(); u3(); };
  }, []);

  // Metricas do dia
  const inicioDia = new Date().setHours(0, 0, 0, 0);
  const concluidasHoje = entregas.filter(e => e.status === 'entregue' && e.entregueEm && e.entregueEm >= inicioDia);
  const faturamentoHoje = concluidasHoje.reduce((s, e) => s + parseFloat(e.valor || 0), 0);
  const emAndamento = entregas.filter(e => e.status === 'aceite' || e.status === 'em_transito');
  const agora = Date.now();
  const onlineAgora = Object.values(posicoes).filter(p => p.online && agora - (p.timestamp || 0) < 120000).length;
  // Ultimas entregas (mais recentes primeiro)
  const ultimasEntregas = [...entregas].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)).slice(0, 8);
  const nomeEntregador = (e) => e.entregadorNome || entregadores[e.entregadorId]?.nome || '—';

  const lista = Object.entries(solicitacoes || {})
    .map(([id, val]) => ({ id, ...val }))
    .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

  const doGrupo = lista.filter(s => (s.tipo === 'empresa') === (grupo === 'empresas'));
  const pendentes = doGrupo.filter(s => !s.aprovado);
  const aprovadas = doGrupo.filter(s => s.aprovado);
  const termo = busca.trim().toLowerCase();
  const visivel = (aba === 'pendentes' ? pendentes : aprovadas).filter(s =>
    !termo || (s.nome || '').toLowerCase().includes(termo) || (s.email || '').toLowerCase().includes(termo) || (s.placa || '').toLowerCase().includes(termo)
  );
  const totalGrupo = {
    entregadores: lista.filter(s => s.tipo === 'entregador').length,
    empresas: lista.filter(s => s.tipo === 'empresa').length
  };

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
      window.alert('Erro no reset: ' + e.message + (String(e.message).includes('PERMISSION_DENIED') ? '\n\nProvável causa: as regras atualizadas não foram publicadas no Console do Firebase (Rules), ou você não está logado com a conta fixa do administrador.' : ''));
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
      window.alert('Erro no reset: ' + e.message + (String(e.message).includes('PERMISSION_DENIED') ? '\n\nProvável causa: as regras atualizadas não foram publicadas no Console do Firebase (Rules), ou você não está logado com a conta fixa do administrador.' : ''));
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
            <h1>ConectaEntregas Master</h1>
            <p>{user.email}</p>
          </div>
        </div>
        <button className="admin-btn-sair" onClick={() => signOut(auth)}>SAIR</button>
      </header>

      <div className="admin-stats admin-visao">
        <div className="admin-stat">
          <h3>✅ Concluídas hoje</h3>
          <p>{concluidasHoje.length}</p>
        </div>
        <div className="admin-stat">
          <h3>💰 Faturamento hoje</h3>
          <p style={{fontSize: '1.15rem', color: '#10b981'}}>R$ {faturamentoHoje.toFixed(2)}</p>
        </div>
        <div className="admin-stat">
          <h3>🚚 Em andamento</h3>
          <p>{emAndamento.length}</p>
        </div>
        <div className="admin-stat">
          <h3>📡 Online agora</h3>
          <p style={{color: '#10b981'}}>{onlineAgora}</p>
        </div>
      </div>

      <div className="admin-stats admin-grupos">
        <button className={`admin-stat admin-grupo ${grupo === 'entregadores' ? 'active' : ''}`} onClick={() => setGrupo('entregadores')}>
          <h3>🛵 ENTREGADORES</h3>
          <p>{totalGrupo.entregadores}</p>
        </button>
        <button className={`admin-stat admin-grupo ${grupo === 'empresas' ? 'active' : ''}`} onClick={() => setGrupo('empresas')}>
          <h3>🏢 EMPRESAS</h3>
          <p>{totalGrupo.empresas}</p>
        </button>
      </div>

      <div className="admin-stats">
        <button className={`admin-stat ${aba === 'pendentes' ? 'active' : ''}`} onClick={() => setAba('pendentes')}>
          <h3>⏳ Pendentes</h3>
          <p>{pendentes.length}</p>
        </button>
        <button className={`admin-stat ${aba === 'aprovados' ? 'active' : ''}`} onClick={() => setAba('aprovados')}>
          <h3>✅ Aprovados</h3>
          <p>{aprovadas.length}</p>
        </button>
      </div>

      <div className="admin-busca">
        <input
          type="text"
          placeholder="🔍 Buscar por nome, e-mail ou placa..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {busca && <button onClick={() => setBusca('')}>✕</button>}
      </div>

      <div className="admin-lista">
        {visivel.length === 0 && (
          <div className="admin-vazio">
            {termo
              ? 'Nenhum resultado para a busca.'
              : (aba === 'pendentes'
                ? `Nenhum ${grupo === 'empresas' ? 'empresa aguardando' : 'entregador aguardando'} aprovação.`
                : `Nenhum cadastro aprovado neste grupo ainda.`)}
          </div>
        )}
        {visivel.map(s => (
          <div key={s.id} className="admin-item">
            <div className="admin-item-badge">
              {s.aprovado ? <span className="badge-status aprovado">APROVADO</span> : <span className="badge-status pendente">AGUARDANDO</span>}
              {grupo === 'entregadores' && entregadores[s.id]?.bloqueado && <span className="badge-status suspenso">SUSPENSO</span>}
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
                <>
                  {grupo === 'entregadores' && (
                    entregadores[s.id]?.bloqueado ? (
                      <button className="admin-btn aprovar" onClick={() => update(ref(db, `entregadores/${s.id}`), { bloqueado: false })}>REATIVAR</button>
                    ) : (
                      <button className="admin-btn revogar" onClick={() => { if (window.confirm(`Suspender ${s.nome || s.email}? Ele ficará offline e sem receber pedidos.`)) update(ref(db, `entregadores/${s.id}`), { bloqueado: true }); }}>SUSPENDER</button>
                    )
                  )}
                  <button className="admin-btn revogar" onClick={() => revogar(s.id)}>REVOGAR</button>
                </>
              )}
              <button className="admin-btn excluir" onClick={() => excluir(s.id)}>EXCLUIR</button>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-monitor">
        <h4>📈 Últimas entregas</h4>
        {ultimasEntregas.length === 0 ? (
          <div className="admin-vazio">Nenhuma entrega registrada ainda.</div>
        ) : (
          <div className="admin-entregas">
            {ultimasEntregas.map(e => (
              <div key={e.id} className="admin-entrega-item">
                <span className={`ent-status ${e.status}`}>{
                  { pendente: '⏳ PENDENTE', aceite: '🛵 ACEITA', em_transito: '🚚 EM ROTA', entregue: '✅ ENTREGUE' }[e.status] || e.status
                }</span>
                <span className="ent-info">
                  <strong>{e.empresaNome || 'Empresa'}</strong> → {nomeEntregador(e)}
                  <small>{e.destino || ''} {e.criadoEm ? `• ${new Date(e.criadoEm).toLocaleString('pt-BR')}` : ''}</small>
                </span>
                <span className="ent-valor">R$ {parseFloat(e.valor || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-manutencao">
        <h4>⚠️ Zona de Manutenção</h4>
        <p>Apaga permanentemente os dados do grupo selecionado. Use com cuidado!</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {grupo === 'entregadores' ? (
            <button className="admin-btn reset" disabled={resetando !== ''} onClick={resetarEntregadores}>
              {resetando === 'entregadores' ? 'RESETANDO...' : '🔄 RESETAR ENTREGADORES'}
            </button>
          ) : (
            <button className="admin-btn reset" disabled={resetando !== ''} onClick={resetarEmpresas}>
              {resetando === 'empresas' ? 'RESETANDO...' : '🔄 RESETAR EMPRESAS'}
            </button>
          )}
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

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  if (initializing) {
    return <div className="admin-loading">Carregando...</div>;
  }

  return (
    <div className="admin-app">
      <GatedContent user={user} />
    </div>
  );
}

function GatedContent({ user }) {
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    if (user.email?.toLowerCase() === ADMIN_EMAIL) {
      // Conta fixa: garante o registro de administrador e substitui registros antigos
      set(ref(db, 'admin'), { [user.uid]: true })
        .then(() => setIsAdmin(true))
        .catch(() => setIsAdmin(false));
      return;
    }
    get(ref(db, `admin/${user.uid}`)).then(s => setIsAdmin(s.val() === true)).catch(() => setIsAdmin(false));
  }, [user]);

  if (!user) return <LoginScreen />;
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
