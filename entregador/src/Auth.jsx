import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from './firebase';

export default function Auth({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [placa, setPlaca] = useState('');
  const [endereco, setEndereco] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const cred = await signInWithEmailAndPassword(auth, email, senha);
        onAuth(cred.user);
      } else {
        if (!nome || !telefone || !cpf) {
          setError('Preencha os campos obrigatórios (Nome, Telefone, CPF)');
          setLoading(false);
          return;
        }

        let cred;
        try {
          cred = await createUserWithEmailAndPassword(auth, email, senha);
        } catch (errCadastro) {
          if (errCadastro.code === 'auth/email-already-in-use') {
            // E-mail ja existe no Firebase Auth (ex.: cadastro anterior apagado no reset):
            // entra com a senha informada e reaproveita a conta
            cred = await signInWithEmailAndPassword(auth, email, senha);
          } else {
            throw errCadastro;
          }
        }

        await updateProfile(cred.user, { displayName: nome });

        await set(ref(db, `entregadores/${cred.user.uid}`), {
          nome,
          email,
          telefone: telefone.replace(/\D/g, ''),
          cpf: cpf.replace(/\D/g, ''),
          veiculo,
          placa: placa.toUpperCase(),
          endereco,
          status: 'disponivel',
          createdAt: Date.now()
        });

        // Solicitação de aprovação para o administrador (com todos os dados do cadastro)
        await set(ref(db, `aprovacoes/${cred.user.uid}`), {
          tipo: 'entregador', nome, email,
          telefone: telefone.replace(/\D/g, ''),
          cpf: cpf.replace(/\D/g, ''),
          veiculo,
          placa: placa.toUpperCase(),
          endereco,
          aprovado: false, criadoPor: cred.user.uid, criadoEm: Date.now()
        });

        onAuth(cred.user);
      }
    } catch (err) {
      console.error("Erro Auth:", err.code, err.message);

      // Tradução de erros comuns do Firebase para o usuário
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('Este email já tem conta com outra senha diferente da informada.');
          break;
        case 'auth/invalid-email':
          setError('Email inválido.');
          break;
        case 'auth/weak-password':
          setError('A senha deve ter pelo menos 6 caracteres.');
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Email ou senha incorretos.');
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
          <div className="auth-logo">🛵</div>
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
                  className="auth-input"
                  type="text"
                  placeholder="Ex: João Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>
              <div className="input-group">
                <label>CPF *</label>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatarCpf(e.target.value))}
                  maxLength={14}
                  required
                />
              </div>
              <div className="input-group">
                <label>TELEFONE (WHATSAPP) *</label>
                <input
                  className="auth-input"
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  required
                />
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
            </>
          )}

          <div className="input-group">
            <label>EMAIL</label>
            <input
              className="auth-input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label>SENHA</label>
            <input
              className="auth-input"
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>

          {error && <div className="error" style={{fontSize: '0.8rem', marginBottom: 10}}>{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Processando...' : (isLogin ? 'ENTRAR AGORA' : 'CRIAR MINHA CONTA')}
          </button>
        </form>

        <div className="auth-toggle">
          {isLogin ? 'Novo por aqui? ' : 'Já possui conta? '}
          <span onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Cadastre-se' : 'Faça Login'}
          </span>
        </div>
      </div>
    </div>
  );
}
