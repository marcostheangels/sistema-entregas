import { useState, useEffect, useRef, useMemo } from 'react';
import { ref, onValue, update, query, orderByChild, equalTo, runTransaction, push, get, set } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { backgroundLocation } from './plugins/BackgroundLocation';
import AppSettings from './plugins/Settings';

// -- ICONS (SVG) --
const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
);

const IconNav = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
);

// Distancia em linha reta entre dois pontos (km)
const haversineKm = (a, b) => {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Estimativa de tempo (min) com media de 25 km/h em zona urbana
const minEstimado = (km) => (km == null ? null : Math.max(1, Math.round(km / (25 / 60))));

// -- MAP COMPONENTS (MapLibre GL: camera gira e inclina, estilo Uber/99) --
// Estilo do mapa: tiles raster do OpenStreetMap (gratis, sem chave)
const estiloMapaOsm = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19
    }
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
};

// Marcador estilo Uber/99: circulo colorido com emoji (elemento DOM)
const elMarcador = (emoji, cor, tamanho = 38) => {
  const el = document.createElement('div');
  el.style.cssText = `width:${tamanho}px;height:${tamanho}px;border-radius:50%;background:${cor};display:flex;align-items:center;justify-content:center;font-size:${Math.round(tamanho * 0.5)}px;box-shadow:0 3px 8px rgba(0,0,0,0.4);border:2.5px solid white;`;
  el.textContent = emoji;
  return el;
};

// Rumo (bearing em graus) indo do ponto a para o ponto b
const calcularRumo = (a, b) => {
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(b.lat * Math.PI / 180);
  const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) -
            Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// Rumo atual (ref atualizada a cada deslocamento de 10 m ou mais)
function useRumo(posicao) {
  const prevRef = useRef(null);
  const rumoRef = useRef(0);
  useEffect(() => {
    if (!posicao) return;
    const prev = prevRef.current;
    if (prev && haversineKm(prev, posicao) > 0.01) {
      rumoRef.current = calcularRumo(prev, posicao);
    }
    prevRef.current = posicao;
  }, [posicao]);
  return rumoRef;
}

// Mapa de navegacao: camera gira junto com a direcao da moto, inclinada estilo Uber
const RotaMapa = ({ posicao, entrega, rotaInfo }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const prontoRef = useRef(false);
  const markerMotoRef = useRef(null);
  const markerColetaRef = useRef(null);
  const markerDestinoRef = useRef(null);
  const rumoRef = useRumo(posicao);
  const seguindoRef = useRef(true);
  const [seguindo, setSeguindo] = useState(true);

  // Cria o mapa uma unica vez
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: estiloMapaOsm,
      center: [-44.9328, -19.9369],
      zoom: 16,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', () => {
      prontoRef.current = true;
      map.addSource('rota', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'linha-rota', type: 'line', source: 'rota',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#6366f1', 'line-width': 7, 'line-opacity': 0.85 }
      });
      map.resize();
    });
    // Qualquer gesto do usuario (arrastar, girar, inclinar, zoom) assume o controle da camera
    const soltar = () => { seguindoRef.current = false; setSeguindo(false); };
    map.on('dragstart', soltar);
    map.on('rotatestart', (e) => { if (e.originalEvent) soltar(); });
    map.on('pitchstart', (e) => { if (e.originalEvent) soltar(); });
    map.on('zoomstart', (e) => { if (e.originalEvent) soltar(); });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Desenha a rota de estrada (OSRM)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const aplicar = () => {
      const src = map.getSource('rota');
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: rotaInfo?.coords?.length
          ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: rotaInfo.coords } }]
          : []
      });
    };
    if (prontoRef.current) aplicar(); else map.once('load', aplicar);
  }, [rotaInfo]);

  // Marcadores de coleta (empresa) e destino (casa)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const montar = () => {
      markerColetaRef.current?.remove(); markerColetaRef.current = null;
      markerDestinoRef.current?.remove(); markerDestinoRef.current = null;
      if (entrega?.origemCoords) {
        markerColetaRef.current = new maplibregl.Marker({ element: elMarcador('🏢', '#f59e0b', 34) })
          .setLngLat([entrega.origemCoords.lng, entrega.origemCoords.lat]).addTo(map);
      }
      if (entrega?.destinoCoords) {
        markerDestinoRef.current = new maplibregl.Marker({ element: elMarcador('🏠', '#10b981', 34) })
          .setLngLat([entrega.destinoCoords.lng, entrega.destinoCoords.lat]).addTo(map);
      }
    };
    if (prontoRef.current) montar(); else map.once('load', montar);
  }, [entrega?.id, entrega?.origemCoords, entrega?.destinoCoords]);

  // Moto + camera seguem a posicao (girando junto com o rumo)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !posicao) return;
    if (!markerMotoRef.current) {
      markerMotoRef.current = new maplibregl.Marker({
        element: elMarcador('🛵', '#3b82f6', 40),
        rotationAlignment: 'map', pitchAlignment: 'map'
      }).setLngLat([posicao.lng, posicao.lat]).addTo(map);
    } else {
      markerMotoRef.current.setLngLat([posicao.lng, posicao.lat]);
    }
    markerMotoRef.current.setRotation(rumoRef.current);
    if (seguindoRef.current) {
      map.easeTo({ center: [posicao.lng, posicao.lat], bearing: rumoRef.current, pitch: 0, duration: 900 });
    }
  }, [posicao, rumoRef]);

  const recentralizar = () => {
    seguindoRef.current = true;
    setSeguindo(true);
    if (posicao && mapRef.current) {
      mapRef.current.easeTo({ center: [posicao.lng, posicao.lat], bearing: rumoRef.current, pitch: 0, duration: 900 });
    }
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {!seguindo && (
        <button onClick={recentralizar} style={{ position: 'absolute', bottom: '14px', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--primary)', borderRadius: '99px', padding: '10px 18px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1 }}>
          🎯 SEGUIR MINHA ROTA
        </button>
      )}
    </div>
  );
};

// Mini mapa fixo no painel: localizacao atual do entregador, estilo Uber/99
const MiniMapa = ({ posicao, online, onExpand }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: estiloMapaOsm,
      center: [-44.9328, -19.9369],
      zoom: 16,
      attributionControl: false
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.on('load', () => map.resize());
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !posicao) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ element: elMarcador('🛵', '#3b82f6', 34) })
        .setLngLat([posicao.lng, posicao.lat]).addTo(map);
      map.jumpTo({ center: [posicao.lng, posicao.lat], zoom: 16 });
    } else {
      markerRef.current.setLngLat([posicao.lng, posicao.lat]);
      map.easeTo({ center: [posicao.lng, posicao.lat], duration: 800 });
    }
  }, [posicao]);

  return (
    <div className="minimapa-wrap">
      <div className="minimapa-header">
        <span className="minimapa-titulo">📍 Minha localização</span>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <span className={`minimapa-status ${online ? 'on' : 'off'}`}>{online ? 'ONLINE' : 'OFFLINE'}</span>
          <button className="minimapa-expand" onClick={onExpand} title="Abrir mapa em tela cheia">⛶</button>
        </div>
      </div>
      <div className="minimapa-mapa">
        <div ref={containerRef} style={{height: '100%', width: '100%'}} />
        {!posicao && <div className="minimapa-aguardando">Aguardando sinal do GPS...</div>}
      </div>
    </div>
  );
};

// Mapa em tela cheia (botao ⛶ do mini mapa)
const MapaCheio = ({ posicao, online, onClose }) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: estiloMapaOsm,
      center: [-44.9328, -19.9369],
      zoom: 16,
      attributionControl: false
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', () => map.resize());
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !posicao) return;
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ element: elMarcador('🛵', '#3b82f6', 40) })
        .setLngLat([posicao.lng, posicao.lat]).addTo(map);
      map.jumpTo({ center: [posicao.lng, posicao.lat], zoom: 16 });
    } else {
      markerRef.current.setLngLat([posicao.lng, posicao.lat]);
      map.easeTo({ center: [posicao.lng, posicao.lat], duration: 800 });
    }
  }, [posicao]);

  return (
    <div className="route-overlay">
      <div className="route-header">
        <button className="btn-back" onClick={onClose}>←</button>
        <div style={{flex: 1}}><h2 style={{fontSize: '1rem', fontWeight: 800}}>Minha localização</h2></div>
        <span className={`minimapa-status ${online ? 'on' : 'off'}`}>{online ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
      <div style={{flex: 1, position: 'relative'}}>
        <div ref={containerRef} style={{height: '100%', width: '100%'}} />
        {posicao && (
          <div style={{position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '99px', padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 1}}>
            📌 {posicao.lat.toFixed(5)}, {posicao.lng.toFixed(5)}
          </div>
        )}
      </div>
    </div>
  );
};

// Chat flutuante do entregador: conversa com as empresas em entrega ativa (igual ao da empresa)
function ChatFlutuanteEnt({ uid, entregas, online, oculto }) {
  const [aberto, setAberto] = useState(false);
  const [conversas, setConversas] = useState({}); // empresaId -> [msgs ordenadas]
  const [ativo, setAtivo] = useState(null);
  const [texto, setTexto] = useState('');
  const [naoLidas, setNaoLidas] = useState({});
  const [erro, setErro] = useState('');
  const contagemAnterior = useRef({});
  const fimRef = useRef(null);

  // Empresas com entrega ativa (aceite/em_transito)
  const ativos = useMemo(() => {
    const ids = new Set(
      entregas.filter(e => ['aceite', 'em_transito'].includes(e.status) && e.empresaId).map(e => e.empresaId)
    );
    return [...ids];
  }, [entregas]);

  const nomeEmpresa = (id) => {
    const candidatos = [
      entregas.find(e => e.empresaId === id)?.empresaNome,
      conversas[id]?.[conversas[id].length - 1]?.empresaNome
    ].filter(Boolean);
    return candidatos.find(n => !n.includes('@')) || candidatos[0] || 'Empresa';
  };

  // Escuta todas as mensagens deste entregador e organiza por empresa
  useEffect(() => {
    if (!uid) return;
    const q = query(ref(db, 'mensagens'), orderByChild('entregadorId'), equalTo(uid));
    return onValue(q, snap => {
      const porEmpresa = {};
      snap.forEach(c => {
        const m = { id: c.key, ...c.val() };
        if (!m.empresaId) return;
        if (!porEmpresa[m.empresaId]) porEmpresa[m.empresaId] = [];
        porEmpresa[m.empresaId].push(m);
      });
      Object.values(porEmpresa).forEach(list => list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));

      const anterior = contagemAnterior.current;
      let chegouNova = false;
      const novas = {};
      Object.entries(porEmpresa).forEach(([eid, list]) => {
        const diff = list.length - (anterior[eid] || 0);
        if (diff > 0 && list[list.length - 1].de === 'empresa') {
          chegouNova = true;
          novas[eid] = diff;
        }
      });
      contagemAnterior.current = Object.fromEntries(Object.entries(porEmpresa).map(([k, v]) => [k, v.length]));
      setConversas(porEmpresa);
      setNaoLidas(prev => {
        const base = { ...prev };
        if (chegouNova) Object.entries(novas).forEach(([eid, n]) => { base[eid] = (base[eid] || 0) + n; });
        const limpo = {};
        Object.entries(base).forEach(([eid, n]) => { if ((porEmpresa[eid] || []).length > 0) limpo[eid] = n; });
        return limpo;
      });
    });
  }, [uid]);

  // Encerra a conversa selecionada quando a entrega termina
  useEffect(() => {
    if (ativo && !ativos.includes(ativo) && (conversas[ativo] || []).length === 0) {
      setAtivo(null);
      setTexto('');
      setErro('');
    }
  }, [ativos, conversas, ativo]);

  // Ao abrir o chat (ou chegar entrega ativa), seleciona automaticamente a conversa
  useEffect(() => {
    if (aberto && !ativo && ativos.length > 0) {
      setAtivo(ativos[0]);
    }
  }, [aberto, ativos, ativo]);

  // Fecha o painel quando nao ha mais entrega ativa nem historico
  useEffect(() => {
    if (aberto && ativos.length === 0 && Object.keys(conversas).length === 0) {
      setAberto(false);
      setAtivo(null);
    }
  }, [aberto, ativos, conversas]);

  useEffect(() => {
    if (aberto && ativo) setNaoLidas(n => ({ ...n, [ativo]: 0 }));
  }, [aberto, ativo, conversas]);

  useEffect(() => {
    if (aberto && fimRef.current) fimRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [aberto, ativo, conversas]);

  const totalNaoLidas = Object.values(naoLidas).reduce((s, n) => s + n, 0);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !ativo) return;
    const entregaAtiva = entregas.find(e => e.empresaId === ativo && ['aceite', 'em_transito'].includes(e.status));
    if (!entregaAtiva) return;
    if (!online) { setErro('Você está offline — fique online para enviar mensagens.'); return; }
    try {
      await push(ref(db, 'mensagens'), {
        empresaId: ativo, entregadorId: uid, empresaNome: nomeEmpresa(ativo),
        entregaId: entregaAtiva.id, texto: t.slice(0, 500), de: 'entregador', timestamp: Date.now()
      });
      setTexto('');
      setErro('');
    } catch { setErro('Erro ao enviar mensagem.'); }
  };

  // Oculto durante navegacao/telas fullscreen (os hooks continuam ativos)
  if (oculto) return null;

  const msgsAtivas = ativo ? (conversas[ativo] || []) : [];

  return (
    <div className="chat-flutuante">
      {aberto && (
        <div className="chat-painel">
          <div className="chat-header">
            <div>
              <div className="chat-titulo">💬 Chat com a Empresa</div>
              <div className="chat-subtitulo">{ativo ? nomeEmpresa(ativo) : 'Nenhuma entrega ativa'}</div>
            </div>
            <button className="chat-fechar" onClick={() => setAberto(false)}>✕</button>
          </div>

          {ativos.length > 1 && (
            <div className="chat-abas">
              {ativos.map(id => (
                <button key={id} className={`chat-aba ${id === ativo ? 'ativa' : ''}`} onClick={() => { setAtivo(id); setErro(''); }}>
                  {nomeEmpresa(id).split(' ')[0]}
                  {naoLidas[id] > 0 && <span className="chat-badge-aba">{naoLidas[id]}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="chat-mensagens">
            {!ativo && <div className="chat-vazio">O chat fica disponível durante uma entrega ativa (aceite ou em rota).</div>}
            {ativo && msgsAtivas.length === 0 && <div className="chat-vazio">Nenhuma mensagem ainda. Diga algo à empresa!</div>}
            {msgsAtivas.map(m => (
              <div key={m.id} className={`chat-msg ${m.de === 'entregador' ? 'minha' : 'dele'}`}>
                <div className="chat-bolha">{m.texto}</div>
                <div className="chat-hora">{m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
              </div>
            ))}
            <div ref={fimRef} />
          </div>

          {ativo && ativos.includes(ativo) && (
            <div className="chat-input-linha">
              {erro && <div style={{width:'100%', fontSize:'0.7rem', color:'#fbbf24', fontWeight:700, padding:'0 4px 4px'}}>{erro}</div>}
              <input value={texto} onChange={e => { setTexto(e.target.value); setErro(''); }} onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
                placeholder="Mensagem para a empresa..." maxLength={500} />
              <button onClick={enviar}>➤</button>
            </div>
          )}
          {ativo && !ativos.includes(ativo) && (
            <div className="chat-vazio" style={{padding: '12px 20px', fontSize: '0.75rem'}}>✅ Entrega concluída — chat encerrado</div>
          )}
        </div>
      )}

      <button className="chat-fab" onClick={() => setAberto(a => !a)} title="Chat com as empresas">
        {aberto ? '✕' : '💬'}
        {!aberto && totalNaoLidas > 0 && <span className="chat-badge">{totalNaoLidas}</span>}
      </button>
    </div>
  );
}

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

// Itens de saude agrupados por categoria (tela dedicada)
const GRUPOS_SAUDE = [
  { titulo: '📍 Localização', itens: [
    { key: 'localizacao', icon: '📍', name: 'GPS / Localização', desc: 'Necessário para as rotas', acao: 'openLocationSettings' },
    { key: 'localizacaoSempre', icon: '🌐', name: 'Permissão Sempre', desc: 'Localização em 2º plano', acao: 'openAppSettings' },
  ]},
  { titulo: '🔔 Alertas', itens: [
    { key: 'notificacao', icon: '🔔', name: 'Notificações', desc: 'Alertas de novas entregas', acao: 'openNotificationSettings' },
  ]},
  { titulo: '⚙️ Sistema', itens: [
    { key: 'bateria', icon: '🔋', name: 'Bateria', desc: 'Sem restrição em segundo plano', acao: 'requestIgnoreBatteryOptimization' },
    { key: 'sobreposicao', icon: '📑', name: 'Sobreposição', desc: 'Popups sobre outros apps (essencial)', acao: 'openOverlaySettings' },
    { key: 'acessibilidade', icon: '🛠️', name: 'Acessibilidade', desc: 'Blindagem do GPS', acao: 'openAccessibilitySettings' },
  ]},
];
const TOTAL_SAUDE = GRUPOS_SAUDE.reduce((n, g) => n + g.itens.length, 0);

// Tela dedicada de Saude do Sistema (fullscreen, organizada em secoes)
function TelaSaude({ permissoes, checkPerms, debugLog, onLimparLog, onClose }) {
  const ok = GRUPOS_SAUDE.reduce((n, g) => n + g.itens.filter(i => permissoes[i.key]).length, 0);
  const tudoOk = ok === TOTAL_SAUDE;
  return (
    <div className="route-overlay">
      <div className="route-header">
        <button className="btn-back" onClick={onClose}>←</button>
        <div style={{flex: 1}}><h2 style={{fontSize: '1rem', fontWeight: 800}}>Saúde do Sistema</h2></div>
        <button onClick={checkPerms} style={{background: 'var(--primary)', color: 'white', border: 'none', padding: '7px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '0.68rem', cursor: 'pointer'}}>ATUALIZAR</button>
      </div>
      <div className="saude-corpo">
        <div className="saude-resumo" style={{background: tudoOk ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${tudoOk ? 'var(--success)' : '#f59e0b'}`}}>
          <div className="saude-resumo-num" style={{color: tudoOk ? 'var(--success)' : '#f59e0b'}}>{ok}/{TOTAL_SAUDE}</div>
          <div>
            <div style={{fontWeight: 800, fontSize: '0.95rem'}}>{tudoOk ? 'Tudo pronto para trabalhar! ✅' : 'Ative os itens pendentes'}</div>
            <div style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
              {tudoOk ? 'Rastreamento e alertas funcionando' : 'Toque em ATIVAR ao lado de cada item em vermelho'}
            </div>
          </div>
        </div>
        <div className="saude-barra">
          <div className="saude-barra-fill" style={{width: `${(ok / TOTAL_SAUDE) * 100}%`, background: tudoOk ? 'var(--success)' : '#f59e0b'}} />
        </div>

        {GRUPOS_SAUDE.map(g => (
          <div key={g.titulo} className="saude-secao">
            <div className="saude-secao-titulo">{g.titulo}</div>
            <div className="perm-list">
              {g.itens.map(i => (
                <PermissionRow key={i.key} icon={i.icon} name={i.name} desc={i.desc}
                  status={permissoes[i.key]} onAction={() => AppSettings[i.acao]()} />
              ))}
            </div>
          </div>
        ))}

        <div className="saude-secao">
          <div className="saude-secao-titulo" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>🧪 Diagnóstico (últimos eventos)</span>
            {debugLog.length > 0 && (
              <button onClick={onLimparLog} style={{background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.05em'}}>LIMPAR</button>
            )}
          </div>
          <div className="saude-log">
            {debugLog.length === 0
              ? <div className="saude-log-vazio">Nenhum evento registrado. Tudo normal.</div>
              : debugLog.map((l, i) => <div key={i} className="saude-log-item">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

const DeliveryCard = ({ entrega, posicao, empresas, onAction, actionLabel, actionColor }) => {
  // Nome do estabelecimento: nunca mostra e-mail se houver nome real
  const candidatosNome = [entrega.empresaNome, empresas[entrega.empresaId]?.nome].filter(Boolean);
  const nomeEmpresa = candidatosNome.find(n => !n.includes('@')) || candidatosNome[0] || 'Estabelecimento';
  const distParaColeta = useMemo(() => {
    if (!posicao || !entrega.origemCoords) return null;
    return haversineKm(posicao, entrega.origemCoords);
  }, [posicao, entrega.origemCoords]);

  return (
    <div className="delivery-card animate-fade">
      <div className="delivery-header">
        <span className="delivery-price">R$ {entrega.valor}</span>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
          {distParaColeta !== null && <span className="delivery-dist" style={{fontSize: '0.7rem', color: 'var(--warning)'}}>Até a coleta: {distParaColeta.toFixed(1)} km (~{minEstimado(distParaColeta)} min)</span>}
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
            {nomeEmpresa}
          </span>
          {entrega.empresaTelefone && (
            <span className="address-value" style={{fontSize: '0.9rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px'}}>
              📞 {entrega.empresaTelefone}
            </span>
          )}
          <span className="address-value">{entrega.origemEndereco || entrega.origem}</span>
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
            <span className="address-value">{entrega.destinoEndereco || entrega.destino}</span>
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

// Som DE MENSAGEM: dois bipes agudos curtos (distinto do alarme de nova oferta)
const tocarChimeMensagem = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [1174.66, 0.18]].forEach(([freq, t]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.35);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.4);
    });
  } catch { /* dispositivo sem audio */ }
};

export default function Dashboard({ user }) {
  const [entregas, setEntregas] = useState([]);
  const [statusFiltro, setStatusFiltro] = useState('disponivel');
  const entregasVistasRef = useRef(new Set());
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
  const [saudeAberta, setSaudeAberta] = useState(false);
  const [mapaCheio, setMapaCheio] = useState(false);
  const okSaude = GRUPOS_SAUDE.reduce((n, g) => n + g.itens.filter(i => permissoes[i.key]).length, 0);
  const tudoOkSaude = okSaude === TOTAL_SAUDE;

  const watchId = useRef(null);
  const onlineRef = useRef(false);
  const posicoesRef = useRef({});
  const blockedGlobalRef = useRef(false);
  const empresasBloqueadasRef = useRef({});
  const [mensagemNova, setMensagemNova] = useState(null);
  const lastMsgTs = useRef(Date.now());
  const workerRef = useRef(null);
  const wakeLockRef = useRef(null);

  const addLog = (msg) => {
    setDebugLog(prev => [new Date().toLocaleTimeString() + ': ' + msg, ...prev.slice(0, 9)]);
  };

  const checkPerms = () => {
    AppSettings.checkPermissions().then(res => setPermissoes(res)).catch(e => addLog('Perm Erro: ' + e.message));
  };

  // Monitora se o entregador está bloqueado
  useEffect(() => {
    // Busca nomes das empresas para mostrar no alerta de bloqueio
    const unsubEmpresas = onValue(ref(db, 'empresas'), snap => {
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
    return () => { unsubEmpresas(); unsub(); };
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
        tocarChimeMensagem();
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

  // Despacho inteligente: alarme apenas para entregadores LIVRES.
  // Se todos os online estiverem ocupados, toca para todos.
  // Detecta entregas NOVAS por ID (nao por contagem), entao funciona mesmo
  // depois de o app ficar congelado em segundo plano.
  const avaliarDespacho = () => {
    const pendentesVisiveis = Object.keys(entregasStore.current.pendentes || {}).filter(id => {
      if (blockedGlobalRef.current) return false;
      const e = entregasStore.current.pendentes[id];
      if (empresasBloqueadasRef.current[e.empresaId]) return false;
      return true;
    });
    const novasEntregas = pendentesVisiveis.filter(id => !entregasVistasRef.current.has(id));

    const souOcupado = Object.values(entregasStore.current.minhas || {}).some(e => e.status === 'aceite' || e.status === 'em_transito');
    const ocupados = new Set(
      [...Object.values(entregasStore.current.aceite || {}), ...Object.values(entregasStore.current.transito || {})]
        .map(e => e.entregadorId).filter(Boolean)
    );
    const agoraTs = Date.now();
    const livresOnline = Object.entries(posicoesRef.current).filter(([id, p]) =>
      id !== user.uid && p.online && agoraTs - (p.timestamp || 0) < 120000 && !ocupados.has(id)
    ).length;
    const devoTocar = onlineRef.current && novasEntregas.length > 0 && (!souOcupado || livresOnline === 0);

    if (devoTocar) {
      addLog(souOcupado ? '🔔 Todos ocupados! Nova entrega para você também!' : '🔔 Nova entrega disponível!');
      if (audioRef.current) {
        audioRef.current.loop = true;
        audioRef.current.play().catch(e => addLog('Erro áudio: ' + e.message));
      }
      novasEntregas.forEach(id => entregasVistasRef.current.add(id));
    }

    // Se não houver mais entregas pendentes VISÍVEIS, para a "chamada"
    if (pendentesVisiveis.length === 0 && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    // Queries indexadas: só entregas pendentes + só as minhas (evita baixar o banco inteiro)
    const qPendentes = query(ref(db, 'entregas'), orderByChild('status'), equalTo('pendente'));
    const qMinhas = query(ref(db, 'entregas'), orderByChild('entregadorId'), equalTo(user.uid));
    // Ocupacao de todos os entregadores (para o despacho: tocar so para quem esta livre)
    const qAceite = query(ref(db, 'entregas'), orderByChild('status'), equalTo('aceite'));
    const qTransito = query(ref(db, 'entregas'), orderByChild('status'), equalTo('em_transito'));
    const unsubPosicoes = onValue(ref(db, 'posicoes'), snap => { posicoesRef.current = snap.val() || {}; });

    const unsubPendentes = onValue(qPendentes, (snap) => {
      entregasStore.current.pendentes = snapToMap(snap);
      avaliarDespacho();
      combinarEntregas();
    });
    const unsubMinhas = onValue(qMinhas, (snap) => {
      entregasStore.current.minhas = snapToMap(snap);
      combinarEntregas();
    });
    const unsubAceite = onValue(qAceite, (snap) => { entregasStore.current.aceite = snapToMap(snap); });
    const unsubTransito = onValue(qTransito, (snap) => { entregasStore.current.transito = snapToMap(snap); });
    return () => { unsubPendentes(); unsubMinhas(); unsubAceite(); unsubTransito(); unsubPosicoes(); };
  }, [user.uid]);

  // Reseta o chat quando uma entrega e concluida ('entregue') ou removida do banco
  const statusAnteriorEntregas = useRef({});
  useEffect(() => {
    const atual = {};
    entregas.forEach(e => { atual[e.id] = e.status; });
    const anteriores = statusAnteriorEntregas.current;
    const concluidas = [];
    Object.entries(atual).forEach(([id, st]) => {
      if (st === 'entregue' && anteriores[id] && anteriores[id] !== 'entregue') concluidas.push(id);
    });
    Object.keys(anteriores).forEach(id => {
      if (!(id in atual) && anteriores[id] !== 'entregue') concluidas.push(id);
    });
    statusAnteriorEntregas.current = atual;
    concluidas.forEach(async (entregaId) => {
      try {
        const snap = await get(query(ref(db, 'mensagens'), orderByChild('entregaId'), equalTo(entregaId)));
        const updates = {};
        snap.forEach(c => { updates[c.key] = null; });
        if (Object.keys(updates).length) await update(ref(db, 'mensagens'), updates);
      } catch { /* sem permissao */ }
    });
    // Fecha o popup de mensagem se a conversa da entrega concluida era a aberta
    if (concluidas.length) {
      setMensagemNova(prev => (prev && concluidas.includes(prev.entregaId)) ? null : prev);
    }
  }, [entregas]);

  // Preenche o nome do entregador nas entregas antigas que ficaram sem (relatorio da empresa)
  useEffect(() => {
    if (!user.uid) return;
    const semNome = entregas.filter(e => e.entregadorId === user.uid && !e.entregadorNome);
    if (!semNome.length) return;
    (async () => {
      let nome = '';
      try { nome = (await get(ref(db, `entregadores/${user.uid}`))).val()?.nome || ''; } catch { /* segue */ }
      if (!nome) { try { nome = (await get(ref(db, `aprovacoes/${user.uid}`))).val()?.nome || ''; } catch { /* segue */ } }
      if (!nome) return;
      semNome.forEach(e => update(ref(db, `entregas/${e.id}`), { entregadorNome: nome }).catch(() => {}));
    })();
  }, [entregas, user.uid]);

  // Auto-reparo do perfil: se o cadastro sumiu (reset pelo admin), recria a partir da aprovacao
  useEffect(() => {
    if (!user.uid) return;
    (async () => {
      try {
        const p = await get(ref(db, `entregadores/${user.uid}`));
        if (p.exists()) return;
        const a = await get(ref(db, `aprovacoes/${user.uid}`));
        const d = a.val() || {};
        await set(ref(db, `entregadores/${user.uid}`), {
          nome: d.nome || auth.currentUser?.displayName || '',
          email: d.email || auth.currentUser?.email || '',
          telefone: d.telefone || '',
          cpf: d.cpf || '',
          veiculo: d.veiculo || '',
          placa: (d.placa || '').toUpperCase(),
          endereco: d.endereco || '',
          status: 'disponivel',
          createdAt: Date.now()
        });
      } catch { /* segue mesmo se nao conseguir reparar */ }
    })();
  }, [user.uid]);

  // Keepalive Web: mantem o GPS atualizando mesmo com a aba/janela em segundo plano
  const startKeepalive = () => {
    try {
      const code = "setInterval(function(){ postMessage('tick'); }, 15000);";
      const blob = new Blob([code], { type: 'application/javascript' });
      const w = new Worker(URL.createObjectURL(blob));
      w.onmessage = () => {
        if (!onlineRef.current) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, timestamp: Date.now() };
            update(ref(db, `posicoes/${user.uid}`), { ...p, online: true, source: 'keepalive_web' });
          },
          () => {},
          { enableHighAccuracy: true }
        );
      };
      workerRef.current = w;
    } catch (e) {
      addLog('Keepalive web indisponivel: ' + e.message);
    }
  };

  const stopKeepalive = () => {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  };

  const requestWakeLock = async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock?.request('screen');
    } catch { /* navegador sem suporte */ }
  };

  // Re-adquire o Wake Lock quando o app volta para a frente
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && onlineRef.current) {
        requestWakeLock();
        // App voltou do segundo plano: reavalia entregas pendentes nao vistas
        avaliarDespacho();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== PERMISSOES: obrigatorio permitir a localizacao antes de ficar online =====
  const [permissoesOk, setPermissoesOk] = useState(false);
  const [msgPermissao, setMsgPermissao] = useState('');
  const permOkRef = useRef(false);
  const permOnlineRef = useRef(false); // lembra que ele clicou ONLINE e falta permissao

  const pedirPermissao = () => {
    setMsgPermissao('Pedindo permissão de localização...');
    navigator.geolocation.getCurrentPosition(
      () => {
        permOkRef.current = true;
        setPermissoesOk(true);
        setMsgPermissao('');
        addLog('Permissão de localização OK');
        // Se ele ja tinha clicado em ficar online, conecta agora
        if (permOnlineRef.current) {
          permOnlineRef.current = false;
          toggleTracking(true);
        }
      },
      (err) => {
        setMsgPermissao(
          err.code === 1
            ? '❌ Permissão negada. Segure o ícone do app > Informações do app > Permissões > Localização > Permitir o tempo todo.'
            : '❌ ' + err.message + ' — verifique se o GPS do celular está ligado.'
        );
        addLog('Permissão negada: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  };

  // Checa se a permissao ja foi concedida em algum momento anterior
  useEffect(() => {
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(p => {
        if (p.state === 'granted') {
          permOkRef.current = true;
          setPermissoesOk(true);
        }
        p.onchange = () => {
          permOkRef.current = p.state === 'granted';
          setPermissoesOk(p.state === 'granted');
        };
      }).catch(() => { /* segue pelo fluxo do clique */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTracking = (status) => {
    // Bloqueio: sem permissao de localizacao nao fica online — pede a permissao primeiro
    if (status && !permOkRef.current) {
      permOnlineRef.current = true;
      addLog('Localização não permitida — pedindo permissão...');
      pedirPermissao();
      return;
    }
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
      // Servico nativo (APK): rastreamento em segundo plano via notificacao fixa
      backgroundLocation.startService(
        user.uid,
        localStorage.getItem('ga_email') || user.email || '',
        localStorage.getItem('ga_senha') || ''
      )
        .then(() => addLog('Rastreamento nativo em segundo plano ATIVO'))
        .catch((e) => addLog('Servico background falhou: ' + (e?.message || e)));
      startKeepalive();
      requestWakeLock();
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
      // Para o alarme de nova oferta imediatamente
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      entregasVistasRef.current = new Set();
      backgroundLocation.stopService().catch(() => {});
      stopKeepalive();
      try { wakeLockRef.current?.release?.(); } catch { /* ja liberado */ }
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      update(ref(db, `posicoes/${user.uid}`), { online: false });
    }
  };

  const calcRoute = async (entrega, direto = false) => {
    if (!entrega.origemCoords || !entrega.destinoCoords) return;
    try {
      const { lat: oLat, lng: oLng } = entrega.origemCoords;
      const { lat: dLat, lng: dLng } = entrega.destinoCoords;

      // Se tivermos a posição do entregador, calculamos desde onde ele está.
      // Se não, calculamos apenas entre os pontos da entrega.
      const p = posicao || { lat: oLat, lng: oLng };

      // direto=true (apos a coleta): rota [Entregador] -> [Entrega]
      // direto=false: rota [Entregador] -> [Coleta] -> [Entrega]
      const waypoints = direto
        ? `${p.lng},${p.lat};${dLng},${dLat}`
        : `${p.lng},${p.lat};${oLng},${oLat};${dLng},${dLat}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;
      const res = await fetch(url).then(r => r.json());

      if (res.routes?.[0]) {
        const r = res.routes[0];
        setRotaInfo({
          distanciaTotal: r.distance / 1000,
          distanciaColeta: direto ? 0 : (r.legs[0]?.distance || 0) / 1000,
          distanciaEntrega: (r.legs[r.legs.length - 1]?.distance || 0) / 1000,
          tempoTotal: Math.round(r.duration / 60),
          coords: r.geometry.coordinates
        });
      }
    } catch (e) {
      addLog('Erro Rota: ' + e.message);
    }
  };

  // Ocupacao: estou com entrega ativa? Existem outros entregadores livres online?
  const ocupadosIds = new Set(entregas.filter(e => e.status === 'aceite' || e.status === 'em_transito').map(e => e.entregadorId).filter(Boolean));
  const souOcupadoAgora = ocupadosIds.has(user.uid);
  const livresOnlineAgora = Object.entries(posicoesRef.current).filter(([id, p]) =>
    id !== user.uid && p.online && Date.now() - (p.timestamp || 0) < 120000 && !ocupadosIds.has(id)
  ).length;

  const filtered = entregas.filter(e => {
    if (isBlockedGlobal && statusFiltro === 'disponivel') return false;

    // Filtro por Empresa Bloqueada
    if (statusFiltro === 'disponivel' && empresasBloqueadas[e.empresaId]) return false;

    if (statusFiltro === 'disponivel') {
      if (e.status !== 'pendente') return false;
      // Ocupado so enxerga novas ofertas quando TODOS os online estiverem ocupados
      if (souOcupadoAgora && livresOnlineAgora > 0) return false;
      return true;
    }
    if (statusFiltro === 'minhas') return e.entregadorId === user.uid && (e.status === 'aceite' || e.status === 'em_transito');
    return e.entregadorId === user.uid && e.status === 'entregue';
  });

  // Entrega em navegacao SEMPRE com o status mais recente (vem da lista ao vivo)
  const entregaAtual = entregaEmRota ? (entregas.find(e => e.id === entregaEmRota.id) || entregaEmRota) : null;
  // Distancias ao vivo, estilo Uber: busca o pedido e depois leva o pedido
  const kmColeta = posicao && entregaAtual?.origemCoords ? haversineKm(posicao, entregaAtual.origemCoords) : null;
  const kmDestino = posicao && entregaAtual?.destinoCoords ? haversineKm(posicao, entregaAtual.destinoCoords) : null;
  const emColeta = entregaAtual?.status === 'aceite';
  // KM LEVAR: na busca = trecho coleta->entrega da rota planejada; levando = rota real recalculada (fallback: linha reta)
  const levarKm = emColeta
    ? (rotaInfo?.distanciaEntrega ?? null)
    : (rotaInfo?.distanciaEntrega ?? kmDestino);
  const levarMin = emColeta
    ? null
    : (rotaInfo?.tempoTotal ?? (kmDestino != null ? minEstimado(kmDestino) : null));

  // Recalcula a rota real quando o entregador se move (mais de 300 m do ultimo calculo)
  const ultimaPosRota = useRef(null);
  useEffect(() => {
    if (!entregaAtual || !posicao) return;
    if (entregaAtual.status !== 'em_transito') return;
    if (!ultimaPosRota.current || haversineKm(ultimaPosRota.current, posicao) > 0.3) {
      ultimaPosRota.current = posicao;
      calcRoute(entregaAtual, true);
    }
  }, [posicao, entregaAtual]);

  return (
    <div className="app-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <img src={`${import.meta.env.BASE_URL}logo-192.png`} alt="" style={{width:'34px', height:'34px', borderRadius:'8px', marginRight:'8px', verticalAlign:'middle'}} />
          <h1 style={{display:'inline-block', verticalAlign:'middle'}}>CONECTA<span>ENTREGAS</span></h1>
        </div>
        <div className="nav-actions">
          <button
            onClick={() => toggleTracking(!isOnline)}
            className="status-indicator"
            style={{
               border: 'none',
               background: isOnline ? 'rgba(16, 185, 129, 0.2)' : (permissoesOk ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.25)'),
               cursor: 'pointer'
            }}
          >
            <div className={`dot ${isOnline ? 'dot-online' : 'dot-offline'}`}></div>
            {isOnline ? 'ONLINE' : (permissoesOk ? 'OFFLINE' : 'SEM PERMISSÃO')}
          </button>
          <button className="btn-icon-danger" onClick={() => { if (onlineRef.current) toggleTracking(false); signOut(auth); }}><IconLogout /></button>
        </div>
      </nav>

      <main className="main-scroll">
        {!isOnline && !permissoesOk && (
          <div className="aviso-permissao">
            <span>📍 <strong>Ative a localização</strong> para poder ficar online e receber entregas.</span>
            <button onClick={pedirPermissao}>PERMITIR AGORA</button>
            {msgPermissao && <small>{msgPermissao}</small>}
          </div>
        )}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-label">Hoje</span>
            <span className="stat-value">{entregas.filter(e => e.entregadorId === user.uid && e.status === 'entregue' && e.entregueEm && e.entregueEm >= new Date().setHours(0,0,0,0)).length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Ganhos</span>
            <span className="stat-value" style={{color: 'var(--success)'}}>
              R$ {entregas.filter(e => e.entregadorId === user.uid && e.status === 'entregue' && e.entregueEm && e.entregueEm >= new Date().setHours(0,0,0,0)).reduce((acc, curr) => acc + parseFloat(curr.valor || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Mapa ao vivo da minha localizacao, estilo Uber/99 */}
        <MiniMapa posicao={posicao} online={isOnline} onExpand={() => setMapaCheio(true)} />

        {/* Resumo compacto: abre a tela de Saude do Sistema */}
        <button className="saude-chip" onClick={() => setSaudeAberta(true)}>
          <span className="saude-chip-icon">{tudoOkSaude ? '✅' : '⚠️'}</span>
          <span style={{flex: 1}}>
            <span className="saude-chip-titulo">Saúde do Sistema: {okSaude}/{TOTAL_SAUDE} ativos</span>
            <span className="saude-chip-sub">{tudoOkSaude ? 'Rastreamento e alertas OK' : 'Toque para revisar e ativar o que falta'}</span>
          </span>
          <span className="saude-chip-abrir">ABRIR ›</span>
        </button>

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

        <div className="delivery-grid">
          {filtered.length === 0 ? (
            <div className="vazio">Nenhuma entrega encontrada.</div>
          ) : (
            filtered.map(e => (
              <DeliveryCard
                key={e.id}
                entrega={e}
                posicao={posicao}
                empresas={listaEmpresas}
                onAction={async (item) => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                  }
                  if (item.status === 'pendente') {
                    // Pega o nome do perfil (ou da aprovacao) para gravar na entrega (relatorio da empresa)
                    let nomeEntregador = '';
                    try { nomeEntregador = (await get(ref(db, `entregadores/${user.uid}`))).val()?.nome || ''; } catch { /* segue sem nome */ }
                    if (!nomeEntregador) { try { nomeEntregador = (await get(ref(db, `aprovacoes/${user.uid}`))).val()?.nome || ''; } catch { /* segue sem nome */ } }
                    // Transação: só um entregador consegue aceitar (evita corrida)
                    const result = await runTransaction(ref(db, `entregas/${item.id}`), (atual) => {
                      if (atual === null) return atual;
                      if (atual.status !== 'pendente') return; // Aborta: outro entregador já aceitou
                      return { ...atual, status: 'aceite', entregadorId: user.uid, entregadorNome: nomeEntregador, aceiteAt: Date.now() };
                    });
                    if (!result.committed) {
                      alert('Esta entrega já foi aceita por outro entregador.');
                    }
                  } else if (item.status === 'aceite') {
                    // Abre a navegacao em modo BUSCANDO O PEDIDO (confirma a coleta no mapa)
                    setEntregaEmRota(item);
                    calcRoute(item, false);
                  } else if (item.status === 'em_transito') {
                    setEntregaEmRota(item);
                    calcRoute(item, true);
                  }
                }}
                actionLabel={e.status === 'pendente' ? 'ACEITAR' : (e.status === 'aceite' ? 'VER ROTA' : 'VER MAPA')}
                actionColor={e.status === 'aceite' ? '#f59e0b' : (e.status === 'em_transito' ? 'var(--secondary)' : null)}
              />
            ))
          )}
        </div>
      </main>

      {/* Chat flutuante com as empresas (igual ao do painel da empresa) */}
      <ChatFlutuanteEnt uid={user.uid} entregas={entregas} online={isOnline} oculto={!!entregaAtual || saudeAberta || mapaCheio} />

      {/* Mapa em tela cheia */}
      {mapaCheio && <MapaCheio posicao={posicao} online={isOnline} onClose={() => setMapaCheio(false)} />}

      {/* Tela dedicada de Saude do Sistema */}
      {saudeAberta && (
        <TelaSaude
          permissoes={permissoes}
          checkPerms={checkPerms}
          debugLog={debugLog}
          onLimparLog={() => setDebugLog([])}
          onClose={() => setSaudeAberta(false)}
        />
      )}

      {entregaAtual && (
        <div className="route-overlay">
          <div className="route-header">
            <button className="btn-back" onClick={() => { setEntregaEmRota(null); setRotaInfo(null); }}>←</button>
            <div style={{flex: 1}}><h2 style={{fontSize: '1rem', fontWeight: 800}}>Navegação</h2></div>
            <div className="delivery-dist">R$ {entregaAtual.valor}</div>
          </div>
          <div className="map-container">
            <RotaMapa posicao={posicao} entrega={entregaAtual} rotaInfo={rotaInfo} />
            <div className="map-ui-floating">
              {/* Banner ao vivo, estilo Uber/99: km ate a coleta e depois ate a entrega */}
              {entregaAtual.status === 'aceite' && (
                <div style={{background: 'linear-gradient(90deg, #f59e0b, #d97706)', color: 'white', borderRadius: '12px', padding: '10px 14px', marginBottom: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)'}}>
                  <div style={{fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', opacity: 0.9}}>🛵 BUSCANDO O PEDIDO</div>
                  <div style={{fontSize: '1.25rem', fontWeight: 900}}>
                    {kmColeta != null ? `${kmColeta.toFixed(1)} km até a coleta` : ' indo até a coleta...'}
                    {kmColeta != null && <span style={{fontSize: '0.8rem', fontWeight: 700, opacity: 0.9}}> (~{minEstimado(kmColeta)} min)</span>}
                  </div>
                </div>
              )}
              {entregaAtual.status === 'em_transito' && (
                <div style={{background: 'linear-gradient(90deg, #10b981, #059669)', color: 'white', borderRadius: '12px', padding: '10px 14px', marginBottom: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)'}}>
                  <div style={{fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.06em', opacity: 0.9}}>📦 LEVANDO O PEDIDO</div>
                  <div style={{fontSize: '1.25rem', fontWeight: 900}}>
                    {levarKm != null ? `${levarKm.toFixed(1)} km até a entrega` : ' calculando rota...'}
                    {levarMin != null && <span style={{fontSize: '0.8rem', fontWeight: 700, opacity: 0.9}}> (~{levarMin} min)</span>}
                  </div>
                </div>
              )}
              <div className="route-meta">
                <div className="meta-box"><span className="meta-val">{emColeta ? (kmColeta != null ? kmColeta.toFixed(1) : '--') : '—'}</span><span className="meta-lab">KM BUSCAR</span></div>
                <div className="meta-box"><span className="meta-val">{levarKm != null ? levarKm.toFixed(1) : '--'}</span><span className="meta-lab">KM LEVAR</span></div>
                <div className="meta-box"><span className="meta-val">{rotaInfo?.distanciaTotal?.toFixed(1) || '--'}</span><span className="meta-lab">KM ROTA</span></div>
                <div className="meta-box"><span className="meta-val">{rotaInfo?.tempoTotal || '--'}</span><span className="meta-lab">MIN ROTA</span></div>
              </div>
              <div className="nav-shortcuts">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${entregaAtual.destinoCoords?.lat},${entregaAtual.destinoCoords?.lng}`} target="_blank" className="btn-nav-action gmaps">GOOGLE MAPS</a>
                <a href={`waze://?ll=${entregaAtual.destinoCoords?.lat},${entregaAtual.destinoCoords?.lng}&navigate=yes`} className="btn-nav-action waze">WAZE</a>
                {entregaAtual.status === 'aceite' && (
                  <button
                    className="btn-nav-action"
                    style={{background: '#f59e0b', color: '#fff', flex: 1.5}}
                    onClick={async () => {
                      // Marca que pegou o pedido: muda para LEVANDO e recalcula a rota direto ao destino
                      await update(ref(db, `entregas/${entregaAtual.id}`), { status: 'em_transito', coletaAt: Date.now() });
                      if (!isOnline) toggleTracking(true);
                      ultimaPosRota.current = null;
                      calcRoute(entregaAtual, true);
                    }}
                  >
                    ✅ PEGUEI O PEDIDO
                  </button>
                )}
                {entregaAtual.status === 'em_transito' && (
                <button
                  className="btn-nav-action"
                  style={{background: 'var(--success)', color: '#fff', flex: 1.5}}
                  onClick={async () => {
                    const entregaId = entregaAtual.id;
                    await update(ref(db, `entregas/${entregaId}`), { status: 'entregue', entregueEm: Date.now() });
                    setEntregaEmRota(null);
                    setRotaInfo(null);
                    setMensagemNova(null);
                    setResposta('');
                    // Ignora mensagens antigas (nao reexibe popup com historico)
                    lastMsgTs.current = Date.now();
                    // Apaga o historico de mensagens desta entrega na hora
                    try {
                      const snap = await get(query(ref(db, 'mensagens'), orderByChild('entregaId'), equalTo(entregaId)));
                      const updates = {};
                      snap.forEach(c => { updates[c.key] = null; });
                      if (Object.keys(updates).length) await update(ref(db, 'mensagens'), updates);
                    } catch { /* sem permissao */ }
                  }}
                >
                  FINALIZAR
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
