import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set, onValue, update, remove } from 'firebase/database';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { auth, db } from './firebase';

// Conta fixa do administrador principal (senha NUNCA fica no codigo)
const ADMIN_EMAIL = 'marcostheangels@gmail.com';
// Versao atual do APK do entregador (atualize junto com entregador/src/App.jsx)
const APP_VERSAO_ENTREGADOR = '1.4.11';

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
        <div className="admin-logo"><img src={`${import.meta.env.BASE_URL}logo-192.png`} alt="ConectaEntregas" /></div>
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

// ===== MAPA + RELATORIO EM TEMPO REAL DOS ENTREGADORES (somente admin) =====
// Cores das motinhas: cada entregador tem sempre a mesma cor (definida pelo id dele)
const PALETA_MOTOS = ['#10b981', '#6366f1', '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444', '#f97316', '#14b8a6', '#3b82f6', '#eab308', '#a3e635'];
const corDaMoto = (id) => PALETA_MOTOS[String(id).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % PALETA_MOTOS.length];

function MapaTempoReal({ posicoes, entregas, entregadores }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const marcadoresRef = useRef({});
  const centralizadoRef = useRef(false);

  const agora = Date.now();
  const ativos = Object.entries(posicoes || {})
    .filter(([, p]) => p && p.online && agora - (p.timestamp || 0) < 120000 && typeof p.lat === 'number' && typeof p.lng === 'number')
    .map(([id, p]) => ({
      id, p,
      perfil: entregadores[id] || {},
      entrega: entregas.find(e => e.entregadorId === id && !['pendente', 'entregue', 'cancelado'].includes(e.status)) || null
    }));

  useEffect(() => {
    if (mapRef.current || !divRef.current) return;
    const map = L.map(divRef.current, { attributionControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    map.setView([-16.735, -43.862], 12);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      marcadoresRef.current = {};
      centralizadoRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ids = new Set(ativos.map(a => a.id));
    Object.entries(marcadoresRef.current).forEach(([id, m]) => {
      if (!ids.has(id)) { m.remove(); delete marcadoresRef.current[id]; }
    });
    ativos.forEach(a => {
      const cor = corDaMoto(a.id);
      const html = `<div style="width:34px;height:34px;border-radius:50%;background:${cor};display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 3px 8px rgba(0,0,0,0.35);border:2.5px solid white;position:relative;">🛵${a.entrega ? '<span style="position:absolute;bottom:-5px;right:-7px;font-size:14px;">📦</span>' : ''}</div>`;
      const icone = L.divIcon({ html, className: '', iconSize: [34, 34], iconAnchor: [17, 17] });
      const popup = `<b>${a.perfil.nome || 'Entregador'}</b><br/>📞 ${a.perfil.telefone || '—'}<br/>🛵 ${a.perfil.veiculo || '—'}${a.perfil.placa ? ' · ' + a.perfil.placa : ''}<br/><b>${a.entrega ? `📦 Pedido ${a.entrega.codigo ? '#' + a.entrega.codigo : ''} — ${a.entrega.empresaNome || 'Empresa'}` : '🟢 Livre — aguardando pedido'}</b>${a.entrega ? `<br/>🏢 Coleta: ${a.entrega.origem || '—'}<br/>🏠 Entrega: ${a.entrega.destino || '—'}${a.entrega.valor ? `<br/>💰 R$ ${Number(a.entrega.valor).toFixed(2)}` : ''}<br/>🚦 ${a.entrega.status === 'em_transito' ? 'Levando o pedido' : 'Buscando o pedido'}` : ''}`;
      const existente = marcadoresRef.current[a.id];
      if (existente) {
        existente.setLatLng([a.p.lat, a.p.lng]);
        existente.setIcon(icone);
        existente.setPopupContent(popup);
      } else {
        marcadoresRef.current[a.id] = L.marker([a.p.lat, a.p.lng], { icon: icone }).addTo(map).bindPopup(popup);
      }
    });
    // Centraliza so uma vez (no primeiro entregador detectado) sem perseguir o mapa
    if (!centralizadoRef.current && ativos.length > 0) {
      centralizadoRef.current = true;
      map.setView([ativos[0].p.lat, ativos[0].p.lng], 13);
    }
  });

  return (
    <div className="admin-mapa-section">
      <h4>🗺️ Mapa em tempo real — {ativos.length} entregador(es) online</h4>
      <div className="admin-mapa-flex">
        <div ref={divRef} className="admin-mapa" />
        <div className="admin-relatorio">
          {ativos.length === 0 && <div className="admin-vazio">Nenhum entregador online agora.</div>}
          {ativos.map(a => (
            <div key={a.id} className="admin-rel-item">
              <span className={`rel-ponto ${a.entrega ? 'ocupado' : 'livre'}`} style={{background: corDaMoto(a.id)}} />
              <div className="rel-info">
                <strong>{a.perfil.nome || 'Entregador'}</strong>
                <small>📞 {a.perfil.telefone || '—'} · 🛵 {a.perfil.veiculo || '—'}{a.perfil.placa ? ` · ${a.perfil.placa}` : ''}</small>
                {a.entrega ? (
                  <small className="rel-status ocupado">
                    📦 {a.entrega.codigo ? `#${a.entrega.codigo} · ` : ''}{a.entrega.empresaNome || 'Empresa'} · {a.entrega.status === 'em_transito' ? 'levando' : 'buscando'}<br/>
                    🏢 {a.entrega.origem || '—'}<br/>
                    🏠 {a.entrega.destino || '—'}{a.entrega.valor ? <><br/>💰 R$ {Number(a.entrega.valor).toFixed(2)}</> : null}
                  </small>
                ) : (
                  <small className="rel-status livre">🟢 Livre — aguardando pedido</small>
                )}
              </div>
            </div>
          ))}
        </div>
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
  const [presenca, setPresenca] = useState({});

  useEffect(() => {
    const unsub = onValue(ref(db, 'aprovacoes'), snap => setSolicitacoes(snap.val() || {}));
    return unsub;
  }, []);

  // Dados ao vivo para a visao geral e o monitor de entregas
  // (leitura DIRETA sem orderBy: as regras do Firebase negam query com orderByChild
  //  fora de status/entregadorId/empresaId — ordenamos aqui no cliente)
  useEffect(() => {
    let cancelado = false;
    const u1 = onValue(ref(db, 'entregas'), snap => {
      const list = [];
      snap.forEach(c => list.push({ id: c.key, ...c.val() }));
      list.sort((a, b) => (a.createdAt || a.criadoEm || 0) - (b.createdAt || b.criadoEm || 0));
      if (!cancelado) setEntregas(list);
    }, err => { console.error('[Master] erro entregas:', err); });
    const u2 = onValue(ref(db, 'posicoes'), snap => setPosicoes(snap.val() || {}), () => {});
    const u3 = onValue(ref(db, 'entregadores'), snap => setEntregadores(snap.val() || {}), () => {});
    const u4 = onValue(ref(db, 'presenca'), snap => setPresenca(snap.val() || {}), () => {});
    return () => { cancelado = true; u1(); u2(); u3(); u4(); };
  }, []);

  // Tick para expirar presencas antigas sem novas gravacoes
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Metricas do dia
  const inicioDia = new Date().setHours(0, 0, 0, 0);
  const concluidasHoje = entregas.filter(e => e.status === 'entregue' && e.entregueEm && e.entregueEm >= inicioDia);
  const faturamentoHoje = concluidasHoje.reduce((s, e) => s + parseFloat(e.valor || 0), 0);
  const emAndamento = entregas.filter(e => e.status === 'aceite' || e.status === 'em_transito');
  const agora = Date.now();
  const onlineAgora = Object.values(posicoes).filter(p => p.online && agora - (p.timestamp || 0) < 120000).length;
  // Empresas usando o painel agora (presenca com aviso recente)
  const empresasOnline = Object.entries(presenca).filter(([, p]) => p && p.online && agora - (p.ultimoAviso || 0) < 90000);
  const nomeEmpresaOnline = (id) => solicitacoes?.[id]?.nome || presenca[id]?.email || 'Empresa';
  // Ultimas entregas (mais recentes primeiro; criadas com "createdAt")
  const ultimasEntregas = [...entregas].sort((a, b) => (b.createdAt || b.criadoEm || 0) - (a.createdAt || a.criadoEm || 0)).slice(0, 8);
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

  // ===== BACKUP / RESTAURACAO / LIMPEZA TOTAL (somente admin) =====
  // Taxa da plataforma (config global) + faturamento do sistema
  const [configTaxa, setConfigTaxa] = useState({ porEntrega: 0, percentual: 0 });
  const [taxaMsg, setTaxaMsg] = useState('');
  useEffect(() => {
    const u = onValue(ref(db, 'config/taxa'), snap => setConfigTaxa(snap.val() || { porEntrega: 0, percentual: 0 }));
    return u;
  }, []);

  const salvarTaxa = async () => {
    try {
      await set(ref(db, 'config/taxa'), {
        porEntrega: parseFloat(configTaxa.porEntrega) || 0,
        percentual: parseFloat(configTaxa.percentual) || 0
      });
      setTaxaMsg('✅ Taxa salva — vale para as próximas entregas.');
      setTimeout(() => setTaxaMsg(''), 4000);
    } catch (e) { setTaxaMsg('❌ ' + e.message); }
  };

  const taxaNova = (e) => Math.round((((configTaxa.porEntrega || 0)) + (parseFloat(e.valor || 0)) * ((configTaxa.percentual || 0) / 100)) * 100) / 100;
  // Receita da plataforma: prioriza a taxa gravada na entrega; antigas sem taxa usam a atual
  const taxaDe = (e) => (e.taxaPlataforma != null ? parseFloat(e.taxaPlataforma) : taxaNova(e));
  const liquidoDe = (e) => (parseFloat(e.valor || 0)) - taxaDe(e);
  const receitaHoje = concluidasHoje.reduce((s, e) => s + taxaDe(e), 0);
  const concluidasTotal = entregas.filter(e => e.status === 'entregue');
  const receitaTotal = concluidasTotal.reduce((s, e) => s + taxaDe(e), 0);
  const aRepassarTotal = concluidasTotal.reduce((s, e) => s + liquidoDe(e), 0);

  // ===== VERSAO MINIMA OBRIGATORIA DO APP DO ENTREGADOR =====
  const [versaoMinima, setVersaoMinima] = useState('');
  const [versaoMsg, setVersaoMsg] = useState('');
  useEffect(() => {
    const u = onValue(ref(db, 'config/versaoMinima'), snap => setVersaoMinima(snap.val()?.app || ''));
    return u;
  }, []);

  const salvarVersao = async () => {
    const v = versaoMinima.trim();
    if (v && !/^\d+\.\d+(\.\d+)?$/.test(v)) { setVersaoMsg('❌ Use o formato 1.1 ou 1.1.0'); return; }
    try {
      await set(ref(db, 'config/versaoMinima'), v ? { app: v, at: Date.now() } : null);
      setVersaoMsg(v ? `✅ Mínima ${v} — apps antigos bloqueiam na próxima abertura.` : '✅ Bloqueio desativado.');
      setTimeout(() => setVersaoMsg(''), 4000);
    } catch (e) { setVersaoMsg('❌ ' + e.message); }
  };

  const [backupMsg, setBackupMsg] = useState('');

  const fazerBackup = async () => {
    try {
      const snap = await get(ref(db, '/'));
      const dados = snap.val() || {};
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      a.href = url;
      a.download = `backup-conectaentregas-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg('✅ Backup baixado. Guarde o arquivo em lugar seguro!');
    } catch (e) {
      setBackupMsg('❌ Erro no backup: ' + e.message);
    }
  };

  const restaurarBackup = (arquivo) => {
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = async () => {
      try {
        const dados = JSON.parse(leitor.result);
        if (!dados || typeof dados !== 'object' || !dados.admin) throw new Error('Arquivo inválido (não parece um backup deste sistema).');
        if (!window.confirm('RESTAURAR ESTE BACKUP?\n\nTUDO que está no banco agora será SUBSTITUÍDO pelo conteúdo do arquivo.\n\nNão dá para desfazer!')) return;
        await set(ref(db, '/'), dados);
        setBackupMsg('✅ Backup restaurado com sucesso!');
      } catch (e) {
        setBackupMsg('❌ Erro ao restaurar: ' + e.message);
      }
    };
    leitor.readAsText(arquivo);
  };

  const apagarTudo = async () => {
    if (!window.confirm('APAGAR TUDO?\n\nSerão removidos TODOS os entregadores, empresas, entregas, chats, posições e aprovações.\n\nApenas o seu acesso de administrador é mantido.\n\nDica: faça um BACKUP antes!')) return;
    if (!window.confirm('TEM CERTEZA ABSOLUTA?\n\nEsta ação é FINAL e apaga todos os dados agora.')) return;
    try {
      const snap = await get(ref(db, 'admin'));
      await set(ref(db, '/'), { admin: snap.val() || {} });
      setBackupMsg('🧹 Banco limpo! Tudo em branco — só o acesso admin foi mantido.');
    } catch (e) {
      setBackupMsg('❌ Erro ao apagar: ' + e.message);
    }
  };

  const aprovar = async (id) => {
    const s = lista.find(x => x.id === id);
    await remove(ref(db, `recusados/${id}`)).catch(() => {});
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
  // Excluir = remocao TOTAL do sistema: aprovacao + perfil + GPS + presenca + chats.
  // Marca em "recusados" para o app NAO recriar a solicitacao.
  const excluir = async (id) => {
    const s = solicitacoes?.[id] || {};
    const tipo = s.tipo || 'entregador';
    if (!window.confirm(`Excluir ${tipo === 'empresa' ? 'a empresa' : 'o entregador'} ${s.nome || s.email || ''}?\n\nSerão apagados: cadastro, perfil, localização e chats.\nLembre-se: a conta de LOGIN só é apagada no Firebase Console > Authentication.`)) return;
    try {
      await set(ref(db, `recusados/${id}`), { email: s.email || '', nome: s.nome || '', ts: Date.now() }).catch(() => {});
      await remove(ref(db, `aprovacoes/${id}`));
      // Perfil + rastreamento + presenca
      await remove(ref(db, `${tipo === 'empresa' ? 'empresas' : 'entregadores'}/${id}`)).catch(() => {});
      await remove(ref(db, `posicoes/${id}`)).catch(() => {});
      await remove(ref(db, `presenca/${id}`)).catch(() => {});
      // Chats: apaga mensagens ligadas a este uid
      const snap = await get(ref(db, 'mensagens')).catch(() => null);
      if (snap?.exists()) {
        const updates = {};
        snap.forEach(c => {
          const m = c.val() || {};
          if (m.entregadorId === id || m.empresaId === id) updates[c.key] = null;
        });
        if (Object.keys(updates).length) await update(ref(db, 'mensagens'), updates);
      }
    } catch (e) {
      window.alert('Erro ao excluir: ' + e.message);
    }
  };

  // ---- Dados completos do cadastro (editavel pelo Master: acesso total) ----
  const [detalhes, setDetalhes] = useState(null); // { tipo, id, nome, dados }
  const [detalhesMsg, setDetalhesMsg] = useState('');
  const verDados = async (s) => {
    const no = s.tipo === 'empresa' ? 'empresas' : 'entregadores';
    setDetalhesMsg('');
    try {
      const snap = await get(ref(db, `${no}/${s.id}`));
      const dados = snap.val() || { '(aviso)': 'Perfil não encontrado no banco (talvez já tenha sido resetado).' };
      setDetalhes({ tipo: s.tipo, id: s.id, nome: s.nome, dados, originais: snap.val() || {} });
    } catch (e) {
      setDetalhes({ tipo: s.tipo, id: s.id, nome: s.nome, dados: { '(erro)': e.message }, originais: {} });
    }
  };

  // Salva edicoes feitas pelo Master direto no perfil (preserva o tipo original do campo)
  const salvarDetalhes = async () => {
    if (!detalhes?.id) return;
    const no = detalhes.tipo === 'empresa' ? 'empresas' : 'entregadores';
    const originais = detalhes.originais || {};
    const limpo = {};
    Object.entries(detalhes.dados || {}).forEach(([k, v]) => {
      const orig = originais[k];
      if (typeof orig === 'object' && orig !== null) return; // objetos complexos nao sao editaveis aqui
      if (typeof orig === 'number' && v !== '' && !isNaN(Number(v))) { limpo[k] = Number(v); return; }
      if (typeof orig === 'boolean') { limpo[k] = v === true || v === 'true'; return; }
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') limpo[k] = v;
    });
    try {
      await update(ref(db, `${no}/${detalhes.id}`), limpo);
      setDetalhesMsg('✅ Dados salvos no perfil.');
    } catch (e) {
      setDetalhesMsg('❌ Erro ao salvar: ' + e.message);
    }
  };

  // ===== ACESSO TOTAL: CONTROLE DE TODAS AS ENTREGAS =====
  const [filtroEntregas, setFiltroEntregas] = useState('todas'); // 'todas' | 'pendente' | 'andamento' | 'entregue'
  const [buscaEntrega, setBuscaEntrega] = useState('');
  const [entregaDetalhe, setEntregaDetalhe] = useState(null);

  const entregasFiltradas = entregas
    .filter(e => {
      if (filtroEntregas === 'pendente' && e.status !== 'pendente') return false;
      if (filtroEntregas === 'andamento' && !['aceite', 'em_transito'].includes(e.status)) return false;
      if (filtroEntregas === 'entregue' && e.status !== 'entregue') return false;
      const t = buscaEntrega.trim().toLowerCase();
      if (!t) return true;
      return [e.empresaNome, e.entregadorNome, e.destino, e.origem, e.descricao, e.codigo]
        .some(v => String(v || '').toLowerCase().includes(t));
    })
    .sort((a, b) => (b.createdAt || b.criadoEm || 0) - (a.createdAt || a.criadoEm || 0));

  const excluirEntrega = async (e) => {
    if (!window.confirm(`Excluir a entrega ${e.codigo ? '#' + e.codigo : '#' + String(e.id).slice(-4)} de ${e.empresaNome || 'empresa'}?\n\nSerão apagados a entrega e o rastreio público dela.\nNão dá para desfazer!`)) return;
    try {
      await remove(ref(db, `entregas/${e.id}`));
      await remove(ref(db, `rastreio/${e.id}`)).catch(() => {});
      setEntregaDetalhe(null);
    } catch (err) {
      window.alert('Erro ao excluir entrega: ' + err.message);
    }
  };

  const cancelarEntrega = async (e) => {
    if (!window.confirm(`Cancelar a entrega ${e.codigo ? '#' + e.codigo : '#' + String(e.id).slice(-4)} de ${e.empresaNome || 'empresa'}?\n\nA entrega volta a ficar visível apenas no histórico como CANCELADA.`)) return;
    try {
      await update(ref(db, `entregas/${e.id}`), { status: 'cancelado', canceladoEm: Date.now() });
      await update(ref(db, `rastreio/${e.id}`), { status: 'cancelado' }).catch(() => {});
    } catch (err) {
      window.alert('Erro ao cancelar entrega: ' + err.message);
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
          <span className="admin-brand-icon"><img src={`${import.meta.env.BASE_URL}logo-192.png`} alt="" /></span>
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
          <h3>🏦 Sua receita hoje</h3>
          <p style={{fontSize: '1.15rem', color: '#f59e0b'}}>R$ {receitaHoje.toFixed(2)}</p>
        </div>
        <div className="admin-stat">
          <h3>🚚 Em andamento</h3>
          <p>{emAndamento.length}</p>
        </div>
        <div className="admin-stat">
          <h3>📡 Online agora</h3>
          <p style={{color: '#10b981'}}>{onlineAgora}</p>
        </div>
        <div className="admin-stat">
          <h3>🏢 Empresas online</h3>
          <p style={{color: '#818cf8'}}>{empresasOnline.length}</p>
        </div>
      </div>

      <MapaTempoReal posicoes={posicoes} entregas={entregas} entregadores={entregadores} />

      <div className="admin-mapa-section">
        <h4>🏢 Empresas usando o painel agora ({empresasOnline.length})</h4>
        {empresasOnline.length === 0 ? (
          <div className="admin-vazio">Nenhuma empresa está com o painel aberto agora.</div>
        ) : (
          <div className="admin-empresas-grid">
            {empresasOnline.map(([id, p]) => {
              const minAtras = Math.floor((agora - (p.ultimoAviso || 0)) / 60000);
              return (
                <div key={id} className="admin-empresa-online">
                  <span className="rel-ponto livre" />
                  <div className="rel-info">
                    <strong>{nomeEmpresaOnline(id)}</strong>
                    <small>{p.email || ''} · ativa {minAtras < 1 ? 'poucos segundos atrás' : `${minAtras} min atrás`}</small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

      <div className="admin-backup">
        <div className="admin-backup-info">
          <strong>💾 Backup &amp; Limpeza</strong>
          <span>Baixe uma cópia completa do banco, restaure um arquivo de backup ou apague tudo para começar do zero.</span>
        </div>
        <div className="admin-backup-botoes">
          <button className="admin-btn backup" onClick={fazerBackup}>💾 BACKUP</button>
          <label className="admin-btn restaurar">♻️ RESTAURAR
            <input type="file" accept="application/json,.json" style={{display: 'none'}} onChange={e => { restaurarBackup(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className="admin-btn revogar" onClick={apagarTudo}>🧹 APAGAR TUDO</button>
        </div>
        {backupMsg && <div className="admin-backup-msg">{backupMsg}</div>}
      </div>

      <div className="admin-backup">
        <div className="admin-backup-info">
          <strong>🏦 Taxa da plataforma (sua receita por entrega)</strong>
          <span>Vale para as próximas entregas. Ex.: R$ 1,00 fixo + 10% = entrega de R$ 10 paga R$ 1,60 de taxa e o motoboy recebe R$ 8,40.</span>
          {taxaMsg && <span style={{color: '#fbbf24', marginTop: 4}}>{taxaMsg}</span>}
        </div>
        <div className="admin-backup-botoes" style={{alignItems: 'center'}}>
          <label style={{fontSize: '0.72rem', color: '#94a3b8'}}>Fixo R$
            <input type="number" step="0.01" min="0" value={configTaxa.porEntrega} onChange={e => setConfigTaxa(t => ({ ...t, porEntrega: e.target.value }))} style={{width: 76, marginLeft: 6, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px', color: '#f8fafc'}} />
          </label>
          <label style={{fontSize: '0.72rem', color: '#94a3b8'}}>+ %
            <input type="number" step="0.5" min="0" value={configTaxa.percentual} onChange={e => setConfigTaxa(t => ({ ...t, percentual: e.target.value }))} style={{width: 64, marginLeft: 6, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px', color: '#f8fafc'}} />
          </label>
          <button className="admin-btn backup" onClick={salvarTaxa}>SALVAR TAXA</button>
        </div>
      </div>

      <div className="admin-backup">
        <div className="admin-backup-info">
          <strong>📱 App do entregador — v{APP_VERSAO_ENTREGADOR} (atual)</strong>
          <span>Defina a versão mínima: quem estiver com APK antigo vê a tela de bloqueio com botão para baixar o novo (hospedado aqui no site). Deixe vazio para desativar.</span>
          {versaoMsg && <span style={{color: '#fbbf24', marginTop: 4}}>{versaoMsg}</span>}
        </div>
        <div className="admin-backup-botoes" style={{alignItems: 'center'}}>
          <label style={{fontSize: '0.72rem', color: '#94a3b8'}}>Versão mínima
            <input type="text" placeholder="ex.: 1.1" value={versaoMinima} onChange={e => setVersaoMinima(e.target.value)} style={{width: 90, marginLeft: 6, background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '8px', color: '#f8fafc'}} />
          </label>
          <button className="admin-btn backup" onClick={salvarVersao}>SALVAR</button>
        </div>
      </div>

      <div className="admin-backup">
        <div className="admin-backup-info">
          <strong>📊 Faturamento total do sistema</strong>
          <span>{concluidasTotal.length} entregas concluídas · Faturamento bruto R$ {concluidasTotal.reduce((s, e) => s + parseFloat(e.valor || 0), 0).toFixed(2)} · A repassar aos entregadores R$ {aRepassarTotal.toFixed(2)}</span>
        </div>
        <div className="admin-stat" style={{minWidth: 130}}>
          <h3>Sua receita total</h3>
          <p style={{fontSize: '1.2rem', color: '#f59e0b'}}>R$ {receitaTotal.toFixed(2)}</p>
        </div>
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
                  <small>{e.destino || ''} {(e.createdAt || e.criadoEm) ? `• ${new Date(e.createdAt || e.criadoEm).toLocaleString('pt-BR')}` : ''}</small>
                </span>
                <span className="ent-valor">R$ {parseFloat(e.valor || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-monitor">
        <h4>🛡️ Controle Total de Entregas — acesso master</h4>
        <div className="admin-stats">
          <button className={`admin-stat ${filtroEntregas === 'todas' ? 'active' : ''}`} onClick={() => setFiltroEntregas('todas')}>
            <h3>📦 Todas</h3>
            <p>{entregas.length}</p>
          </button>
          <button className={`admin-stat ${filtroEntregas === 'pendente' ? 'active' : ''}`} onClick={() => setFiltroEntregas('pendente')}>
            <h3>⏳ Pendentes</h3>
            <p>{entregas.filter(e => e.status === 'pendente').length}</p>
          </button>
          <button className={`admin-stat ${filtroEntregas === 'andamento' ? 'active' : ''}`} onClick={() => setFiltroEntregas('andamento')}>
            <h3>🚚 Em rota</h3>
            <p>{emAndamento.length}</p>
          </button>
          <button className={`admin-stat ${filtroEntregas === 'entregue' ? 'active' : ''}`} onClick={() => setFiltroEntregas('entregue')}>
            <h3>✅ Concluídas</h3>
            <p>{concluidasTotal.length}</p>
          </button>
        </div>
        <div className="admin-busca" style={{marginBottom: 10}}>
          <input
            type="text"
            placeholder="🔍 Buscar entrega por empresa, entregador, endereço, item ou código..."
            value={buscaEntrega}
            onChange={e => setBuscaEntrega(e.target.value)}
          />
          {buscaEntrega && <button onClick={() => setBuscaEntrega('')}>✕</button>}
        </div>
        <div className="admin-entregas">
          {entregasFiltradas.length === 0 && <div className="admin-vazio">Nenhuma entrega neste filtro.</div>}
          {entregasFiltradas.map(e => (
            <div key={e.id} className="admin-entrega-item">
              <span className={`ent-status ${e.status}`}>{
                { pendente: '⏳ PENDENTE', aceite: '🛵 ACEITA', em_transito: '🚚 EM ROTA', entregue: '✅ ENTREGUE', cancelado: '⛔ CANCELADA' }[e.status] || e.status
              }</span>
              <span className="ent-info">
                <strong>{e.empresaNome || 'Empresa'}</strong> → {nomeEntregador(e)}
                {e.codigo ? ` · código #${e.codigo}` : ''}
                <small>{e.destino || ''} {(e.createdAt || e.criadoEm) ? `• ${new Date(e.createdAt || e.criadoEm).toLocaleString('pt-BR')}` : ''}</small>
              </span>
              <span className="ent-valor">R$ {parseFloat(e.valor || 0).toFixed(2)}</span>
              <span className="admin-item-acoes" style={{marginLeft: 8}}>
                <button className="admin-btn dados" onClick={() => setEntregaDetalhe(e)}>VER</button>
                {!['entregue', 'cancelado'].includes(e.status) && (
                  <button className="admin-btn revogar" onClick={() => cancelarEntrega(e)}>CANCELAR</button>
                )}
                <button className="admin-btn excluir" onClick={() => excluirEntrega(e)}>EXCLUIR</button>
              </span>
            </div>
          ))}
        </div>
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
              <h3>{detalhes.tipo === 'empresa' ? '🏢' : '🛵'} {detalhes.nome || 'Cadastro'} <small style={{color:'#94a3b8', fontWeight:400}}>— edição master</small></h3>
              <button className="admin-btn excluir" onClick={() => setDetalhes(null)}>FECHAR</button>
            </div>
            <div className="admin-dados">
              {Object.entries(detalhes.dados || {}).map(([chave, valor]) => (
                <div key={chave} className="admin-dado-linha">
                  <span className="admin-dado-chave">{chave}</span>
                  {typeof valor === 'object' && valor !== null ? (
                    <span className="admin-dado-valor">{JSON.stringify(valor)}</span>
                  ) : (
                    <input
                      value={String(valor)}
                      onChange={ev => setDetalhes(d => ({ ...d, dados: { ...d.dados, [chave]: ev.target.value } }))}
                      style={{flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', color: '#f8fafc', fontSize: '0.8rem'}}
                    />
                  )}
                </div>
              ))}
            </div>
            {detalhesMsg && <div style={{marginTop: 10, fontSize: '0.8rem', color: detalhesMsg.startsWith('✅') ? '#10b981' : '#f87171'}}>{detalhesMsg}</div>}
            <div style={{marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              <button className="admin-btn backup" onClick={salvarDetalhes}>💾 SALVAR ALTERAÇÕES</button>
            </div>
          </div>
        </div>
      )}

      {entregaDetalhe && (
        <div className="admin-modal-fundo" onClick={() => setEntregaDetalhe(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>📦 Entrega {entregaDetalhe.codigo ? '#' + entregaDetalhe.codigo : '#' + String(entregaDetalhe.id).slice(-4)}</h3>
              <button className="admin-btn excluir" onClick={() => setEntregaDetalhe(null)}>FECHAR</button>
            </div>
            <div className="admin-dados">
              {[
                ['Status', { pendente: '⏳ Pendente', aceite: '🛵 Aceita', em_transito: '🚚 Em rota', entregue: '✅ Entregue', cancelado: '⛔ Cancelada' }[entregaDetalhe.status] || entregaDetalhe.status],
                ['Empresa', entregaDetalhe.empresaNome || '—'],
                ['Entregador', entregaDetalhe.entregadorNome || nomeEntregador(entregaDetalhe)],
                ['Coleta', entregaDetalhe.origemEndereco || entregaDetalhe.origem || '—'],
                ['Entrega', entregaDetalhe.destinoEndereco || entregaDetalhe.destino || '—'],
                ['Item', entregaDetalhe.descricao || '—'],
                ['Valor', `R$ ${parseFloat(entregaDetalhe.valor || 0).toFixed(2)}`],
                ['Taxa da plataforma', `R$ ${parseFloat(entregaDetalhe.taxaPlataforma || 0).toFixed(2)}`],
                ['Líquido do entregador', `R$ ${(parseFloat(entregaDetalhe.valor || 0) - parseFloat(entregaDetalhe.taxaPlataforma || 0)).toFixed(2)}`],
                ['Pagamento', entregaDetalhe.pagamento || '—'],
                ['Chave Pix', entregaDetalhe.pixChave || '—'],
                ['Distância', entregaDetalhe.distanciaKm ? `${entregaDetalhe.distanciaKm} km` : '—'],
                ['Criada em', (entregaDetalhe.createdAt || entregaDetalhe.criadoEm) ? new Date(entregaDetalhe.createdAt || entregaDetalhe.criadoEm).toLocaleString('pt-BR') : '—'],
                ['Concluída em', entregaDetalhe.entregueEm ? new Date(entregaDetalhe.entregueEm).toLocaleString('pt-BR') : '—'],
                ['Código do cliente', entregaDetalhe.codigo || '—']
              ].map(([chave, valor]) => (
                <div key={chave} className="admin-dado-linha">
                  <span className="admin-dado-chave">{chave}</span>
                  <span className="admin-dado-valor">{valor}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
              {!['entregue', 'cancelado'].includes(entregaDetalhe.status) && (
                <button className="admin-btn revogar" onClick={() => cancelarEntrega(entregaDetalhe)}>CANCELAR ENTREGA</button>
              )}
              <button className="admin-btn excluir" onClick={() => excluirEntrega(entregaDetalhe)}>EXCLUIR ENTREGA</button>
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
