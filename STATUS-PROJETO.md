# 📌 STATUS DO PROJETO — Salvo em 09/09/2026 às 10:20

## 💻 Instalador Windows para clientes (09/09/2026)
- **`Instalador-ConectaEntregas-Empresas.exe`** na raiz do projeto (112 MB) — instalador NSIS one-click do painel da empresa para PC
- Feito com Electron em `desktop/` — abre `https://marcostheangels.github.io/sistema-entregas/empresa/` em janela própria
- Cliente não instala NADA além do instalador (Electron embutido); atalho na área de trabalho + menu iniciar; desinstala pelo Windows
- Recursos: F5/Ctrl+R recarrega, links externos (Google Maps/Waze/WhatsApp) abrem no navegador padrão, tela de "sem internet" com botão tentar novamente
- Para regerar: `cd desktop && npm run dist` — **rodar em `%TEMP%` se der EPERM no Desktop** (antivírus trava o rename; copiar a pasta, buildar lá e copiar o exe de volta)
- `*.exe` não vai pro GitHub (limite de 100 MB) — distribuir direto aos clientes (WhatsApp/Drive/pendrive)

## 🔐 Segredos removidos do GitHub (09/09/2026)
- Senha do admin saiu do código (`admin/src/App.jsx` agora pede login em branco), do `STATUS-PROJETO.md` e de **todo o histórico do git** (reescrito com git-filter-repo; commits antigos trocaram de hash)
- Alerta de segredo #1 do GitHub (Google API Key do Firebase) resolvido como "wont_fix" — chave de API Firebase web é pública por design; a proteção real são as regras do banco (já fechadas)
- **PENDENTE**: o `git push --force` do histórico limpo está bloqueado pela camada de segurança local; o GitHub ainda mostra a senha nos commits ANTIGOS até o push ser feito

## 🏷️ Rebranding (09/09/2026) — marca: ConectaEntregas
- **ConectaEntregas Master** = Painel Super Admin (admin)
- **ConectaEntregas Empresas** = Painel da Empresa (B2B)
- **ConectaEntregas Entregador** = Aplicativo Mobile (Play Store)
- Renomeado em: títulos das páginas, headers das telas de login e dos painéis, manifests PWA, `app_name` dos APKs Android e landing page. APKs regenerados com os nomes novos.

## 🔒 Auditoria de segurança (09/09/2026)
Rodada completa de testes encontrou e corrigiu falhas nas regras do Firebase:
- **GRAVE**: qualquer conta autenticada podia FALSIFICAR o GPS de qualquer entregador (`posicoes/$uid .write: true`) → agora só o próprio uid
- Qualquer um lia TODAS as entregas e TODOS os chats → agora leitura isolada por query (empresaId/entregadorId/status)
- `lastHeartbeat` era gravável por qualquer um → só o próprio uid
- **Regras publicadas em produção** (`firebase deploy`, 87 testes PASS no emulador)
- **APK do entregador ATUALIZADO é obrigatório**: o serviço nativo de GPS agora faz LOGIN no Firebase (Auth.jsx salva credenciais em localStorage na hora do login). APKs antigos param de rastrear em segundo plano até atualizar
- Erros fixados durante os testes: emulador sem firebase.json (regras vazias), admin sem write na colecao aprovacoes, dependencia firebase-auth no build.gradle

## 🐛 Outro bug encontrado (pendente de correção futura)
- `entregador/public/manifest.json` aponta para ícones inexistentes (icon-192/512.png) e `start_url: "/"` quebra no GitHub Pages — corrigir como na empresa (favicon.svg + start_url relativo)

**🌐 PUBLICADO ONLINE (GitHub Pages)** — repo: `marcostheangels/sistema-entregas`
- Landing: https://marcostheangels.github.io/sistema-entregas/
- Empresa: https://marcostheangels.github.io/sistema-entregas/empresa/
- Entregador: https://marcostheangels.github.io/sistema-entregas/entregador/
- Admin: https://marcostheangels.github.io/sistema-entregas/admin/

**Para atualizar o site**: `npm run build` em cada app alterado → copiar `dist` para
`docs/<app>` → `git add -A && git commit -m "deploy" && git push` (Pages recompila sozinho em ~1 min).

Sistema de entregas: **App da Empresa** + **App do Entregador** + **Painel Admin**, com
Firebase Realtime Database e APKs Android (Capacitor).

---

## ✅ Últimas modificações desta sessão (do commit mais antigo para o mais recente)

| Commit | O que foi feito |
|---|---|
| `08e0007` | Autocomplete de endereço estilo Google (Photon): ícones, rua em negrito, bairro/cidade/CEP, setas ↑↓ + Enter |
| `446aa0e` | Navegação do entregador em visualização de cima (pitch 0), igual Waze/Google Maps, mantendo giro com a direção |
| `e230f5f` | Painel admin: visão geral ao vivo (entregas/faturamento/online), monitor de últimas entregas, busca, suspender entregador |
| `6c4b6c5` | **Despacho inteligente do alarme**: toca só para entregadores LIVRES online; se todos estiverem ocupados, toca para todos |
| `a88c20e` | Fix: `posicoesRef` não declarado quebrava o alarme de nova entrega (ReferenceError) |
| `6d1b1f8` | Fix: autocomplete — Photon não suporta mais `lang=pt` (erro 400); Nominatim falhava por header customizado (CORS); ícone do manifest |
| `972fdb2` | Fix: alarme detecta entrega nova **por ID** (não por contagem) e reavalia ao voltar do segundo plano — entregador que terminou a entrega volta a ser chamado |
| `63f7f53` | Fix: entregador ocupado NÃO vê novas ofertas em "DISPONÍVEIS" enquanto houver entregador livre online |
| `8573cc8` | Fix: mostrar **nome do estabelecimento** em vez do e-mail — perfil da empresa se auto-completa com o nome da aprovação |
| `24aa605` | Popups do mapa da empresa mostram os endereços reais de coleta e entrega |
| `020ab09` | Endereço detalhado (rua, número, bairro) gravado na entrega via reverse geocoding — mapas e cards mostram sempre o endereço correto |
| `263db4f` | Fix: mapa da empresa — popup sem autoPan (não volta mais pro centro ao abrir popup) e ícone do entregador com cache |

---

## 🔑 Informações importantes

- **Conta do admin (fixa)**: `marcostheangels@gmail.com` — a senha NÃO fica em código nem em documentação (você guarda ela; para trocar use o Console do Firebase > Authentication).
- **Regras do Firebase**: `firebase-rules.json` — validadas no emulador (70 testes OK).
  Chat só com entrega ativa + entregador online. Empresa só usa o painel quando aprovada no admin.
- **Mapas (custo zero)**: OpenStreetMap (tiles) + OSRM (rotas reais) + Photon (autocomplete/reverse).
  Navegação voz-a-voz: botões GOOGLE MAPS / WAZE no app do entregador.
- **APKs prontos**: `App-Empresa.apk` e `App-Entregador.apk` na pasta raiz (debug).
- **Teste de regras**: `%TEMP%\regras-teste\teste-regras.mjs` (emulador na porta 9000).

## ▶️ Como rodar

- **Empresa (PC)**: `cd empresa && npm run dev` → http://localhost:5173
- **Entregador**: `cd entregador && npm run dev`
- **Admin**: `cd admin && npm run dev -- --host 127.0.0.1`
- **Gerar APK**: `npm run lint` → `npm run build` → `npx cap sync android` →
  `cd android && gradlew.bat assembleDebug` → copiar `app-debug.apk` para a raiz.

## ⚠️ Pendências / limpeza

1. **Dados de teste no banco** (remover pelo painel admin → botões RESETAR):
   - Empresa "Empresa Teste Debug" (`teste.mapa.debug@gmail.com`) — também existe conta de login
   - Uma entrega de teste R$ 8,00 (foi aceita por um entregador real)
   - Posição fake `testecourier` em `posicoes` (já parou de atualizar, some do mapa em 2 min)
2. **Instalar APKs novos** nos celulares (entregador e empresa) — as correções do alarme/mapa valem só no APK novo.
3. Lint: 9-10 warnings pré-existentes (não bloqueiam nada).

## 🔄 Onde paramos

Última conversa: usuário reportou que o mapa da empresa "voltava pro meio centralizado" →
corrigido (autoPan + cache de ícone), validado ao vivo, APK regenerado e commitado (`263db4f`).
Nenhum item pendente em andamento no código — tudo commitado e salvaguardado neste arquivo.
