import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get, onValue, set } from 'firebase/database';
import { auth, db } from './firebase';
import Auth, { cpfValido, obterIdDispositivo } from './Auth';
import Dashboard from './Dashboard';
import ErrorBoundary from './ErrorBoundary';
import './App.css';

// Versao deste APK. Ao publicar versao nova: aumente aqui, gere o APK e copie para docs/apk/
export const APP_VERSAO = '1.4.31';

// Compara "1.2.3" com "1.10.0" corretamente
const versaoMenorQue = (a, b) => {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false;
};

// Tela de bloqueio: versao antiga e obrigada a atualizar (APK direto do site, sem Play Store).
// O link usa a VERSAO-DESTINO no nome do arquivo (ex.: ConectaEntregas-1.4.5.apk),
// publicada junto da release — o entregador ve claramente o que esta baixando.
function AtualizacaoObrigatoria({ atual, minima }) {
  const alvo = minima || atual;
  // Se o APK da versão alvo não existe (Master configurou versão sem release), usa o nome fixo (sempre a última publicada)
  const [href, setHref] = useState(`https://marcostheangels.github.io/sistema-entregas/apk/ConectaEntregas-${alvo}.apk`);
  useEffect(() => {
    const urlAlvo = `https://marcostheangels.github.io/sistema-entregas/apk/ConectaEntregas-${alvo}.apk`;
    fetch(urlAlvo, { method: 'HEAD' })
      .then(r => { if (!r.ok) setHref('https://marcostheangels.github.io/sistema-entregas/apk/App-Entregador.apk'); })
      .catch(() => {});
  }, [alvo]);
  return (
    <div className="login-container">
      <div className="login-card" style={{textAlign: 'center'}}>
        <div style={{fontSize: '3rem', marginBottom: 12}}>🚨</div>
        <h1>Atualização obrigatória</h1>
        <p>
          Seu app está na versão <strong>{atual}</strong> e a mínima agora é a <strong>{alvo}</strong>.<br />
          Atualize para continuar trabalhando — é rápido e não perde seus dados.
        </p>
        <a
          href={href}
          download={`ConectaEntregas-${alvo}.apk`}
          style={{display: 'block', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff',
                  borderRadius: 12, padding: '14px', fontFamily: 'Archivo, sans-serif', fontWeight: 800,
                  fontSize: '0.9rem', letterSpacing: '0.05em', textDecoration: 'none', marginTop: 8}}
        >
          ⬇️ BAIXAR v{alvo}
        </a>
        <p style={{fontSize: '0.72rem', marginTop: 12, lineHeight: 1.6}}>
          Baixou? Toque no arquivo <strong>ConectaEntregas-{alvo}.apk</strong> e confirme a instalação.<br />
          Depois toque em "já atualizei" abaixo.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
                  borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', marginTop: 6}}
        >
          JÁ ATUALIZEI — VERIFICAR
        </button>
      </div>
    </div>
  );
}

function AguardandoAprovacao({ user, versao }) {
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
            ⏳ Assim que o administrador aprovar, o app abre aqui mesmo automaticamente — sem precisar sair ou logar de novo.
          </p>
        </div>
        <button
          className="btn-primary"
          style={{marginTop: 20}}
          onClick={() => signOut(auth)}
        >
          SAIR
        </button>
        {versao && (
          <div style={{textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 14}}>
            ConectaEntregas Entregador · v{versao}
          </div>
        )}
      </div>
    </div>
  );
}

// WhatsApp do suporte (mesmo da tela da empresa): o recusado pode chamar,
// mandar mensagem e anexar arquivos (fotos dos documentos) por lá.
const WHATS_SUPORTE = '5538998558528';

// Conta BANIDA/RECUSADA pelo Master: mostra o motivo e trava tudo.
// So volta a funcionar se o Master liberar (desbanir) no painel admin.
function ContaBanida({ motivo, versao, email }) {
  const textoZap = `Olá! Meu cadastro de entregador não foi aprovado (${email || ''}). Quero resolver — motivo: ${motivo || 'não informado'}.`;
  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade" style={{textAlign: 'center'}}>
        <div className="auth-header">
          <div className="auth-logo">⛔</div>
          <h1 className="auth-title">Cadastro não aprovado</h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8, lineHeight: 1.5}}>
            Seu cadastro não foi aceito na plataforma.
          </p>
          {motivo ? (
            <div style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
                         borderRadius: 10, padding: '12px', marginTop: 12, textAlign: 'left'}}>
              <div style={{fontSize: '0.7rem', fontWeight: 800, color: '#f87171', marginBottom: 4}}>MOTIVO DO ADMINISTRADOR:</div>
              <div style={{fontSize: '0.85rem', color: '#fecaca', lineHeight: 1.5}}>{motivo}</div>
            </div>
          ) : (
            <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 12}}>
              Fale com o ConectaEntregas para mais informações.
            </p>
          )}
        </div>
        <a
          href={`https://wa.me/${WHATS_SUPORTE}?text=${encodeURIComponent(textoZap)}`}
          target="_blank" rel="noreferrer"
          style={{display: 'block', background: '#22c55e', color: '#fff', borderRadius: 12,
                  padding: '14px', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none', marginTop: 12}}
        >
          💬 FALAR NO WHATSAPP
        </a>
        <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5}}>
          Chame no WhatsApp para recorrer: dá para mandar mensagem e anexar fotos/arquivos por lá.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
                  borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', marginTop: 12, width: '100%'}}
        >
          🔄 JÁ FUI LIBERADO — VERIFICAR
        </button>
        <button className="btn-primary" style={{marginTop: 12}} onClick={() => signOut(auth)}>SAIR</button>
        {versao && (
          <div style={{textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 14}}>
            ConectaEntregas Entregador · v{versao}
          </div>
        )}
      </div>
    </div>
  );
}

// Conta de outro painel (ex.: empresa) tentando entrar no app do entregador: BLOQUEIA
function ContaIncorreta({ user, tipo, versao }) {
  const msg = tipo === 'empresa'
    ? 'Este e-mail é uma conta de EMPRESA e não pode acessar o aplicativo do entregador. Use o painel ConectaEntregas Empresas no navegador.'
    : 'Esta conta não é de entregador e não pode acessar este aplicativo.';
  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade" style={{textAlign: 'center'}}>
        <div className="auth-header">
          <div className="auth-logo">⛔</div>
          <h1 className="auth-title">Conta incorreta</h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8, lineHeight: 1.5}}>{msg}</p>
        </div>
        <button className="btn-primary" style={{marginTop: 20}} onClick={() => signOut(auth)}>SAIR</button>
        {versao && (
          <div style={{textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 14}}>
            ConectaEntregas Entregador · v{versao}
          </div>
        )}
      </div>
    </div>
  );
}

// Recupera o perfil do entregador caso ele tenha sido apagado (ex.: reset do administrador)
function CompletarCadastro({ user, dados }) {
  const [nome, setNome] = useState(dados?.nome || '');
  const [telefone, setTelefone] = useState(dados?.telefone || '');
  const [cpf, setCpf] = useState(dados?.cpf || '');
  const [veiculo, setVeiculo] = useState(dados?.veiculo || '');
  const [placa, setPlaca] = useState(dados?.placa || '');
  const [endereco, setEndereco] = useState(dados?.endereco || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatarCpf = (valor) => {
    const nums = valor.replace(/\D/g, '');
    if (nums.length <= 3) return nums;
    if (nums.length <= 6) return `${nums.slice(0,3)}.${nums.slice(3)}`;
    if (nums.length <= 9) return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6)}`;
    return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6,9)}-${nums.slice(9,11)}`;
  };

  const formatarPlaca = (valor) => valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

  const salvar = async (e) => {
    e.preventDefault();
    setError('');
    if (!nome || !telefone || !cpf) {
      setError('Preencha os campos obrigatórios (Nome, Telefone, CPF)');
      return;
    }
    if (!cpfValido(cpf)) {
      setError('⚠️ CPF inválido. Confira os 11 números digitados.');
      return;
    }
    setLoading(true);
    try {
      // Preserva documentos já enviados (não apaga as fotos num recadastro)
      let docsMantidos = {};
      try {
        const snapAtual = await get(ref(db, `entregadores/${user.uid}`));
        if (snapAtual.val()?.documentos) docsMantidos = snapAtual.val().documentos;
      } catch { /* segue sem preservar */ }
      await set(ref(db, `entregadores/${user.uid}`), {
        nome,
        email: user.email,
        telefone: telefone.replace(/\D/g, ''),
        cpf: cpf.replace(/\D/g, ''),
        veiculo,
        placa: placa.toUpperCase(),
        endereco,
        documentos: docsMantidos,
        status: 'disponivel',
        createdAt: Date.now()
      });
    } catch (err) {
      setError('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade">
        <div className="auth-header">
          <div className="auth-logo">🛵</div>
          <h1 className="auth-title">Complete seu cadastro</h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8}}>
            Confirme seus dados para as empresas te identificarem nas entregas.
          </p>
        </div>
        <form className="auth-form" onSubmit={salvar}>
          <div className="input-group">
            <label>NOME COMPLETO *</label>
            <input className="auth-input" type="text" placeholder="Ex: João Silva" value={nome}
              onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>CPF *</label>
            <input className="auth-input" type="text" placeholder="000.000.000-00" value={cpf}
              onChange={(e) => setCpf(formatarCpf(e.target.value))} maxLength={14} required />
          </div>
          <div className="input-group">
            <label>TELEFONE (WHATSAPP) *</label>
            <input className="auth-input" type="tel" placeholder="(00) 00000-0000" value={telefone}
              onChange={(e) => setTelefone(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>VEÍCULO (MODELO/COR)</label>
            <input className="auth-input" type="text" placeholder="Ex: Honda Titan 160 Preta" value={veiculo}
              onChange={(e) => setVeiculo(e.target.value)} />
          </div>
          <div className="input-group">
            <label>PLACA</label>
            <input className="auth-input" type="text" placeholder="ABC1D23" value={placa}
              onChange={(e) => setPlaca(formatarPlaca(e.target.value))} maxLength={7} />
          </div>
          <div className="input-group">
            <label>ENDEREÇO RESIDENCIAL</label>
            <input className="auth-input" type="text" placeholder="Rua, Número, Bairro" value={endereco}
              onChange={(e) => setEndereco(e.target.value)} />
          </div>
          {error && <div className="error" style={{fontSize: '0.8rem', marginBottom: 10}}>{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Salvando...' : 'SALVAR MEUS DADOS'}
          </button>
        </form>
        <div className="auth-toggle" style={{marginTop: 12}}>
          <span onClick={() => signOut(auth)}>Sair da conta</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aprovado, setAprovado] = useState(null); // null = sem registro (antigo) | true | false
  const [temPerfil, setTemPerfil] = useState(true);
  const [perfilCarregando, setPerfilCarregando] = useState(true);
  const [dadosAprov, setDadosAprov] = useState(null);
  const [tipoConta, setTipoConta] = useState(null); // 'entregador' | 'empresa' | ... — bloqueia login cruzado
  const [criandoSolicitacao, setCriandoSolicitacao] = useState(false); // recriando pedido de aprovacao orfao
  const [erroSolicitacao, setErroSolicitacao] = useState(null); // null | 'recusado' | 'falha'
  const [banInfo, setBanInfo] = useState(null); // registro do ban (com o motivo do Master)
  // Cadastro feito AGORA nesta sessão: trava em "aguardando" até o banco
  // confirmar (nunca pisca o Dashboard liberado). Limpa ao aprovar/sair.
  const [freshReg, setFreshReg] = useState(() => {
    try { return !!sessionStorage.getItem('ga_fresh_register'); } catch { return false; }
  });
  const [versaoMinima, setVersaoMinima] = useState(null);
  const [conexaoFalhou, setConexaoFalhou] = useState(false); // Firebase nao respondeu: tela de erro com tentar de novo

  // Timeout de segurança: se o Firebase Auth não responder em 12s (WebSocket bloqueado/rede ruim),
  // mostra tela de erro com botão de tentar de novo — em vez de 'Carregando...' travado para sempre.
  useEffect(() => {
    if (!loading || conexaoFalhou) return;
    const t = setTimeout(() => setConexaoFalhou(true), 12000);
    return () => clearTimeout(t);
  }, [loading, conexaoFalhou]);

  // Versao minima definida pelo Master: app antigo se auto-bloqueia (vale mesmo sem login)
  useEffect(() => {
    const unsub = onValue(ref(db, 'config/versaoMinima'), snap => setVersaoMinima(snap.val()?.app || null), () => {});
    return unsub;
  }, []);

  useEffect(() => {
    let unsubAprov = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setPerfilCarregando(true);
      setErroSolicitacao(null);
      setCriandoSolicitacao(false);
      setBanInfo(null);
      setFreshReg(false);
      try { sessionStorage.removeItem('ga_fresh_register'); } catch { /* sem storage */ }
      if (unsubAprov) { unsubAprov(); unsubAprov = null; }
      if (!u) { setAprovado(null); setLoading(false); return; }
      setLoading(true);
      // Escuta a aprovacao EM TEMPO REAL: quando o admin aprovar, o app libera sozinho aqui mesmo
      unsubAprov = onValue(ref(db, `aprovacoes/${u.uid}`), s => {
        if (s.exists()) { setAprovado(s.val().aprovado === true); setDadosAprov(s.val()); setTipoConta(s.val().tipo || 'entregador'); }
        else { setAprovado(null); setTipoConta(null); }
        setLoading(false);
      }, () => { setAprovado(null); setTipoConta(null); setLoading(false); });
    });
    return () => { unsub(); if (unsubAprov) unsubAprov(); };
  }, []);

  // Perfil do entregador (recria a tela de cadastro caso tenha sido apagado por um reset)
  useEffect(() => {
    if (!user || aprovado === false) return;
    const unsub = onValue(ref(db, `entregadores/${user.uid}`), snap => {
      setTemPerfil(snap.exists());
      setPerfilCarregando(false);
    }, () => { setTemPerfil(true); setPerfilCarregando(false); });
    return unsub;
  }, [user, aprovado]);

  // Auto-reparo no nivel do App: se o Android matou o app e o perfil sumiu/apresentou falha
  // na reconexao, mas o cadastro esta APROVADO, recria o perfil automaticamente —
  // o entregador NUNCA mais ve o formulario de cadastro por engano.
  useEffect(() => {
    if (!user || aprovado !== true || perfilCarregando || temPerfil || !dadosAprov) return;
    // Conta de empresa/outra origem: NUNCA cria perfil de entregador
    if (dadosAprov.tipo && dadosAprov.tipo !== 'entregador') return;
    set(ref(db, `entregadores/${user.uid}`), {
      nome: dadosAprov.nome || dadosAprov.nomeCompleto || '',
      email: user.email,
      telefone: (dadosAprov.telefone || '').replace(/\D/g, ''),
      cpf: (dadosAprov.cpf || '').replace(/\D/g, ''),
      veiculo: dadosAprov.veiculo || '',
      placa: (dadosAprov.placa || '').toUpperCase(),
      endereco: dadosAprov.endereco || '',
      documentos: dadosAprov.documentos || {},
      status: 'disponivel',
      createdAt: Date.now()
    }).catch(() => {});
  }, [user, aprovado, temPerfil, perfilCarregando, dadosAprov]);

  // Cadastro fresquinho sem veredito ainda: limpa a trava quando o banco
  // responder (aprovado ou não), quando banir/recusar ou der erro.
  useEffect(() => {
    if (!freshReg) return;
    if (aprovado !== null || banInfo || erroSolicitacao) {
      setFreshReg(false);
      try { sessionStorage.removeItem('ga_fresh_register'); } catch { /* sem storage */ }
    }
  }, [freshReg, aprovado, banInfo, erroSolicitacao]);

  // Le o ban do Master EM TEMPO REAL (motivo exibido na tela; trava tudo).
  // Quando o Master DESBANE, limpa sozinho aqui mesmo — sem precisar sair/entrar.
  useEffect(() => {
    if (!user) { setBanInfo(null); return; }
    const calc = (b, r) => setBanInfo(b?.exists() ? b.val() : (r?.exists() ? r.val() : null));
    let snapB = null, snapR = null;
    const unsubB = onValue(ref(db, `banidos/${user.uid}`), s => { snapB = s; calc(snapB, snapR); }, () => {});
    const unsubR = onValue(ref(db, `recusados/${user.uid}`), s => { snapR = s; calc(snapB, snapR); }, () => {});
    return () => { unsubB(); unsubR(); };
  }, [user]);

  // Recupera cadastro ORFAO: tem perfil mas o pedido de aprovacao nao existe
  // (ex.: pedido negado pelas regras antigas antes de publicar as novas).
  // Recria o pedido a partir do perfil — com os documentos — para o Master ver.
  // So vale para perfil RECENTE (7 dias): conta antiga sem registro segue liberada.
  // Cadastro BANIDO/RECUSADO pelo Master nunca e recriado.
  // (Trava por ref + timeout: a tela de "enviando" nunca fica presa.)
  const criandoRef = useRef(false);
  useEffect(() => {
    if (!user || aprovado !== null || perfilCarregando || !temPerfil || criandoRef.current || erroSolicitacao || banInfo || freshReg) return;
    criandoRef.current = true;
    setCriandoSolicitacao(true);
    let cancelado = false;
    const comTimeout = (promessa, ms) => Promise.race([
      promessa, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
    (async () => {
      try {
        const [snapPerfil, snapRec, snapBan] = await comTimeout(Promise.all([
          get(ref(db, `entregadores/${user.uid}`)),
          get(ref(db, `recusados/${user.uid}`)).catch(() => ({ val: () => null })),
          get(ref(db, `banidos/${user.uid}`)).catch(() => ({ val: () => null }))
        ]), 20000);
        if (cancelado) return;
        if (snapRec.val() || snapBan.val()) { setErroSolicitacao('recusado'); return; }
        const p = snapPerfil.val() || {};
        const idade = Date.now() - (p.createdAt || 0);
        if (!p.createdAt || idade > 7 * 86400e3) return; // conta antiga: mantem comportamento atual
        const dispositivo = await obterIdDispositivo().catch(() => '');
        const qtdDocs = (p.documentos && typeof p.documentos === 'object') ? Object.keys(p.documentos).length : 0;
        const pedidoFull = {
          tipo: 'entregador',
          nome: p.nome || user.email,
          email: p.email || user.email,
          telefone: p.telefone || '',
          cpf: p.cpf || '',
          veiculo: p.veiculo || '',
          placa: (p.placa || '').toUpperCase(),
          endereco: p.endereco || '',
          temDocumentos: qtdDocs > 0, qtdDocumentos: qtdDocs,
          dispositivo: p.dispositivo || dispositivo,
          aprovado: false, criadoPor: user.uid, criadoEm: Date.now()
        };
        const { temDocumentos: _td, qtdDocumentos: _qd, dispositivo: _dev, ...pedidoMinimo } = pedidoFull;
        try {
          await comTimeout(set(ref(db, `aprovacoes/${user.uid}`), pedidoFull), 20000);
        } catch {
          await comTimeout(set(ref(db, `aprovacoes/${user.uid}`), pedidoMinimo), 20000);
        }
        // O listener de aprovacoes vai virar `false` sozinho e mostrar "em analise"
      } catch {
        if (!cancelado) setErroSolicitacao('falha');
      } finally {
        criandoRef.current = false;
        setCriandoSolicitacao(false);
      }
    })();
    return () => { cancelado = true; };
  }, [user, aprovado, temPerfil, perfilCarregando, erroSolicitacao, banInfo, freshReg]);

  if (loading) return conexaoFalhou ? (
    <div className="loading" style={{textAlign:'center', padding:'40px 24px'}}>
      <div style={{fontSize:'2.5rem', marginBottom:12}}>📡</div>
      <h2 style={{marginBottom:8}}>Sem conexão com o servidor</h2>
      <p style={{opacity:0.7, marginBottom:20, fontSize:'0.9rem', lineHeight:1.6}}>
        Verifique sua internet (Wi-Fi ou dados móveis).<br/>
        Se o problema continuar, atualize o <strong>Android System WebView</strong> e o <strong>Google Chrome</strong> na Play Store.
      </p>
      <button
        onClick={() => { setConexaoFalhou(false); setLoading(true); window.location.reload(); }}
        style={{background:'var(--primary)', color:'#fff', border:'none', borderRadius:12, padding:'14px 28px', fontWeight:800, fontSize:'0.9rem', cursor:'pointer'}}
      >
        🔄 TENTAR NOVAMENTE
      </button>
    </div>
  ) : <div className="loading">Carregando...</div>;

  if (versaoMinima && versaoMenorQue(APP_VERSAO, versaoMinima)) return <AtualizacaoObrigatoria atual={APP_VERSAO} minima={versaoMinima} />;

  // Banido/recusado pelo Master: mostra o motivo e trava (vale p/ qualquer conta nova que ele tentar criar)
  if (user && banInfo) return <ContaBanida motivo={banInfo.motivo} versao={APP_VERSAO} email={user.email} />;

  if (user && freshReg && aprovado === null) return <AguardandoAprovacao user={user} versao={APP_VERSAO} />;

  // Login cruzado bloqueado: conta de empresa (ou outro tipo) NAO entra no app do entregador
  if (user && tipoConta && tipoConta !== 'entregador') return <ContaIncorreta user={user} tipo={tipoConta} versao={APP_VERSAO} />;

  if (user && aprovado === false) return <AguardandoAprovacao user={user} versao={APP_VERSAO} />;

  // Pedido de aprovacao orfao sendo recriado: mostra espera em vez de liberar direto
  if (user && criandoSolicitacao) return <div className="loading">Enviando sua solicitação de aprovação...</div>;

  if (user && erroSolicitacao === 'recusado') return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade" style={{textAlign: 'center'}}>
        <div className="auth-header">
          <div className="auth-logo">⛔</div>
          <h1 className="auth-title">Cadastro recusado</h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8, lineHeight: 1.5}}>
            Este cadastro foi recusado pelo administrador. Se foi um engano, fale com o ConectaEntregas.
          </p>
        </div>
        <button className="btn-primary" style={{marginTop: 20}} onClick={() => signOut(auth)}>SAIR</button>
      </div>
    </div>
  );

  if (user && erroSolicitacao === 'falha') return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade" style={{textAlign: 'center'}}>
        <div className="auth-header">
          <div className="auth-logo">📡</div>
          <h1 className="auth-title">Falha na solicitação</h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8, lineHeight: 1.5}}>
            Não consegui enviar seu pedido de aprovação (banco recusou).<br />
            Avise o administrador para publicar as regras novas no Firebase e toque em tentar de novo.
          </p>
        </div>
        <button className="btn-primary" style={{marginTop: 20}} onClick={() => { setErroSolicitacao(null); window.location.reload(); }}>TENTAR DE NOVO</button>
        <div className="auth-toggle" style={{marginTop: 12}}>
          <span onClick={() => signOut(auth)}>Sair da conta</span>
        </div>
      </div>
    </div>
  );

  if (user && !perfilCarregando && !temPerfil) {
    // Cadastro aprovado com perfil em restauracao: NUNCA mostra o formulario de cadastro
    if (dadosAprov) return <div className="loading">Restaurando seu cadastro...</div>;
    return <CompletarCadastro user={user} dados={dadosAprov} />;
  }

  return <ErrorBoundary>{user ? <Dashboard user={user} versao={APP_VERSAO} /> : <Auth onAuth={setUser} versao={APP_VERSAO} />}</ErrorBoundary>;
}

export default App;
