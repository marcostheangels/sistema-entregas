import { useState, useEffect, useRef } from 'react';
import { ref, push, set, onValue, update, remove, get, query, orderByChild, equalTo } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import AppSettings from './plugins/Settings';

// -- COMPONENTES AUXILIARES --

function GeoSearch({ value, onChange, onCoords, placeholder, label }) {
  const [input, setInput] = useState(value || '');
  const [sugestoes, setSugestoes] = useState([]);
  const timeoutRef = useRef(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  const buscarEndereco = async (query) => {
    if (query.length < 3) { setSugestoes([]); return; }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)},+Montes+Claros,+MG,+Brasil&format=json&limit=5&addressdetails=1`,
        { headers: { 'User-Agent': 'SistemaEntregas/1.0' } }
      );
      const data = await res.json();
      setSugestoes(data);
    } catch (err) { console.log('Erro busca:', err); }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setInput(val);
    onChange(val);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => buscarEndereco(val), 500);
  };

  return (
    <div className="form-group" style={{position: 'relative'}}>
      <label className="form-label">{label}</label>
      <input type="text" placeholder={placeholder} value={input} onChange={handleChange} className="geo-input" />
      {sugestoes.length > 0 && (
        <div className="sugestoes">
          {sugestoes.map((sug, i) => (
            <div key={i} className="sugestao-item" onClick={() => {
                const addr = sug.address || {};
                const rua = addr.road || addr.street || "";
                const bairro = addr.neighbourhood || addr.suburb || "";
                const numero = input.match(/\d+/)?.[0] || addr.house_number || "";
                const enderecoLimpo = `${rua}${numero ? ", " + numero : ""} - ${bairro}`;
                setInput(enderecoLimpo);
                onChange(enderecoLimpo);
                onCoords({ lat: parseFloat(sug.lat), lng: parseFloat(sug.lon) });
                setSugestoes([]);
            }}>
              {sug.display_name.split(',').slice(0,3).join(',')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MensagemBox({ entregadorId, empresaId, empresaNome, entregas }) {
  const [texto, setTexto] = useState('');
  const [enviada, setEnviada] = useState(false);
  const [erro, setErro] = useState('');
  // Chat liberado somente com entrega ativa (aceite ou em_transito) entre esta empresa e o entregador
  const temEntregaAtiva = entregas.some(e => e.entregadorId === entregadorId && ['aceite', 'em_transito'].includes(e.status));

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    try {
      await push(ref(db, 'mensagens'), {
        empresaId, entregadorId, empresaNome,
        texto: t.slice(0, 500), de: 'empresa', timestamp: Date.now()
      });
      setTexto('');
      setEnviada(true);
      setErro('');
      setTimeout(() => setEnviada(false), 2500);
    } catch (e) {
      setErro('Erro ao enviar: ' + e.message);
    }
  };

  if (!temEntregaAtiva) {
    return (
      <div style={{marginTop:'10px', borderTop:'1px solid #eee', paddingTop:'8px', fontSize:'0.72rem', color:'var(--text-muted)', fontStyle:'italic'}}>
        Chat disponível somente durante uma entrega ativa com este entregador.
      </div>
    );
  }

  return (
    <div style={{marginTop:'10px', borderTop:'1px solid #eee', paddingTop:'8px'}}>
      <div style={{fontSize:'0.62rem', fontWeight:800, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--success)', marginBottom:'6px'}}>
        Chat ativo (entrega em andamento)
      </div>
      <div style={{display:'flex', gap:'5px'}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') enviar(); }}
          placeholder="Mensagem ao entregador..." maxLength={500}
          style={{flex:1, padding:'6px 8px', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'0.8rem'}} />
        <button onClick={enviar} style={{padding:'6px 10px', borderRadius:'6px', border:'none', background:'var(--primary)', color:'white', fontWeight:700, cursor:'pointer', fontSize:'0.75rem'}}>ENVIAR</button>
      </div>
      {enviada && <div style={{fontSize:'0.7rem', color:'var(--success)', marginTop:'4px', fontWeight:700}}>Mensagem enviada ao entregador!</div>}
      {erro && <div style={{fontSize:'0.7rem', color:'var(--danger)', marginTop:'4px'}}>{erro}</div>}
    </div>
  );
}

function MapaFrota({ entregadores, posicoes, currentUserId, empresaNome, entregas, onBlockToggle }) {
  const mapRef = useRef(null);
  const centerMoc = [-16.7251, -43.8647];
  const [, setTick] = useState(0);

  // Reavalia o "sem sinal" periodicamente, mesmo sem mudanca nos dados
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const createIcon = (nome, online, bloqueado, semSinal) => {
    const color = bloqueado ? '#64748b' : (semSinal ? '#f59e0b' : (online ? '#10b981' : '#94a3b8'));
    return L.divIcon({
      html: `<div style="display:flex; flex-direction:column; align-items:center;">
              <div style="background:white; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:800; border:1px solid #333; white-space:nowrap; margin-bottom:2px; box-shadow:0 2px 4px rgba(0,0,0,0.2)">
                ${nome.split(' ')[0]} ${bloqueado ? '🚫' : ''}${semSinal ? '⏸' : ''}
              </div>
              <div style="background:${color}; width:32px; height:32px; border-radius:50%; border:3px solid white; box-shadow:0 4px 6px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M19,10c0-1.1-0.9-2-2-2h-3l-2-2h-3l-2,2H4 c-1.1,0-2,0.9-2,2v3c0,1.1,0.9,2,2,2h0.1c0.5,1.7,2,3,3.9,3s3.4-1.3,3.9-3h4.2c0.5,1.7,2,3,3.9,3s3.4-1.3,3.9-3H22v-3 C22,10.9,21.1,10,19,10z"/></svg>
              </div>
             </div>`,
      className: '', iconSize: [40, 50], iconAnchor: [20, 45]
    });
  };

  return (
    <div className="card" style={{padding: '0', overflow: 'hidden'}}>
      <div style={{padding: '1rem 1.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h2 style={{margin:0, fontSize:'1rem'}}>🌍 Rastreamento em Tempo Real</h2>
        <button onClick={() => mapRef.current.setView(centerMoc, 13)} style={{background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem'}}>RE-CENTRALIZAR</button>
      </div>
      <MapContainer center={centerMoc} zoom={13} style={{ height: '400px', width: '100%' }} ref={mapRef}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {Object.entries(posicoes).map(([id, pos]) => {
          if (id === currentUserId) return null;
          const info = entregadores[id] || {};
          // So mostra quem esta ATIVO: marcado online E com posicao recente (ate 2 min)
          const defasagem = Date.now() - (pos.timestamp || 0);
          if (!pos.online || defasagem > 120000) return null;
          const isBloqueado = info.empresasBloqueadas && info.empresasBloqueadas[currentUserId];
          // Posicao com mais de 60s sem atualizacao = sinal perdido (entregador fechou o app ou ficou sem rede)
          const semSinal = defasagem > 60000;
          return (
            <Marker key={id} position={[pos.lat, pos.lng]} icon={createIcon(info.nome || 'Entregador', pos.online, isBloqueado, semSinal)}>
              <Popup>
                <div style={{textAlign:'center', minWidth: '200px'}}>
                  <h4 style={{margin: '0 0 5px 0'}}>{info.nome}</h4>
                  <p style={{margin: '0', fontSize: '0.85rem', color: 'var(--success)', fontWeight: 700}}>📞 {info.telefone}</p>
                  <p style={{margin: '5px 0', fontSize: '0.8rem'}}>🛵 {info.veiculo} | {info.placa}</p>
                  <p style={{margin: '5px 0', fontSize: '0.75rem', color: semSinal ? '#b45309' : 'var(--text-muted)', fontWeight: semSinal ? 700 : 400}}>
                    Última atualização: {pos.timestamp ? new Date(pos.timestamp).toLocaleTimeString() : '--'}{semSinal ? ' (sem sinal novo)' : ''}
                  </p>
                  <button onClick={() => onBlockToggle(id, !isBloqueado)} style={{width: '100%', marginTop: '10px', padding: '8px', borderRadius: '5px', border: 'none', background: isBloqueado ? 'var(--success)' : '#334155', color: 'white', fontWeight: 700, cursor: 'pointer'}}>
                    {isBloqueado ? '✅ LIBERAR' : '🚫 BLOQUEAR'}
                  </button>
                  <MensagemBox entregadorId={id} empresaId={currentUserId} empresaNome={empresaNome} entregas={entregas} />
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

// Som de resposta recebida: dois bipes agudos curtos (diferente dos outros alertas)
const tocarChimeResposta = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[988, 0], [1318.5, 0.18]].forEach(([freq, t]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
  } catch { /* sem audio */ }
};

export default function Dashboard({ user }) {
  const [entregas, setEntregas] = useState([]);
  const [entregadores, setEntregadores] = useState({});
  const [posicoes, setPosicoes] = useState({});
  const [perfil, setPerfil] = useState(null);
  const [form, setForm] = useState({ origem: '', destino: '', descricao: '', valor: '' });
  const [coords, setCoords] = useState({ origem: null, destino: null });
  const [statusFiltro, setStatusFiltro] = useState('pendente');
  const [mensagemRecebida, setMensagemRecebida] = useState(null);
  const lastReplyTs = useRef(Date.now());

  useEffect(() => {
    onValue(ref(db, `empresas/${user.uid}`), snap => setPerfil(snap.val()));
    // Aviso de resposta do entregador (mensagens enviadas por ele)
    const qRespostas = query(ref(db, 'mensagens'), orderByChild('empresaId'), equalTo(user.uid));
    const unsubRespostas = onValue(qRespostas, snap => {
      let maisNova = null;
      snap.forEach(c => {
        const m = c.val();
        if (m.de === 'entregador' && m.timestamp > lastReplyTs.current && (!maisNova || m.timestamp > maisNova.timestamp)) {
          maisNova = { id: c.key, ...m };
        }
      });
      if (maisNova) {
        lastReplyTs.current = maisNova.timestamp;
        setMensagemRecebida(maisNova);
        tocarChimeResposta();
      }
    });
    // Query indexada: só as entregas desta empresa (evita baixar o banco inteiro)
    const q = query(ref(db, 'entregas'), orderByChild('empresaId'), equalTo(user.uid));
    onValue(q, snap => {
      const list = snap.val() ? Object.entries(snap.val()).map(([id, val]) => ({ id, ...val })) : [];
      setEntregas(list.reverse());
    });
    onValue(ref(db, 'entregadores'), snap => setEntregadores(snap.val() || {}));
    onValue(ref(db, 'posicoes'), snap => setPosicoes(snap.val() || {}));
    return () => unsubRespostas();
  }, [user.uid]);

  const criarEntrega = async (e) => {
    e.preventDefault();
    if (!coords.origem || !coords.destino) { alert('Selecione os endereços nas sugestões!'); return; }
    // Garante que temos o perfil (mesmo que ainda nao tenha carregado)
    let p = perfil;
    if (!p?.nome) {
      try { const s = await get(ref(db, `empresas/${user.uid}`)); p = s.val(); if (p) setPerfil(p); } catch { /* usa fallback */ }
    }
    const novaRef = push(ref(db, 'entregas'));
    await set(novaRef, {
      ...form, empresaId: user.uid, status: 'pendente',
      empresaNome: p?.nome || user.email,
      empresaTelefone: p?.telefone || '',
      createdAt: Date.now(), origemCoords: coords.origem, destinoCoords: coords.destino
    });
    setForm({ origem: '', destino: '', descricao: '', valor: '' });
    setCoords({ origem: null, destino: null });
  };

  const editarNomeEmpresa = async () => {
    const nome = prompt('Nome da empresa (aparece para os entregadores):', perfil?.nome || '');
    if (nome && nome.trim()) {
      await update(ref(db, `empresas/${user.uid}`), { nome: nome.trim(), email: user.email });
      setPerfil({ ...(perfil || {}), nome: nome.trim(), email: user.email });
    }
  };

  const toggleBloqueio = (id, status) => {
    if (status) update(ref(db, `entregadores/${id}/empresasBloqueadas`), { [user.uid]: true });
    else remove(ref(db, `entregadores/${id}/empresasBloqueadas/${user.uid}`));
  };

  const listFiltered = entregas.filter(e => {
    if (statusFiltro === 'pendente') return e.status === 'pendente';
    if (statusFiltro === 'em_rota') return ['aceite', 'em_transito'].includes(e.status);
    if (statusFiltro === 'entregue') return e.status === 'entregue';
    return false;
  });

  return (
    <div className="dashboard">
      <header>
        <div className="brand">
          <div style={{background:'var(--primary)', color:'white', width:'40px', height:'40px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem'}}>🏢</div>
          <h1>PAINEL ADMINISTRATIVO</h1>
        </div>
        <div className="user-info">
          <div style={{textAlign: 'right'}}>
            <div style={{fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px'}}>
              {perfil?.nome || 'Minha Empresa'}
              <button onClick={editarNomeEmpresa} title="Editar nome da empresa" style={{background:'none', border:'none', cursor:'pointer', fontSize:'0.85rem', opacity:0.7}}>✏️</button>
            </div>
            <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>{user.email}</div>
          </div>
          <button onClick={() => signOut(auth)} className="btn-logout">SAIR</button>
        </div>
      </header>

      {mensagemRecebida && (
        <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', padding: '14px 16px', borderRadius: '12px', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b45309', marginBottom: '3px' }}>
              Resposta de {entregadores[mensagemRecebida.entregadorId]?.nome || 'Entregador'}
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#78350f' }}>{mensagemRecebida.texto}</div>
            <div style={{ fontSize: '0.7rem', color: '#a16207', marginTop: '3px' }}>{new Date(mensagemRecebida.timestamp).toLocaleTimeString('pt-BR')}</div>
          </div>
          <button onClick={() => setMensagemRecebida(null)} style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '8px 18px', borderRadius: '9px', fontWeight: 800, cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>OK</button>
        </div>
      )}

      <div className="stats-grid">
        <div className={`stat-card clickable ${statusFiltro === 'pendente' ? 'active' : ''}`} onClick={() => setStatusFiltro('pendente')}>
          <h3>📋 Pendentes</h3>
          <p>{entregas.filter(e=>e.status==='pendente').length}</p>
        </div>
        <div className={`stat-card clickable ${statusFiltro === 'em_rota' ? 'active' : ''}`} onClick={() => setStatusFiltro('em_rota')}>
          <h3>🚚 Em Rota</h3>
          <p>{entregas.filter(e=>['aceite','em_transito'].includes(e.status)).length}</p>
        </div>
        <div className={`stat-card clickable ${statusFiltro === 'entregue' ? 'active' : ''}`} onClick={() => setStatusFiltro('entregue')}>
          <h3>✅ Concluídas</h3>
          <p>{entregas.filter(e=>e.status==='entregue').length}</p>
        </div>
        <div className="stat-card">
          <h3>📡 Online</h3>
          <p>{Object.values(posicoes).filter(p=>p.online).length}</p>
        </div>
      </div>

      <div className="main-content">
        <div className="column-left">
          <MapaFrota entregadores={entregadores} posicoes={posicoes} currentUserId={user.uid} empresaNome={perfil?.nome || user.email} entregas={entregas} onBlockToggle={toggleBloqueio} />

          <div className="section-title">
            <span>📦</span> Listagem de Pedidos ({statusFiltro.toUpperCase()})
          </div>

          <div className="delivery-grid">
            {listFiltered.map(e => (
              <div key={e.id} className={`delivery-item status-${e.status}`}>
                <div className="delivery-header">
                  <span className="order-id">#ORDEM-{e.id.slice(-4).toUpperCase()}</span>
                  <span className={`badge badge-${e.status === 'pendente' ? 'pendente' : (e.status === 'entregue' ? 'entregue' : 'rota')}`}>{e.status}</span>
                </div>
                <div className="delivery-info">
                  <div className="info-row"><span className="info-label">COLETA</span><span>{e.origem}</span></div>
                  <div className="info-row"><span className="info-label">DESTINO</span><span>{e.destino}</span></div>
                  <div className="info-row"><span className="info-label">ITEM</span><span style={{fontWeight: 700}}>{e.descricao}</span></div>
                  {e.status !== 'pendente' && (
                    <div className="info-row" style={{background: '#f8fafc', padding: '8px', borderRadius: '8px'}}>
                      <span className="info-label">MOTO</span>
                      <div>
                        <div style={{fontWeight: 800, color: 'var(--primary)'}}>{e.entregadorNome}</div>
                        <div style={{fontSize: '0.75rem'}}>Placa: {entregadores[e.entregadorId]?.placa}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="delivery-footer">
                  <span className="price-tag">R$ {e.valor}</span>
                  {e.status === 'pendente' ? (
                    <button onClick={() => remove(ref(db, `entregas/${e.id}`))} className="btn-cancel">CANCELAR</button>
                  ) : (
                    <span style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>Finalizado às {e.entregueEm ? new Date(e.entregueEm).toLocaleTimeString() : '--:--'}</span>
                  )}
                </div>
              </div>
            ))}
            {listFiltered.length === 0 && <div className="card" style={{textAlign: 'center', opacity: 0.5}}>Nenhuma entrega encontrada nesta fase.</div>}
          </div>
        </div>

        <div className="column-right">
          <div className="card">
            <h2 style={{marginTop: 0, fontSize: '1.1rem', marginBottom: '1.5rem'}}>🚀 Nova Entrega</h2>
            <form onSubmit={criarEntrega}>
              <GeoSearch label="📍 Ponto de Coleta" placeholder="Rua, Número, Bairro" value={form.origem} onChange={v=>setForm({...form, origem:v})} onCoords={c=>setCoords({...coords, origem:c})} />
              <GeoSearch label="🏁 Destino Final" placeholder="Rua, Número, Bairro" value={form.destino} onChange={v=>setForm({...form, destino:v})} onCoords={c=>setCoords({...coords, destino:c})} />

              <div className="form-group">
                <label className="form-label">📝 O que será entregue?</label>
                <input type="text" placeholder="Ex: 2 Pizzas G" value={form.descricao} onChange={e=>setForm({...form, descricao:e.target.value})} required className="input-field" />
              </div>

              <div className="form-group">
                <label className="form-label">💰 Valor da Corrida</label>
                <input type="number" placeholder="R$ 0,00" value={form.valor} onChange={e=>setForm({...form, valor:e.target.value})} required className="input-field" />
              </div>

              <button type="submit" className="btn-primary" style={{marginTop: '1rem'}}>PUBLICAR AGORA</button>
            </form>
          </div>

          <div className="card">
            <h2 style={{marginTop: 0, fontSize: '1rem', marginBottom: '1rem'}}>📋 Resumo do Dia</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}>
                <span>Total Entregue:</span>
                <span style={{fontWeight: 700}}>{entregas.filter(e=>e.status==='entregue').length}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '1rem', borderTop: '1px solid #eee', paddingTop: '10px'}}>
                <span>Faturamento:</span>
                <span style={{fontWeight: 900, color: 'var(--success)'}}>
                  R$ {entregas.filter(e=>e.status==='entregue').reduce((acc, curr) => acc + parseFloat(curr.valor || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{marginTop: '2rem'}}>
        <h2 className="section-title">📊 Relatório de Atividades Concluídas</h2>
        <div style={{overflowX: 'auto'}}>
          <table className="history-table">
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Cód. Ordem</th>
                <th>Entregador Responsável</th>
                <th>Veículo / Placa</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entregas.filter(e => e.status === 'entregue').map(e => (
                <tr key={e.id}>
                  <td>{e.entregueEm ? new Date(e.entregueEm).toLocaleString('pt-BR') : '--'}</td>
                  <td style={{fontWeight: 700}}>#{e.id.slice(-4).toUpperCase()}</td>
                  <td style={{color: 'var(--primary)', fontWeight: 600}}>{e.entregadorNome}</td>
                  <td>
                    <div style={{fontSize: '0.8rem'}}>{entregadores[e.entregadorId]?.veiculo || 'N/A'}</div>
                    <div style={{fontSize: '0.75rem', fontWeight: 700}}>PLACA: {entregadores[e.entregadorId]?.placa || 'N/A'}</div>
                  </td>
                  <td style={{fontWeight: 800, color: 'var(--success)'}}>R$ {e.valor}</td>
                  <td><span className="badge badge-entregue">CONCLUÍDO</span></td>
                </tr>
              ))}
              {entregas.filter(e => e.status === 'entregue').length === 0 && (
                <tr><td colSpan="6" style={{textAlign: 'center', padding: '30px', opacity: 0.5}}>Aguardando conclusões para gerar relatório...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
