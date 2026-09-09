import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get, onValue, set } from 'firebase/database';
import { auth, db } from './firebase';
import Auth from './Auth';
import Dashboard from './Dashboard';
import './App.css';

// Versao deste APK. Ao publicar versao nova: aumente aqui, gere o APK e copie para docs/apk/
export const APP_VERSAO = '1.1.0';
const URL_APK = 'https://marcostheangels.github.io/sistema-entregas/apk/App-Entregador.apk';

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

// Tela de bloqueio: versao antiga e obrigada a atualizar (APK direto do site, sem Play Store)
function AtualizacaoObrigatoria({ atual, minima }) {
  return (
    <div className="login-container">
      <div className="login-card" style={{textAlign: 'center'}}>
        <div style={{fontSize: '3rem', marginBottom: 12}}>🚨</div>
        <h1>Atualização obrigatória</h1>
        <p>
          Seu app está na versão <strong>{atual}</strong> e a mínima agora é a <strong>{minima}</strong>.<br />
          Atualize para continuar trabalhando — é rápido e não perde seus dados.
        </p>
        <a
          href={URL_APK}
          style={{display: 'block', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff',
                  borderRadius: 12, padding: '14px', fontFamily: 'Archivo, sans-serif', fontWeight: 800,
                  fontSize: '0.9rem', letterSpacing: '0.05em', textDecoration: 'none', marginTop: 8}}
        >
          ⬇️ BAIXAR ATUALIZAÇÃO
        </a>
        <p style={{fontSize: '0.72rem', marginTop: 12, lineHeight: 1.6}}>
          Baixou? Toque no arquivo e confirme a instalação.<br />
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
    setLoading(true);
    try {
      await set(ref(db, `entregadores/${user.uid}`), {
        nome,
        email: user.email,
        telefone: telefone.replace(/\D/g, ''),
        cpf: cpf.replace(/\D/g, ''),
        veiculo,
        placa: placa.toUpperCase(),
        endereco,
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
  const [versaoMinima, setVersaoMinima] = useState(null);

  // Versao minima definida pelo Master: app antigo se auto-bloqueia
  useEffect(() => {
    if (!user) { setVersaoMinima(null); return; }
    const unsub = onValue(ref(db, 'config/versaoMinima'), snap => setVersaoMinima(snap.val()?.app || null), () => {});
    return unsub;
  }, [user]);

  useEffect(() => {
    let unsubAprov = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setPerfilCarregando(true);
      if (unsubAprov) { unsubAprov(); unsubAprov = null; }
      if (!u) { setAprovado(null); setLoading(false); return; }
      setLoading(true);
      // Escuta a aprovacao EM TEMPO REAL: quando o admin aprovar, o app libera sozinho aqui mesmo
      unsubAprov = onValue(ref(db, `aprovacoes/${u.uid}`), s => {
        if (s.exists()) { setAprovado(s.val().aprovado === true); setDadosAprov(s.val()); }
        else setAprovado(null);
        setLoading(false);
      }, () => { setAprovado(null); setLoading(false); });
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

  if (loading) return <div className="loading">Carregando...</div>;

  if (user && versaoMinima && versaoMenorQue(APP_VERSAO, versaoMinima)) return <AtualizacaoObrigatoria atual={APP_VERSAO} minima={versaoMinima} />;

  if (user && aprovado === false) return <AguardandoAprovacao user={user} />;

  if (user && !perfilCarregando && !temPerfil) return <CompletarCadastro user={user} dados={dadosAprov} />;

  return user ? <Dashboard user={user} /> : <Auth onAuth={setUser} />;
}

export default App;
