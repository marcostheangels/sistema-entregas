import { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, update, query, orderByChild, equalTo, runTransaction } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

import { backgroundLocation } from './plugins/BackgroundLocation';
import AppSettings from './plugins/Settings';

// -- ICONS (SVG) --
const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
);

const IconNav = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
);

// -- MAP COMPONENTS --
function MapUpdater({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.lat, position.lng], 16);
  }, [position, map]);
  return null;
}

const RotaMapa = ({ posicao, entrega, rotaInfo }) => {
  const icons = useMemo(() => ({
    delivery: new L.Icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
      iconSize: [45, 45], iconAnchor: [22, 45], popupAnchor: [0, -45]
    }),
    store: new L.Icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/483/483947.png',
      iconSize: [35, 35], iconAnchor: [17, 35], popupAnchor: [0, -35]
    }),
    dest: new L.Icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/1673/1673221.png',
      iconSize: [35, 35], iconAnchor: [17, 35], popupAnchor: [0, -35]
    })
  }), []);

  const center = useMemo(() => {
    if (posicao) return [posicao.lat, posicao.lng];
    if (entrega?.origemCoords) return [entrega.origemCoords.lat, entrega.origemCoords.lng];
    return [-19.9369, -44.9328];
  }, [posicao, entrega]);

  return (
    <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapUpdater position={posicao} />
      {posicao && <Marker position={[posicao.lat, posicao.lng]} icon={icons.delivery}><Popup>Você</Popup></Marker>}
      {entrega?.origemCoords && <Marker position={[entrega.origemCoords.lat, entrega.origemCoords.lng]} icon={icons.store}><Popup>Coleta</Popup></Marker>}
      {entrega?.destinoCoords && <Marker position={[entrega.destinoCoords.lat, entrega.destinoCoords.lng]} icon={icons.dest}><Popup>Entrega</Popup></Marker>}
      {rotaInfo?.coords && <Polyline positions={rotaInfo.coords.map(c => [c[1], c[0]])} color="#6366f1" weight={6} opacity={0.8} />}
    </MapContainer>
  );
};

// -- UI SUB-COMPONENTS --
const PermissionRow = ({ icon, name, desc, status, onAction }) => (
  <div className={`perm-row ${!status ? 'missing' : ''}`}>
    <div className="perm-icon-box">{icon}</div>
    <div className="perm-info">
      <span className="perm-name">{name}</span>
      <span className="perm-desc">{desc}</span>
    </div>
    <button
      onClick={onAction}
      className="btn-fix"
      style={{ background: status ? 'var(--success)' : 'var(--danger)', color: '#fff' }}
    >
      {status ? 'OK' : 'Ativar'}
    </button>
  </div>
);

const DeliveryCard = ({ entrega, posicao, onAction, actionLabel, actionColor }) => {
  const distParaColeta = useMemo(() => {
    if (!posicao || !entrega.origemCoords) return null;
    const R = 6371; // Raio da Terra em km
    const dLat = (entrega.origemCoords.lat - posicao.lat) * Math.PI / 180;
    const dLon = (entrega.origemCoords.lng - posicao.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(posicao.lat * Math.PI / 180) * Math.cos(entrega.origemCoords.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, [posicao, entrega.origemCoords]);

  return (
    <div className="delivery-card animate-fade">
      <div className="delivery-header">
        <span className="delivery-price">R$ {entrega.valor}</span>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
          {distParaColeta !== null && <span className="delivery-dist" style={{fontSize: '0.7rem', color: 'var(--warning)'}}>Até a coleta: {distParaColeta.toFixed(1)} km</span>}
          {entrega.distanciaKm && <span className="delivery-dist" style={{fontSize: '0.7rem'}}>Entrega: {entrega.distanciaKm.toFixed(1)} km</span>}
        </div>
      </div>
      <div className="delivery-body">
        <div className="address-step">
          <div className="step-marker">
            <div className="marker-dot" style={{background: 'var(--warning)'}}></div>
            <div className="marker-line"></div>
          </div>
          <div className="address-info">
          <span className="address-label">Retirada (Coleta)</span>
          <span className="address-value" style={{fontWeight: 800, color: 'var(--warning)', fontSize: '1.1rem', marginBottom: '2px'}}>
            {entrega.empresaNome || 'Estabelecimento'}
          </span>
          {entrega.empresaTelefone && (
            <span className="address-value" style={{fontSize: '0.9rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px'}}>
              📞 {entrega.empresaTelefone}
            </span>
          )}
          <span className="address-value">{entrega.origem}</span>
          {(entrega.empresaCnpj || entrega.empresaCpf) && (
            <span className="address-value" style={{fontSize: '0.75rem', opacity: 0.6, marginTop: '4px'}}>
              ID: {entrega.empresaCnpj || entrega.empresaCpf}
            </span>
          )}
        </div>
        </div>
        <div className="address-step">
          <div className="step-marker">
            <div className="marker-dot" style={{background: 'var(--success)'}}></div>
          </div>
          <div className="address-info" style={{paddingBottom: 0}}>
            <span className="address-label">Entrega (Destino)</span>
            <span className="address-value">{entrega.destino}</span>
          </div>
        </div>
      </div>
      <div className="delivery-footer">
        <button
          onClick={() => onAction(entrega)}
          className="btn-full"
          style={{ background: actionColor || 'var(--primary)', color: 'white' }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

export default function Dashboard({ user }) {
  const [entregas, setEntregas] = useState([]);
  const [statusFiltro, setStatusFiltro] = useState('disponivel');
  const lastEntregasCount = useRef(0);
  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3'));
  const [posicao, setPosicao] = useState(null);
  const [entregaEmRota, setEntregaEmRota] = useState(null);
  const [rotaInfo, setRotaInfo] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [isBlockedGlobal, setIsBlockedGlobal] = useState(false);
  const [empresasBloqueadas, setEmpresasBloqueadas] = useState({});
  const [listaEmpresas, setListaEmpresas] = useState({}); // NOVO: Para saber os nomes das empresas
  const [permissoes, setPermissoes] = useState({
    localizacao: false,
    localizacaoSempre: false,
    notificacao: false,
    bateria: false,
    sobreposicao: false,
    acessibilidade: false
  });
  const [debugLog, setDebugLog] = useState([]);

  const watchId = useRef(null);
  const onlineRef = useRef(false);
  const blockedGlobalRef = useRef(false);
  const empresasBloqueadasRef = useRef({});
  const [mensagemNova, setMensagemNova] = useState(null);
  const lastMsgTs = useRef(Date.now());
  const msgAudioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3'));

  const addLog = (msg) => {
    setDebugLog(prev => [new Date().toLocaleTimeString() + ': ' + msg, ...prev.slice(0, 9)]);
  };

  const checkPerms = () => {
    AppSettings.checkPermissions().then(res => setPermissoes(res)).catch(e => addLog('Perm Erro: ' + e.message));
  };

  // Monitora se o entregador está bloqueado
  useEffect(() => {
    // Busca nomes das empresas para mostrar no alerta de bloqueio
    onValue(ref(db, 'empresas'), snap => {
        setListaEmpresas(snap.val() || {});
    });

    const unsub = onValue(ref(db, `entregadores/${user.uid}`), (snap) => {
      const info = snap.val() || {};
      const isBlocked = info.bloqueado === true;
      const empBlocked = info.empresasBloqueadas || {};

      setIsBlockedGlobal(isBlocked);
      setEmpresasBloqueadas(empBlocked);

      blockedGlobalRef.current = isBlocked;
      empresasBloqueadasRef.current = empBlocked;

      // Se for bloqueado globalmente, força ficar offline
      if (isBlocked && onlineRef.current) {
        toggleTracking(false);
        addLog('⚠️ SUA CONTA FOI SUSPENSA DO SISTEMA');
      }
    });
    return unsub;
  }, [user.uid]);

  // Mensagens da empresa (recebidas em tempo real)
  useEffect(() => {
    const qMsgs = query(ref(db, 'mensagens'), orderByChild('entregadorId'), equalTo(user.uid));
    const unsub = onValue(qMsgs, (snap) => {
      let maisNova = null;
      snap.forEach(c => {
        const m = c.val();
        if (m.de === 'empresa' && m.timestamp > lastMsgTs.current && (!maisNova || m.timestamp > maisNova.timestamp)) {
          maisNova = { id: c.key, ...m };
        }
      });
      if (maisNova) {
        lastMsgTs.current = maisNova.timestamp;
        setMensagemNova(maisNova);
        msgAudioRef.current.play().catch(() => {});
        addLog('Mensagem da empresa: ' + maisNova.texto);
      }
    });
    return unsub;
  }, [user.uid]);

  useEffect(() => {
    checkPerms();
    const intv = setInterval(checkPerms, 5000);
    return () => clearInterval(intv);
  }, []);

  const entregasStore = useRef({ pendentes: {}, minhas: {} });

  const combinarEntregas = () => {
    const merged = { ...entregasStore.current.pendentes, ...entregasStore.current.minhas };
    setEntregas(Object.entries(merged).map(([id, val]) => ({ id, ...val })));
  };

  const snapToMap = (snap) => {
    const map = {};
    snap.forEach(child => { map[child.key] = child.val(); });
    return map;
  };

  useEffect(() => {
    // Queries indexadas: só entregas pendentes + só as minhas (evita baixar o banco inteiro)
    const qPendentes = query(ref(db, 'entregas'), orderByChild('status'), equalTo('pendente'));
    const qMinhas = query(ref(db, 'entregas'), orderByChild('entregadorId'), equalTo(user.uid));

    const unsubPendentes = onValue(qPendentes, (snap) => {
      const data = snapToMap(snap);
      entregasStore.current.pendentes = data;

      // Lógica de Som para Nova Entrega (Filtrada por bloqueios)
      const pendentesVisiveis = Object.keys(data).filter(id => {
          if (blockedGlobalRef.current) return false;
          const e = data[id];
          if (empresasBloqueadasRef.current[e.empresaId]) return false;
          return true;
      });

      if (pendentesVisiveis.length > lastEntregasCount.current && onlineRef.current) {
        addLog('🔔 Nova entrega disponível!');
        if (audioRef.current) {
          audioRef.current.loop = true;
          audioRef.current.play().catch(e => addLog('Erro áudio: ' + e.message));
        }
      }

      // Se não houver mais entregas pendentes VISÍVEIS, para a "chamada"
      if (pendentesVisiveis.length === 0 && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      lastEntregasCount.current = pendentesVisiveis.length;
      combinarEntregas();
    });
    const unsubMinhas = onValue(qMinhas, (snap) => {
      entregasStore.current.minhas = snapToMap(snap);
      combinarEntregas();
    });
    return () => { unsubPendentes(); unsubMinhas(); };
  }, [user.uid]);

  const toggleTracking = (status) => {
    // Sênior: Liberado para ficar online sem travas administrativas globais
    setIsOnline(status);
    onlineRef.current = status;

    // Tenta "desbloquear" o áudio no primeiro clique do usuário
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }).catch(() => {});
    }

    if (status) {
      addLog('Ficando Online...');
      backgroundLocation.startService(user.uid);
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
          setPosicao(p);
          if (onlineRef.current) update(ref(db, `posicoes/${user.uid}`), { ...p, online: true });
        },
        (err) => addLog('Erro GPS: ' + err.message),
        { enableHighAccuracy: true }
      );
    } else {
      addLog('Ficando Offline...');
      backgroundLocation.stopService();
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      update(ref(db, `posicoes/${user.uid}`), { online: false });
    }
  };

  const calcRoute = async (entrega) => {
    if (!entrega.origemCoords || !entrega.destinoCoords) return;
    try {
      const { lat: oLat, lng: oLng } = entrega.origemCoords;
      const { lat: dLat, lng: dLng } = entrega.destinoCoords;

      // Se tivermos a posição do entregador, calculamos desde onde ele está.
      // Se não, calculamos apenas entre os pontos da entrega.
      const p = posicao || { lat: oLat, lng: oLng };

      // Montamos a URL com 3 pontos: [Entregador] -> [Coleta] -> [Entrega]
      const url = `https://router.project-osrm.org/route/v1/driving/${p.lng},${p.lat};${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;
      const res = await fetch(url).then(r => r.json());

      if (res.routes?.[0]) {
        const r = res.routes[0];

        setRotaInfo({
          distanciaTotal: r.distance / 1000,
          distanciaColeta: (r.legs[0]?.distance || 0) / 1000,
          distanciaEntrega: (r.legs[1]?.distance || 0) / 1000,
          tempoTotal: Math.round(r.duration / 60),
          coords: r.geometry.coordinates
        });
      }
    } catch (e) {
      addLog('Erro Rota: ' + e.message);
    }
  };

  const filtered = entregas.filter(e => {
    if (isBlockedGlobal && statusFiltro === 'disponivel') return false;

    // Filtro por Empresa Bloqueada
    if (statusFiltro === 'disponivel' && empresasBloqueadas[e.empresaId]) return false;

    if (statusFiltro === 'disponivel') return e.status === 'pendente';
    if (statusFiltro === 'minhas') return e.entregadorId === user.uid && (e.status === 'aceite' || e.status === 'em_transito');
    return e.entregadorId === user.uid && e.status === 'entregue';
  });

  return (
    <div className="app-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h1>ENTREGADOR<span>PRO</span></h1>
        </div>
        <div className="nav-actions">
          <button
            onClick={() => toggleTracking(!isOnline)}
            className="status-indicator"
            style={{
               border: 'none',
               background: isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
               cursor: 'pointer'
            }}
          >
            <div className={`dot ${isOnline ? 'dot-online' : 'dot-offline'}`}></div>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </button>
          <button className="btn-icon-danger" onClick={() => signOut(auth)}><IconLogout /></button>
        </div>
      </nav>

      <main className="main-scroll">
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-label">Hoje</span>
            <span className="stat-value">{entregas.filter(e => e.entregadorId === user.uid && e.status === 'entregue').length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Ganhos</span>
            <span className="stat-value" style={{color: 'var(--success)'}}>
              R$ {entregas.filter(e => e.entregadorId === user.uid && e.status === 'entregue').reduce((acc, curr) => acc + parseFloat(curr.valor || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="widget-card">
          <div className="widget-header">
            <h2 className="widget-title">Saúde do Sistema</h2>
            <button onClick={checkPerms} style={{background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.7rem', fontWeight: 700}}>ATUALIZAR</button>
          </div>
          <div className="perm-list">
            <PermissionRow icon="📍" name="GPS / Localização" desc="Necessário para as rotas" status={permissoes.localizacao} onAction={AppSettings.openLocationSettings} />
            <PermissionRow icon="🌐" name="Permissão Sempre" desc="Localização em 2º plano" status={permissoes.localizacaoSempre} onAction={AppSettings.openAppSettings} />
            <PermissionRow icon="🔋" name="Bateria" desc="Sem restrição de fundo" status={permissoes.bateria} onAction={AppSettings.requestIgnoreBatteryOptimization} />
            <PermissionRow icon="🔔" name="Notificações" desc="Alertas de entregas" status={permissoes.notificacao} onAction={AppSettings.openNotificationSettings} />
            <PermissionRow icon="📑" name="Sobreposição" desc="Igual Uber/99 (Essencial)" status={permissoes.sobreposicao} onAction={AppSettings.openOverlaySettings} />
            <PermissionRow icon="⚙️" name="Acessibilidade" desc="Blindagem de GPS" status={permissoes.acessibilidade} onAction={AppSettings.openAccessibilitySettings} />
          </div>
          {debugLog.length > 0 && (
            <div className="log-container" style={{marginTop: 15}}>
              {debugLog.map((l, i) => <div key={i} className="log-item">{l}</div>)}
            </div>
          )}
        </div>

        <div className="tabs-container">
          <button className={`tab-btn ${statusFiltro === 'disponivel' ? 'active' : ''}`} onClick={() => setStatusFiltro('disponivel')}>DISPONÍVEIS</button>
          <button className={`tab-btn ${statusFiltro === 'minhas' ? 'active' : ''}`} onClick={() => setStatusFiltro('minhas')}>EM CURSO</button>
          <button className={`tab-btn ${statusFiltro === 'historico' ? 'active' : ''}`} onClick={() => setStatusFiltro('historico')}>HISTÓRICO</button>
        </div>

        {Object.keys(empresasBloqueadas).length > 0 && (
          <div style={{ background: '#fffbeb', color: '#92400e', padding: '12px', borderRadius: '12px', textAlign: 'center', marginBottom: '15px', fontWeight: 700, border: '1px solid #f59e0b', fontSize: '0.85rem' }}>
            ⚠️ VOCÊ FOI BLOQUEADO POR: <br/>
            {Object.keys(empresasBloqueadas).map(id => {
              const emp = listaEmpresas[id];
              return <span key={id} style={{textTransform:'uppercase', background:'#f59e0b', color:'white', padding:'2px 6px', borderRadius:'4px', margin:'2px', display:'inline-block'}}>{emp?.nome || 'Empresa'}</span>
            })}
            <div style={{marginTop: '5px', fontSize: '0.75rem', fontWeight: 500}}>Você não receberá pedidos dessas empresas.</div>
          </div>
        )}

        {mensagemNova && (
          <div style={{ background: '#eef2ff', border: '1px solid #6366f1', color: '#312e81', padding: '14px', borderRadius: '12px', marginBottom: '15px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
              Mensagem de {mensagemNova.empresaNome || 'Empresa'}
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{mensagemNova.texto}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: '4px' }}>{new Date(mensagemNova.timestamp).toLocaleTimeString('pt-BR')}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={() => setMensagemNova(null)} style={{ background: '#6366f1', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>OK</button>
            </div>
          </div>
        )}

        <div className="delivery-grid">
          {filtered.length === 0 ? (
            <div className="vazio">Nenhuma entrega encontrada.</div>
          ) : (
            filtered.map(e => (
              <DeliveryCard
                key={e.id}
                entrega={e}
                posicao={posicao}
                onAction={async (item) => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                  }
                  if (item.status === 'pendente') {
                    // Transação: só um entregador consegue aceitar (evita corrida)
                    const result = await runTransaction(ref(db, `entregas/${item.id}`), (atual) => {
                      if (atual === null) return atual;
                      if (atual.status !== 'pendente') return; // Aborta: outro entregador já aceitou
                      return { ...atual, status: 'aceite', entregadorId: user.uid, aceiteAt: Date.now() };
                    });
                    if (!result.committed) {
                      alert('Esta entrega já foi aceita por outro entregador.');
                    }
                  } else if (item.status === 'aceite') {
                    update(ref(db, `entregas/${item.id}`), { status: 'em_transito' });
                    if (!isOnline) toggleTracking(true);
                  } else if (item.status === 'em_transito') {
                    setEntregaEmRota(item);
                    calcRoute(item);
                  }
                }}
                actionLabel={e.status === 'pendente' ? 'ACEITAR' : (e.status === 'aceite' ? 'INICIAR ROTA' : 'VER MAPA')}
                actionColor={e.status === 'em_transito' ? 'var(--secondary)' : null}
              />
            ))
          )}
        </div>
      </main>

      {entregaEmRota && (
        <div className="route-overlay">
          <div className="route-header">
            <button className="btn-back" onClick={() => setEntregaEmRota(null)}>←</button>
            <div style={{flex: 1}}><h2 style={{fontSize: '1rem', fontWeight: 800}}>Navegação</h2></div>
            <div className="delivery-dist">R$ {entregaEmRota.valor}</div>
          </div>
          <div className="map-container">
            <RotaMapa posicao={posicao} entrega={entregaEmRota} rotaInfo={rotaInfo} />
            <div className="map-ui-floating">
              <div className="route-meta">
                <div className="meta-box"><span className="meta-val">{rotaInfo?.distanciaTotal?.toFixed(1) || '--'}</span><span className="meta-lab">KM TOTAL</span></div>
                <div className="meta-box"><span className="meta-val">{rotaInfo?.distanciaColeta?.toFixed(1) || '--'}</span><span className="meta-lab">COLETA</span></div>
                <div className="meta-box"><span className="meta-val">{rotaInfo?.distanciaEntrega?.toFixed(1) || '--'}</span><span className="meta-lab">ENTREGA</span></div>
                <div className="meta-box"><span className="meta-val">{rotaInfo?.tempoTotal || '--'}</span><span className="meta-lab">MIN</span></div>
              </div>
              <div className="nav-shortcuts">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${entregaEmRota.destinoCoords.lat},${entregaEmRota.destinoCoords.lng}`} target="_blank" className="btn-nav-action gmaps">GOOGLE MAPS</a>
                <a href={`waze://?ll=${entregaEmRota.destinoCoords.lat},${entregaEmRota.destinoCoords.lng}&navigate=yes`} className="btn-nav-action waze">WAZE</a>
                <button
                  className="btn-nav-action"
                  style={{background: 'var(--success)', color: '#fff', flex: 1.5}}
                  onClick={async () => {
                    await update(ref(db, `entregas/${entregaEmRota.id}`), { status: 'entregue', entregueEm: Date.now() });
                    setEntregaEmRota(null);
                    setRotaInfo(null);
                  }}
                >
                  FINALIZAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
