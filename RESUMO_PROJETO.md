# Resumo do Projeto - Sistema de Entregas PRO

**Última atualização:** 08/09/2026 (pós-auditoria de segurança)
**Projeto:** Ecossistema Logístico "Uber Style" - Empresa & Entregador

---

## 🚀 Visão Geral

Dois apps React + Vite + Capacitor 5 com backend Firebase (Auth + Realtime Database):

- **empresa/** — Painel administrativo: cria entregas, mapa da frota em tempo real, bloqueio de entregadores, relatórios e faturamento.
- **entregador/** — App do entregador: aceitar pedidos, rotas OSRM, navegação (Google Maps/Waze), alerta sonoro, histórico de ganhos.
- **android/** (em ambos) — Serviço nativo Java de rastreamento em background (WakeLock, WifiLock, heartbeat 30s, START_STICKY), BootReceiver e serviço de acessibilidade.

## 🛡️ Segurança (08/09/2026)

- **Regras do Firebase endurecidas** (`firebase-rules.json`):
  - Empresa só cria/edita/apaga as próprias entregas (`empresaId === auth.uid`).
  - Entregador só mexe nas entregas que aceitou.
  - Perfis (`empresas/`, `entregadores/`) só escritos pelo próprio dono; bloqueio por empresa restrito à empresa bloqueante.
  - `posicoes/` e `lastHeartbeat` permanecem com escrita livre **apenas por compatibilidade com o serviço nativo Android** (que ainda não usa Firebase Auth) — validação de tipos de dados incluída.
- **Aceite de entrega com `runTransaction`** — dois entregadores não conseguem mais aceitar a mesma entrega.
- **Queries indexadas** — apps só baixam as entregas relevantes (`empresaId` / `status` / `entregadorId`) em vez do banco inteiro.

## 📝 Estrutura de Dados (Firebase)

- **empresas/**: `{ nome, email, telefone, cnpj, endereco, createdAt }`
- **entregadores/**: `{ nome, email, telefone, cpf, veiculo, placa, endereco, status, bloqueado, empresasBloqueadas, lastHeartbeat }`
- **entregas/**: `{ status, valor, descricao, origem, destino, origemCoords, destinoCoords, empresaId, empresaNome, empresaTelefone, entregadorId, entregadorNome, createdAt, aceiteAt, entregueEm }`
- **posicoes/**: `{ lat, lng, timestamp, online, source }`

## ⚠️ Pendências Conhecidas

1. Publicar as novas regras no Firebase Console (Realtime Database → Regras → colar `firebase-rules.json`).
2. Autenticar o serviço nativo Android (Firebase Auth) para remover a exceção de escrita em `posicoes/lastHeartbeat`.
3. Notificações Push (FCM) para novos pedidos com o app fechado.
4. Upload de foto do comprovante na finalização.
5. Migrar OSRM/Nominatim para instâncias próprias em produção (rate limit dos servidores públicos).
