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

// Comprime imagem no navegador (max 1024px, JPEG 0.7) para caber no banco sem estourar
const processarArquivoDoc = (file) => new Promise((resolve, reject) => {
  const MAX_BYTES = 1.5 * 1024 * 1024;
  if (file.size > 6 * 1024 * 1024) { reject(new Error('Arquivo muito grande (máx 6MB).')); return; }
  const reader = new FileReader();
  reader.onload = () => {
    if (!file.type.startsWith('image/')) {
      if (file.size > MAX_BYTES) { reject(new Error('PDF muito grande (máx 1,5MB). Tire um print/foto.')); return; }
      resolve({ nome: file.name, tipo: file.type || 'application/pdf', dados: reader.result });
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const MAX = 1024;
        let { width: w, height: h } = img;
        const escala = Math.min(1, MAX / Math.max(w, h));
        w = Math.round(w * escala); h = Math.round(h * escala);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dados = canvas.toDataURL('image/jpeg', 0.7);
        if (dados.length > 2 * 1024 * 1024) { reject(new Error('Imagem ainda muito grande. Tente uma foto mais simples.')); return; }
        resolve({ nome: file.name, tipo: 'image/jpeg', dados });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    img.src = reader.result;
  };
  reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
  reader.readAsDataURL(file);
});

const ROTULOS_DOCS_EMPRESA = {
  cnpj: '🧾 Cartão CNPJ / Comprovante CNPJ',
  identidade: '🪪 Identidade do responsável (RG/CNH)',
  comprovante: '🏠 Comprovante de endereço da empresa',
  contrato: '📄 Contrato social / Alvará (opcional)'
};

const formatarCnpj = (v) => {
  const n = v.replace(/\D/g, '').slice(0, 14);
  if (n.length <= 2) return n;
  if (n.length <= 5) return `${n.slice(0,2)}.${n.slice(2)}`;
  if (n.length <= 8) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5)}`;
  if (n.length <= 12) return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8)}`;
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`;
};

function Login({ onAuth }) {
  const [isCadastro, setIsCadastro] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [docs, setDocs] = useState({ cnpj: null, identidade: null, comprovante: null, contrato: null });
  const [erroDoc, setErroDoc] = useState('');
  const [erro, setErro] = useState('');
  const [msgRecuperacao, setMsgRecuperacao] = useState('');
  const [loading, setLoading] = useState(false);

  const escolherDoc = async (chave, file) => {
    if (!file) return;
    setErroDoc('');
    try {
      const doc = await processarArquivoDoc(file);
      setDocs(d => ({ ...d, [chave]: doc }));
    } catch (e) {
      setErroDoc('❌ ' + (e.message || 'Erro no arquivo.'));
    }
  };

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
            } catch {
              // Senha nao bate com a conta ja existente: aviso claro em vez de "senha incorreta"
              throw { code: 'auth/email-ja-cadastrado-outra-senha' };
            }
          } else {
            throw errCadastro;
          }
        }
        const documentos = {};
        Object.entries(docs).forEach(([k, v]) => { if (v) documentos[k] = v; });
        await set(ref(db, `empresas/${cred.user.uid}`), {
          nome: nome.trim(), email,
          telefone: telefone.replace(/\D/g, ''),
          endereco, cnpj: cnpj.replace(/\D/g, ''), responsavel: responsavel.trim(),
          documentos, createdAt: Date.now()
        });
        await set(ref(db, `aprovacoes/${cred.user.uid}`), {
          tipo: 'empresa', nome: nome.trim(), email,
          telefone: telefone.replace(/\D/g, ''),
          endereco, cnpj: cnpj.replace(/\D/g, ''), responsavel: responsavel.trim(),
          documentos,
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
              <input type="text" placeholder="CNPJ (00.000.000/0000-00)" value={cnpj} onChange={e=>setCnpj(formatarCnpj(e.target.value))} maxLength={18} />
              <input type="text" placeholder="Responsável (nome + RG/CPF)" value={responsavel} onChange={e=>setResponsavel(e.target.value)} />
              <input type="tel" placeholder="Telefone (WhatsApp) *" value={telefone} onChange={e=>setTelefone(e.target.value)} required />
              <input type="text" placeholder="Endereço" value={endereco} onChange={e=>setEndereco(e.target.value)} />
              <div style={{background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: 10, padding: 12, marginTop: 4, textAlign: 'left'}}>
                <div style={{fontSize: '0.78rem', fontWeight: 800, color: '#334155', marginBottom: 4}}>📎 DOCUMENTOS DA EMPRESA (foto ou PDF)</div>
                <div style={{fontSize: '0.7rem', color: '#64748b', marginBottom: 10, lineHeight: 1.5}}>
                  Anexe para agilizar sua aprovação pelo administrador.
                </div>
                {Object.entries(ROTULOS_DOCS_EMPRESA).map(([chave, rotulo]) => (
                  <div key={chave} style={{marginBottom: 10}}>
                    <label style={{display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4}}>
                      {rotulo} {docs[chave] ? '✅' : ''}
                    </label>
                    <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                      <label style={{flex: 1, display: 'block', textAlign: 'center', background: docs[chave] ? '#dcfce7' : '#fff',
                                      border: docs[chave] ? '1px solid #16a34a' : '1px solid #cbd5e1',
                                      color: docs[chave] ? '#15803d' : '#334155',
                                      borderRadius: 8, padding: '10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'}}>
                        {docs[chave] ? `📄 ${String(docs[chave].nome).slice(0, 22)} — trocar` : '📤 Escolher arquivo'}
                        <input type="file" accept="image/*,.pdf" style={{display: 'none'}}
                          onChange={(e) => { escolherDoc(chave, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      {docs[chave] && (
                        <button type="button" onClick={() => setDocs(d => ({ ...d, [chave]: null }))}
                          style={{background: '#fff', border: '1px solid #cbd5e1', color: '#64748b', borderRadius: 8, padding: '8px 10px', cursor: 'pointer'}}>✕</button>
                      )}
                    </div>
                    {docs[chave]?.tipo?.startsWith('image/') && (
                      <img src={docs[chave].dados} alt={rotulo} style={{width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: '1px solid #cbd5e1'}} />
                    )}
                  </div>
                ))}
                {erroDoc && <div style={{fontSize: '0.75rem', color: '#dc2626'}}>{erroDoc}</div>}
              </div>
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
