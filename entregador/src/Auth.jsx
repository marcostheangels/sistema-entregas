import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail, signOut, deleteUser } from 'firebase/auth';
import { ref, set, get, remove } from 'firebase/database';
import { Device } from '@capacitor/device';
import { auth, db } from './firebase';

// Login cruzado: conta de EMPRESA (ou outro tipo) nao entra no app do entregador.
// Desloga na hora e devolve uma mensagem explicativa.
const verificarTipoConta = async (uid) => {
  try {
    const a = await get(ref(db, `aprovacoes/${uid}`));
    const tipo = a.val()?.tipo;
    if (tipo && tipo !== 'entregador') return tipo;
  } catch { /* se falhar a leitura, deixa o App.jsx bloquear pelo listener */ }
  return null;
};

// CPF valido de verdade (digitos verificadores; rejeita 000..., 111... etc.)
export const cpfValido = (cpf) => {
  const n = String(cpf || '').replace(/\D/g, '');
  if (n.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(n)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(n[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(n[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(n[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(n[10]);
};

// Identificador estavel do aparelho (sobrevive a reinstalacao no Android).
// Usado no bloqueio do Master: aparelho banido nao cria cadastro novo.
export const obterIdDispositivo = async () => {
  try {
    const r = await Device.getId();
    if (r?.identifier) return 'native:' + String(r.identifier).replace(/[.$#[\]/]/g, '_');
  } catch { /* cai no fallback */ }
  let id = null;
  try { id = localStorage.getItem('ga_device_id'); } catch { /* sem storage */ }
  if (!id) {
    id = 'web:' + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
    try { localStorage.setItem('ga_device_id', id); } catch { /* sem storage */ }
  }
  return id;
};

const chaveEmailBan = (e) => String(e || '').trim().toLowerCase().replace(/\./g, ',');

// Procura o aparelho, CPF, telefone ou e-mail na lista de banidos do Master.
// Devolve o registro do ban (com o motivo) ou null.
export const verificarBanimento = async ({ cpfNums, telNums, email, dispositivo }) => {
  const leituras = [];
  if (dispositivo) leituras.push(get(ref(db, `banidosDispositivos/${dispositivo}`)));
  if (cpfNums) leituras.push(get(ref(db, `banidosCpf/${cpfNums}`)));
  if (telNums) leituras.push(get(ref(db, `banidosTelefone/${telNums}`)));
  if (email) leituras.push(get(ref(db, `banidosEmail/${chaveEmailBan(email)}`)));
  if (!leituras.length) return null;
  const resultados = await Promise.all(leituras);
  for (const r of resultados) {
    const banUid = r.val()?.uid;
    if (banUid) {
      try {
        const snap = await get(ref(db, `banidos/${banUid}`));
        if (snap.exists()) return snap.val();
      } catch { /* sem leitura: bloqueia com motivo generico */ }
      return { motivo: '' };
    }
  }
  return null;
};

// Comprime imagem no navegador (max 1024px, JPEG 0.7) para caber no banco sem estourar
const processarArquivoDoc = (file) => new Promise((resolve, reject) => {
  const MAX_BYTES = 1.5 * 1024 * 1024;
  if (file.size > 6 * 1024 * 1024) { reject(new Error('Arquivo muito grande (máx 6MB).')); return; }
  const reader = new FileReader();
  reader.onload = () => {
    // PDF ou não-imagem: salva direto como base64 (se couber)
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

const ROTULOS_DOCS_ENTREGADOR = {
  cnh: '🪪 CNH',
  docMoto: '🏍️ Documento da moto (CRLV)',
  comprovante: '🏠 Comprovante de residência',
  antecedentes: '📋 Antecedentes criminais'
};

export default function Auth({ onAuth, versao }) {
  const [isLogin, setIsLogin] = useState(true);
  // "Lembrar meus dados": preenche e-mail/senha salvos no aparelho
  const [email, setEmail] = useState(() => {
    try { return (localStorage.getItem('ga_lembrar') !== '0' ? localStorage.getItem('ga_email') : '') || ''; }
    catch { return ''; }
  });
  const [senha, setSenha] = useState(() => {
    try { return (localStorage.getItem('ga_lembrar') !== '0' ? localStorage.getItem('ga_senha') : '') || ''; }
    catch { return ''; }
  });
  const [lembrar, setLembrar] = useState(() => {
    try { return localStorage.getItem('ga_lembrar') !== '0'; }
    catch { return true; }
  });
  const [msgRecuperacao, setMsgRecuperacao] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [placa, setPlaca] = useState('');
  const [endereco, setEndereco] = useState('');
  const [docs, setDocs] = useState({ cnh: null, docMoto: null, comprovante: null, antecedentes: null });
  const [erroDoc, setErroDoc] = useState('');
  const [error, setError] = useState('');
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

  const formatarCpf = (valor) => {
    const nums = valor.replace(/\D/g, '');
    if (nums.length <= 3) return nums;
    if (nums.length <= 6) return `${nums.slice(0,3)}.${nums.slice(3)}`;
    if (nums.length <= 9) return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6)}`;
    return `${nums.slice(0,3)}.${nums.slice(3,6)}.${nums.slice(6,9)}-${nums.slice(9,11)}`;
  };

  const formatarPlaca = (valor) => {
    return valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  };

  // ===== Validação campo a campo (vermelho + mensagem do que está errado) =====
  const [erros, setErros] = useState({}); // { campo: 'mensagem' }
  const [avisos, setAvisos] = useState({}); // { campo: 'mensagem' } (amarelo, não bloqueia)
  const [tocados, setTocados] = useState({});

  const validarCampo = (campo, valores) => {
    const v = valores[campo] ?? '';
    switch (campo) {
      case 'nome':
        if (!String(v).trim()) return 'Informe seu nome completo.';
        if (String(v).trim().length < 5) return 'Nome muito curto — digite o nome completo.';
        return '';
      case 'cpf': {
        const n = String(v).replace(/\D/g, '');
        if (!n) return 'Informe seu CPF.';
        if (n.length !== 11) return 'CPF incompleto — são 11 números.';
        if (!cpfValido(n)) return 'CPF inválido — confira os números digitados.';
        return '';
      }
      case 'telefone': {
        const n = String(v).replace(/\D/g, '');
        if (!n) return 'Informe seu telefone (WhatsApp).';
        if (n.length < 10) return 'Telefone incompleto — use DDD + número (ex.: 38 99999-0000).';
        return '';
      }
      case 'email':
        if (!String(v).trim()) return 'Informe seu e-mail.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim())) return 'E-mail inválido — ex.: voce@email.com.';
        return '';
      case 'senha':
        if (!v) return 'Informe sua senha.';
        if (String(v).length < 6) return 'Senha fraca — mínimo 6 caracteres.';
        return '';
      default: return '';
    }
  };

  const validarAoSair = (campo, valor) => {
    setTocados(p => ({ ...p, [campo]: true }));
    setErros(p => ({ ...p, [campo]: validarCampo(campo, { [campo]: valor }) }));
  };

  const limparSeOk = (campo, valor) => {
    if (!tocados[campo]) return;
    const msg = validarCampo(campo, { [campo]: valor });
    setErros(p => ({ ...p, [campo]: msg }));
  };

  const classeInput = (campo) => `auth-input${erros[campo] ? ' erro' : ''}`;

  const enviarRecuperacao = async () => {
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
    setError('');
    setLoading(true);

    try {
      // Credenciais para o servico nativo de GPS se autenticar no Firebase (seguranca do banco)
      try {
        localStorage.setItem('ga_email', email);
        localStorage.setItem('ga_senha', senha);
        localStorage.setItem('ga_lembrar', lembrar ? '1' : '0');
      } catch { /* sem storage */ }

      if (isLogin) {
        // Valida formato antes de chamar o servidor (vermelho no campo errado)
        const errLogin = {
          email: validarCampo('email', { email }),
          senha: senha ? '' : 'Informe sua senha.'
        };
        setErros(errLogin);
        setTocados({ email: true, senha: true });
        if (errLogin.email || errLogin.senha) {
          setError('⚠️ Confira os campos marcados em vermelho.');
          setLoading(false);
          return;
        }
        const cred = await signInWithEmailAndPassword(auth, email.trim(), senha);
        // Bloqueia conta de empresa/outra origem ANTES de qualquer coisa
        const tipoBloqueado = await verificarTipoConta(cred.user.uid);
        if (tipoBloqueado) {
          await signOut(auth);
          setError(tipoBloqueado === 'empresa'
            ? '⚠️ Esta conta é de EMPRESA. Use o painel ConectaEntregas Empresas no navegador — este aplicativo é só para entregadores.'
            : '⚠️ Esta conta não é de entregador.');
          return;
        }
        // Auto-reparo: se o perfil foi apagado (ex.: reset pelo admin), recria a partir da aprovacao.
        // Banido pelo Master: NAO recria nada (o App mostra o motivo).
        try {
          const p = await get(ref(db, `entregadores/${cred.user.uid}`));
          if (!p.exists()) {
            const [snapBan, snapRec] = await Promise.all([
              get(ref(db, `banidos/${cred.user.uid}`)).catch(() => ({ exists: () => false })),
              get(ref(db, `recusados/${cred.user.uid}`)).catch(() => ({ exists: () => false }))
            ]);
            if (snapBan.exists() || snapRec.exists()) { onAuth(cred.user); return; }
            const a = await get(ref(db, `aprovacoes/${cred.user.uid}`));
            const d = a.val() || {};
            await set(ref(db, `entregadores/${cred.user.uid}`), {
              nome: d.nome || cred.user.displayName || email.split('@')[0],
              email: d.email || email,
              telefone: d.telefone || '',
              cpf: d.cpf || '',
              veiculo: d.veiculo || '',
              placa: (d.placa || '').toUpperCase(),
              endereco: d.endereco || '',
              documentos: d.documentos || {},
              status: 'disponivel',
              createdAt: Date.now()
            });
          }
        } catch { /* segue mesmo se nao conseguir reparar */ }
        onAuth(cred.user);
      } else {
        // Valida TODOS os campos de uma vez (vermelho em cada um que estiver errado)
        const campos = { nome, cpf, telefone, email, senha };
        const novosErros = {};
        Object.keys(campos).forEach(c => { novosErros[c] = validarCampo(c, campos); });
        setErros(novosErros);
        setAvisos({});
        setTocados({ nome: true, cpf: true, telefone: true, email: true, senha: true });
        if (Object.values(novosErros).some(Boolean)) {
          setError('⚠️ Confira os campos marcados em vermelho e corrija.');
          setLoading(false);
          return;
        }
        const cpfNums = cpf.replace(/\D/g, '');

        let cred;
        try {
          cred = await createUserWithEmailAndPassword(auth, email, senha);
        } catch (errCadastro) {
          if (errCadastro.code === 'auth/email-already-in-use') {
            // E-mail ja existe no Firebase Auth (ex.: cadastro anterior apagado no reset):
            // entra com a senha informada e reaproveita a conta
            cred = await signInWithEmailAndPassword(auth, email, senha);
            // Bloqueia conta de empresa/outra origem reutilizada no cadastro
            const tipoBloqueado = await verificarTipoConta(cred.user.uid);
            if (tipoBloqueado) {
              await signOut(auth);
              setError(tipoBloqueado === 'empresa'
                ? '⚠️ Este e-mail já é uma conta de EMPRESA. Use o painel ConectaEntregas Empresas no navegador — este aplicativo é só para entregadores.'
                : '⚠️ Este e-mail já tem uma conta que não é de entregador.');
              return;
            }
          } else {
            throw errCadastro;
          }
        }

        // Bloqueio do Master: aparelho, CPF, telefone ou e-mail banidos
        // NAO criam cadastro novo — mostra o motivo e sai (vale p/ qualquer dado novo)
        const dispositivo = await obterIdDispositivo().catch(() => '');
        const ban = await verificarBanimento({
          cpfNums, telNums: telefone.replace(/\D/g, ''), email, dispositivo
        }).catch(() => null);
        if (ban) {
          try {
            await remove(ref(db, `entregadores/${cred.user.uid}`)).catch(() => {});
            await remove(ref(db, `aprovacoes/${cred.user.uid}`)).catch(() => {});
          } catch { /* segue para apagar a conta */ }
          try { await deleteUser(cred.user); } catch { try { await signOut(auth); } catch { /* sem sessao */ } }
          setError(`⛔ Cadastro bloqueado pelo administrador.${ban.motivo ? `\nMotivo: ${ban.motivo}` : '\nFale com o ConectaEntregas para resolver.'}`);
          setLoading(false);
          return;
        }

        // Duplicados: mesmo CPF ou e-mail em OUTRA conta (marca de vermelho e explica)
        const emailNorm = email.trim().toLowerCase();
        const telNums = telefone.replace(/\D/g, '');
        const nomeNorm = nome.trim().toLowerCase();
        let dupCpf = false, dupEmail = false, nomeDup = false;
        try {
          const snapEnt = await get(ref(db, 'entregadores')).catch(() => ({ val: () => null }));
          Object.entries(snapEnt.val() || {}).forEach(([uid, r]) => {
            if (uid === cred.user.uid || !r) return;
            if (cpfNums && r.cpf && String(r.cpf).replace(/\D/g, '') === cpfNums) dupCpf = true;
            if (emailNorm && String(r.email || '').trim().toLowerCase() === emailNorm) dupEmail = true;
            if (nomeNorm && String(r.nome || '').trim().toLowerCase() === nomeNorm) nomeDup = true;
          });
        } catch { /* sem leitura: segue sem a checagem */ }
        if (dupCpf || dupEmail) {
          try { await deleteUser(cred.user); } catch { try { await signOut(auth); } catch { /* sem sessao */ } }
          const novos = {};
          if (dupCpf) novos.cpf = 'Este CPF já está cadastrado em outra conta — use seus dados ou recupere a conta antiga.';
          if (dupEmail) novos.email = 'Este e-mail já está em uso por outra conta — faça login ou use outro e-mail.';
          setErros(p => ({ ...p, ...novos }));
          setTocados(p => ({ ...p, cpf: true, email: true }));
          setError(`🔴 Dado repetido: ${dupCpf ? 'CPF' : ''}${dupCpf && dupEmail ? ' e ' : ''}${dupEmail ? 'e-mail' : ''} já cadastrado em outra conta. Corrija o campo em vermelho.`);
          setLoading(false);
          return;
        }
        if (nomeDup) {
          setAvisos({ nome: 'Já existe outro cadastro com este nome — se for você, entre com seu e-mail antigo.' });
        }

        await updateProfile(cred.user, { displayName: nome });

        // Documentos anexados (fotos comprimidas em base64 — o Master vê no painel)
        const documentos = {};
        Object.entries(docs).forEach(([k, v]) => { if (v) documentos[k] = v; });

        await set(ref(db, `entregadores/${cred.user.uid}`), {
          nome,
          email,
          telefone: telefone.replace(/\D/g, ''),
          cpf: cpfNums,
          veiculo,
          placa: placa.toUpperCase(),
          endereco,
          documentos,
          dispositivo,
          status: 'disponivel',
          createdAt: Date.now()
        });

        // Solicitação de aprovação para o administrador (com todos os dados do cadastro)
        const pedidoFull = {
          tipo: 'entregador', nome, email,
          telefone: telefone.replace(/\D/g, ''),
          cpf: cpfNums,
          veiculo,
          placa: placa.toUpperCase(),
          endereco,
          documentos,
          dispositivo,
          aprovado: false, criadoPor: cred.user.uid, criadoEm: Date.now()
        };
        // Pedido mínimo (sem os campos novos) — garante que o Master veja a
        // solicitação mesmo se as regras do banco ainda forem as antigas
        const { documentos: _docsFora, dispositivo: _devFora, ...pedidoMinimo } = pedidoFull;
        try {
          await set(ref(db, `aprovacoes/${cred.user.uid}`), pedidoFull);
        } catch {
          await set(ref(db, `aprovacoes/${cred.user.uid}`), pedidoMinimo);
        }

        // Confirma que o pedido de aprovação foi GRAVADO de verdade.
        // Sem essa checagem, se o banco negasse o pedido o app liberava direto (bug).
        const conf = await get(ref(db, `aprovacoes/${cred.user.uid}`));
        if (!conf.exists()) throw { code: 'aprovacao-nao-gravada' };

        // Marca "cadastro fresco nesta sessão": o App NÃO mostra o Dashboard
        // nem por 1 segundo até o bloqueio de "aguardando aprovação" carregar.
        try { sessionStorage.setItem('ga_fresh_register', cred.user.uid); } catch { /* sem storage */ }
        onAuth(cred.user);
      }
    } catch (err) {
      console.error("Erro Auth:", err.code, err.message);

      // Falha ao gravar o pedido de aprovação (quase sempre: regras do banco
      // desatualizadas no Console do Firebase): desfaz o perfil, desloga e
      // explica — NUNCA libera o app sem aprovação.
      if (err.code === 'aprovacao-nao-gravada' || String(err.message || '').includes('PERMISSION_DENIED')) {
        try {
          const uid = auth.currentUser?.uid;
          if (uid) {
            await remove(ref(db, `entregadores/${uid}`)).catch(() => {});
            await remove(ref(db, `aprovacoes/${uid}`)).catch(() => {});
          }
        } catch { /* segue para o deslogar */ }
        try { await signOut(auth); } catch { /* sem sessao */ }
        setError('⚠️ Não consegui enviar seu pedido de aprovação (banco recusou a gravação). ' +
          'Avise o administrador: ele precisa PUBLICAR as regras novas (firebase-rules.json) ' +
          'no Console do Firebase → Realtime Database → Rules. Depois tente cadastrar de novo.');
        return;
      }

      // Tradução de erros comuns do Firebase para o usuário (marca os campos de vermelho)
      switch (err.code) {
        case 'auth/email-already-in-use':
          setErros(p => ({ ...p, email: 'Este e-mail já tem conta — faça login ou use outro e-mail.' }));
          setTocados(p => ({ ...p, email: true }));
          setError('🔴 Este e-mail já está cadastrado. Se é seu, clique em "Faça Login".');
          break;
        case 'auth/invalid-email':
          setErros(p => ({ ...p, email: 'E-mail inválido — ex.: voce@email.com.' }));
          setTocados(p => ({ ...p, email: true }));
          setError('🔴 Confira o e-mail marcado em vermelho.');
          break;
        case 'auth/weak-password':
          setErros(p => ({ ...p, senha: 'Senha fraca — mínimo 6 caracteres.' }));
          setTocados(p => ({ ...p, senha: true }));
          setError('🔴 Escolha uma senha maior (campo vermelho).');
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setErros(p => ({ ...p, email: 'Verifique este e-mail.', senha: 'Verifique sua senha.' }));
          setTocados(p => ({ ...p, email: true, senha: true }));
          setError('🔴 E-mail ou senha incorretos — confira os campos em vermelho.');
          break;
        default:
          setError('Erro ao processar: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card animate-fade">
        <div className="auth-header">
          <div className="auth-logo"><img src={`${import.meta.env.BASE_URL}logo-192.png`} alt="ConectaEntregas" /></div>
          <h1 className="auth-title">{isLogin ? 'Bem-vindo de volta!' : 'Faça parte da rede'}</h1>
          <p style={{color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8}}>
            {isLogin ? 'Entre com sua conta para ver entregas' : 'Cadastre-se para começar a entregar'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div className="input-group">
                <label>NOME COMPLETO *</label>
                <input
                  className={classeInput('nome')}
                  type="text"
                  placeholder="Ex: João Silva"
                  value={nome}
                  onChange={(e) => { setNome(e.target.value); limparSeOk('nome', e.target.value); }}
                  onBlur={(e) => validarAoSair('nome', e.target.value)}
                  required
                />
                {erros.nome && <span className="campo-erro">🔴 {erros.nome}</span>}
                {avisos.nome && <span className="campo-aviso">🟡 {avisos.nome}</span>}
              </div>
              <div className="input-group">
                <label>CPF *</label>
                <input
                  className={classeInput('cpf')}
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => { setCpf(formatarCpf(e.target.value)); limparSeOk('cpf', e.target.value); }}
                  onBlur={(e) => validarAoSair('cpf', e.target.value)}
                  maxLength={14}
                  required
                />
                {erros.cpf && <span className="campo-erro">🔴 {erros.cpf}</span>}
              </div>
              <div className="input-group">
                <label>TELEFONE (WHATSAPP) *</label>
                <input
                  className={classeInput('telefone')}
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  onChange={(e) => { setTelefone(e.target.value); limparSeOk('telefone', e.target.value); }}
                  onBlur={(e) => validarAoSair('telefone', e.target.value)}
                  required
                />
                {erros.telefone && <span className="campo-erro">🔴 {erros.telefone}</span>}
              </div>
              <div className="input-group">
                <label>VEÍCULO (MODELO/COR)</label>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Ex: Honda Titan 160 Preta"
                  value={veiculo}
                  onChange={(e) => setVeiculo(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>PLACA</label>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="ABC1D23"
                  value={placa}
                  onChange={(e) => setPlaca(formatarPlaca(e.target.value))}
                  maxLength={7}
                />
              </div>
              <div className="input-group">
                <label>ENDEREÇO RESIDENCIAL</label>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Rua, Número, Bairro"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                />
              </div>
              <div style={{background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.5)', borderRadius: 12, padding: 12}}>
                <div style={{fontSize: '0.78rem', fontWeight: 800, color: '#c7d2fe', marginBottom: 4}}>📎 DOCUMENTOS (foto ou PDF — máx 6MB)</div>
                <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5}}>
                  Anexe para agilizar sua aprovação. Pode concluir sem eles e enviar depois com o Master.
                </div>
                {Object.entries(ROTULOS_DOCS_ENTREGADOR).map(([chave, rotulo]) => (
                  <div key={chave} style={{marginBottom: 10}}>
                    <label style={{display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4}}>
                      {rotulo} {docs[chave] ? '✅' : ''}
                    </label>
                    <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                      <label style={{flex: 1, display: 'block', textAlign: 'center', background: docs[chave] ? 'rgba(16,185,129,0.15)' : '#0f172a',
                                      border: docs[chave] ? '1px solid #10b981' : '1px solid #334155',
                                      color: docs[chave] ? '#6ee7b7' : '#cbd5e1',
                                      borderRadius: 10, padding: '10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'}}>
                        {docs[chave] ? `📄 ${String(docs[chave].nome).slice(0, 22)} — trocar` : '📤 Escolher arquivo / tirar foto'}
                        <input type="file" accept="image/*,.pdf" capture="environment" style={{display: 'none'}}
                          onChange={(e) => { escolherDoc(chave, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      {docs[chave] && (
                        <button type="button" onClick={() => setDocs(d => ({ ...d, [chave]: null }))}
                          style={{background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 8, padding: '8px 10px', cursor: 'pointer'}}>✕</button>
                      )}
                    </div>
                    {docs[chave]?.tipo?.startsWith('image/') && (
                      <img src={docs[chave].dados} alt={rotulo} style={{width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: '1px solid #334155'}} />
                    )}
                  </div>
                ))}
                {erroDoc && <div style={{fontSize: '0.75rem', color: '#f87171'}}>{erroDoc}</div>}
              </div>
            </>
          )}

          <div className="input-group">
            <label>EMAIL</label>
            <input
              className={classeInput('email')}
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); limparSeOk('email', e.target.value); }}
              onBlur={(e) => validarAoSair('email', e.target.value)}
              required
            />
            {erros.email && <span className="campo-erro">🔴 {erros.email}</span>}
          </div>

          <div className="input-group">
            <label>SENHA</label>
            <input
              className={classeInput('senha')}
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); limparSeOk('senha', e.target.value); }}
              onBlur={(e) => validarAoSair('senha', e.target.value)}
              required
            />
            {erros.senha && <span className="campo-erro">🔴 {erros.senha}</span>}
          </div>

          <label style={{display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)',
                          borderRadius: 10, padding: '10px 12px'}}>
            <input
              type="checkbox"
              checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)}
              style={{width: 18, height: 18, accentColor: '#6366f1', flexShrink: 0}}
            />
            <span style={{fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.4}}>
              💾 <strong>Salvar meus dados</strong> neste aparelho (entra direto na próxima vez)
            </span>
          </label>

          {error && <div className="error" style={{fontSize: '0.8rem', marginBottom: 10}}>{error}</div>}
          {isLogin && msgRecuperacao && (
            <div style={{fontSize: '0.78rem', marginBottom: 10, color: '#34d399', lineHeight: 1.4}}>{msgRecuperacao}</div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Processando...' : (isLogin ? 'ENTRAR AGORA' : 'CRIAR MINHA CONTA')}
          </button>

          {isLogin && (
            <button
              type="button"
              onClick={enviarRecuperacao}
              style={{background: 'transparent', border: 'none', color: '#818cf8', fontSize: '0.8rem',
                      fontWeight: 600, cursor: 'pointer', marginTop: 12, width: '100%'}}
            >
              Esqueci minha senha
            </button>
          )}
        </form>

        <div className="auth-toggle">
          {isLogin ? 'Novo por aqui? ' : 'Já possui conta? '}
          <span onClick={() => { setIsLogin(!isLogin); setErros({}); setAvisos({}); setTocados({}); setError(''); }}>
            {isLogin ? 'Cadastre-se' : 'Faça Login'}
          </span>
        </div>

        {versao && (
          <div style={{textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 14}}>
            ConectaEntregas Entregador · v{versao}
          </div>
        )}
      </div>
    </div>
  );
}
