# 📌 STATUS DO PROJETO — Salvo em 08/09/2026 às 21:33

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

- **Conta do admin (fixa)**: `marcostheangels@gmail.com` / senha `[SENHA-REMOVIDA]`
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
