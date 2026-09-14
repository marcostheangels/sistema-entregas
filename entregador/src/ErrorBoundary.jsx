import { Component } from 'react';

// Captura qualquer erro de renderizacao e MOSTRA na tela — nunca mais tela azul sem explicacao.
// O erro tambem fica no console (adb logcat) para diagnostico completo.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null, info: '' };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error('[ErrorBoundary]', erro, info?.componentStack || '');
    this.setState({ info: String(info?.componentStack || '').split('\n').slice(0, 6).join('\n') });
    try {
      localStorage.setItem('ultimo_erro_app', JSON.stringify({
        msg: String(erro?.message || erro), stack: String(erro?.stack || '').slice(0, 800), ts: Date.now()
      }));
    } catch { /* sem storage */ }
  }

  render() {
    if (this.state.erro) {
      const msg = String(this.state.erro?.message || this.state.erro || 'Erro desconhecido');
      return (
        <div style={{ background: '#0f172a', color: '#f8fafc', minHeight: '100vh', padding: '24px 18px', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#f87171', fontSize: '1.1rem', marginBottom: 12 }}>⚠️ O app encontrou um erro</h2>
          <p style={{ fontSize: '0.85rem', opacity: 0.85, marginBottom: 16, lineHeight: 1.5 }}>
            Não foi sua culpa — nos envie esta mensagem para corrigirmos rápido:
          </p>
          <pre style={{
            background: '#1e293b', borderRadius: 10, padding: 12, fontSize: '0.72rem',
            overflow: 'auto', maxHeight: '40vh', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#fbbf24'
          }}>{msg}</pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 24px', fontWeight: 800, fontSize: '0.9rem', width: '100%' }}
          >
            🔄 RECARREGAR APP
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
