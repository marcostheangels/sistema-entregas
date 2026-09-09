import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { ref, get, set, onValue, update, onDisconnect } from 'firebase/database';
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
  const [msgRecuperacao, setMsgRecuperacao] = useState('');
  const [loading, setLoading] = useState(false);

  const enviarRecuperacao = async () => {
    setErro('');
    setMsgRecuperacao('');
    if (!email.trim()) { setMsgRecuperacao('⚠️ Digite seu e-mail acima primeiro.'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsgRecuperacao('📧 Link de redefinição enviado! Abra o e-mail (veja também o spam) e crie uma nova senha.');
    } catch (err) {
      setMsgRecuperacao(err.code === 'auth/user-not-found'
        ? 'Nenhuma conta encontrada com este e-mail.'
        : 'Erro ao enviar: ' + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      if (isCadastro) {
        if (!nome.trim()) { setErro('Informe o nome da empresa.'); setLoading(false); return; }
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(auth, email, senha);
        } catch (errCadastro) {
          if (errCadastro.code === 'auth/email-already-in-use') {
            // E-mail ja existe no Firebase Auth (ex.: cadastro anterior apagado no reset):
            // entra com a senha informada e reaproveita a conta
            try {
              cred = await signInWithEmailAndPassword(auth, email, senha);
            } catch (errLogin) {
              // Senha nao bate com a conta ja existente: aviso claro em vez de "senha incorreta"
              throw { code: 'auth/email-ja-cadastrado-outra-senha' };
            }
          } else {
            throw errCadastro;
          }
        }
        await set(ref(db, `empresas/${cred.user.uid}`), {
          nome: nome.trim(), email,
          telefone: telefone.replace(/\D/g, ''),
          endereco, createdAt: Date.now()
        });
        await set(ref(db, `aprovacoes/${cred.user.uid}`), {
          tipo: 'empresa', nome: nome.trim(), email,
          telefone: telefone.replace(/\D/g, ''),
          endereco,
          aprovado: false, criadoPor: cred.user.uid, criadoEm: Date.now()
        });
        onAuth(cred.user);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, senha);
        // Login cruzado: conta de ENTREGADOR (ou outro tipo) nao entra no painel da empresa
        try {
          const a = await get(ref(db, `aprovacoes/${cred.user.uid}`));
          const tipo = a.val()?.tipo;
          if (tipo && tipo !== 'empresa') {
            await signOut(auth);
            throw { code: 'conta-nao-empresa' };
          }
        } catch (errTipo) {
          if (errTipo.code === 'conta-nao-empresa') throw errTipo;
          // leitura falhou: deixa o listener do App bloquear
        }
        onAuth(cred.user);
      }
    } catch (err) {
      const map = {
        'auth/email-already-in-use': 'Este e-mail já tem conta com outra senha diferente da informada.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
        'auth/user-not-found': 'E-mail ou senha incorretos.',
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/email-ja-cadastrado-outra-senha': '⚠️ Este e-mail JÁ está cadastrado com uma senha diferente. Faça LOGIN com a senha antiga ou clique em "Esqueci minha senha" para redefinir e depois complete o cadastro.',
        'conta-nao-empresa': '⚠️ Esta conta é de ENTREGADOR. Use o aplicativo ConectaEntregas Entregador — este painel é só para empresas.'
      };
      setErro(map[err.code] || 'Erro ao entrar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={`${import.meta.env.BASE_URL}logo-256.png`} alt="ConectaEntregas" style={{width:'96px', height:'96px', marginBottom:'1rem', borderRadius:'20px'}} />
        <h1>ConectaEntregas Empresas</h1>
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
        {msgRecuperacao && <div style={{color:'#10b981', fontSize:'0.78rem', marginTop:'10px', lineHeight:1.5}}>{msgRecuperacao}</div>}
        {!isCadastro && (
          <div onClick={enviarRecuperacao} style={{marginTop:'10px', fontSize:'0.8rem', color:'#818cf8', cursor:'pointer', fontWeight:600}}>
            Esqueci minha senha
          </div>
        )}
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
  const [aprovado, setAprovado] = useState(false); // so entra com aprovacao explicita do admin
  const [recusado, setRecusado] = useState(false); // cadastro excluido/recusado pelo Master
  const [contaErrada, setContaErrada] = useState(false); // conta de entregador tentando o painel da empresa

  useEffect(() => {
    let unsubAprov = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (unsubAprov) { unsubAprov(); unsubAprov = null; }
      if (!u) { setAprovado(false); setContaErrada(false); setInitializing(false); return; }
      // Escuta o registro de aprovacao; se nao existir (cadastro antigo/resetado), cria a solicitacao
      unsubAprov = onValue(ref(db, `aprovacoes/${u.uid}`), s => {
        // Login cruzado: conta de entregador NUNCA entra aqui nem cria solicitacao de empresa
        if (s.exists() && s.val().tipo === 'entregador') { setContaErrada(true); setAprovado(false); setInitializing(false); return; }
        if (!s.exists()) {
          // Nao cria solicitacao para a conta de administrador
          get(ref(db, `admin/${u.uid}`)).then(adm => {
            if (adm.val() !== true) {
              // Cadastro recusado pelo Master: NAO recria a solicitacao
              return get(ref(db, `recusados/${u.uid}`)).then(rec => {
                if (rec.val()) { setRecusado(true); return null; }
                // Perfil de ENTREGADOR existe: e conta de entregador, nao cria e bloqueia
                return get(ref(db, `entregadores/${u.uid}`)).then(ent => {
                  if (ent.exists()) { setContaErrada(true); return null; }
                  return get(ref(db, `empresas/${u.uid}`)).then(perf => {
                    return set(ref(db, `aprovacoes/${u.uid}`), {
                      tipo: 'empresa', nome: perf.val()?.nome || u.email, email: u.email,
                      aprovado: false, criadoPor: u.uid, criadoEm: Date.now()
                    });
                  });
                });
              });
            }
          }).catch(() => {});
          setAprovado(false);
        } else {
          setAprovado(s.val().aprovado === true);
          setRecusado(false);
        }
        setInitializing(false);
      }, () => { setAprovado(false); setInitializing(false); });
    });
    return () => { unsub(); if (unsubAprov) unsubAprov(); };
  }, []);

  // Presenca: avisa ao Master que esta empresa esta usando o painel agora (some sozinha ao fechar)
  useEffect(() => {
    if (!user || !aprovado) return;
    const presencaRef = ref(db, `presenca/${user.uid}`);
    set(presencaRef, { online: true, email: user.email, ultimoAviso: Date.now() }).catch(() => {});
    onDisconnect(presencaRef).remove().catch(() => {});
    const t = setInterval(() => {
      update(presencaRef, { ultimoAviso: Date.now() }).catch(() => {});
      onDisconnect(presencaRef).remove().catch(() => {});
    }, 30000);
    return () => {
      clearInterval(t);
      set(presencaRef, null).catch(() => {});
    };
  }, [user, aprovado]);

  if (initializing) return <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Iniciando...</div>;

  if (user && recusado) return (
    <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a', padding:20}}>
      <div style={{maxWidth:420, textAlign:'center', background:'#1e293b', border:'1px solid #334155', borderRadius:16, padding:'32px 24px'}}>
        <div style={{fontSize:44}}>⛔</div>
        <h2 style={{color:'#f87171', margin:'12px 0'}}>Cadastro recusado</h2>
        <p style={{color:'#94a3b8', fontSize:'0.9rem', lineHeight:1.5}}>
          Este cadastro foi recusado pelo administrador. Se foi um engano, entre em contato conosco para resolver.
        </p>
        <button
          onClick={() => signOut(auth)}
          style={{marginTop:18, padding:'10px 28px', borderRadius:10, border:'none', background:'#6366f1', color:'white', fontWeight:700, cursor:'pointer'}}
        >SAIR</button>
      </div>
    </div>
  );

  if (user && contaErrada) return (
    <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a', padding:20}}>
      <div style={{maxWidth:420, textAlign:'center', background:'#1e293b', border:'1px solid #334155', borderRadius:16, padding:'32px 24px'}}>
        <div style={{fontSize:44}}>🛵</div>
        <h2 style={{color:'#f87171', margin:'12px 0'}}>Conta incorreta</h2>
        <p style={{color:'#94a3b8', fontSize:'0.9rem', lineHeight:1.5}}>
          Esta conta é de <strong>ENTREGADOR</strong> e não pode acessar o painel da empresa.<br /><br />
          Use o aplicativo <strong>ConectaEntregas Entregador</strong> no celular.
        </p>
        <button
          onClick={() => signOut(auth)}
          style={{marginTop:18, padding:'10px 28px', borderRadius:10, border:'none', background:'#6366f1', color:'white', fontWeight:700, cursor:'pointer'}}
        >SAIR</button>
      </div>
    </div>
  );

  if (user && !aprovado) return <AguardandoAprovacao user={user} onSair={() => signOut(auth)} />;

  return user ? <Dashboard user={user} /> : <Login onAuth={setUser} />;
}

export default App;
