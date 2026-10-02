# MODIFICAÇÕES DO PROJETO — ConectaEntregas (02/10/2026)

Histórico completo das mudanças feitas nesta sequência de versões.
APK do entregador atual: **v1.4.31** (`docs/apk/ConectaEntregas-1.4.31.apk`).

---

## v1.4.23 — Documentos no cadastro + preço sugerido por km (`b64ffae`)

**Cadastro do entregador** (`entregador/src/Auth.jsx`)
- Anexo de documentos no cadastro: CNH, documento da moto (CRLV), comprovante de residência e antecedentes criminais (foto ou PDF, com compressão automática e pré-visualização).

**Cadastro da empresa** (`empresa/src/App.jsx`)
- Novos campos: CNPJ (com máscara) e responsável.
- Anexos: cartão CNPJ, identidade do responsável, comprovante de endereço e contrato social/alvará.

**Painel Master** (`admin/src/App.jsx`)
- Mostra quantos documentos cada cadastro tem + visualização das fotos e botão abrir/baixar PDFs na tela VER DADOS.
- Nova tabela configurável **preço por km + valor mínimo** (`config/precoKm`, padrão R$ 3,00/km, mínimo R$ 8,00).

**Painel da empresa** (`empresa/src/Dashboard.jsx`)
- Em "Nova Entrega", ao selecionar coleta + destino: mostra **quilometragem total + preço sugerido** com botão USAR VALOR SUGERIDO. O valor final é sempre a empresa quem digita.

**Regras Firebase** (`firebase-rules.json`): liberados os campos `cnpj`, `responsavel`, `documentos` em `aprovacoes`.

---

## v1.4.24 — Pedido de aprovação nunca mais é perdido (`274bd46`)

- Cadastro **confere se o pedido foi gravado** no banco; se negado, desfaz tudo, desloga e explica (nunca libera direto).
- Se os campos novos falharem (regras antigas), tenta o pedido mínimo para o Master ver de qualquer jeito.
- App **recria sozinho** pedido órfão recente (perfil sem solicitação), com documentos.
- `APP_VERSAO` 1.4.24 + APK regenerado.

## v1.4.25 — Ban com motivo + CPF válido + fichas + privacidade (`8533e51`)

- **⛔ RECUSAR com motivo** no Master: o entregador vê "Cadastro não aprovado" + motivo no app e **não cria cadastro novo** (bloqueio por aparelho + CPF + telefone + e-mail). Aba **⛔ Recusados** com **✅ DESBANIR** (libera de novo).
- **CPF válido**: cadastro só aceita CPF com dígitos verificadores corretos.
- **📥 FICHA**: baixa dados + fotos de cada entregador (HTML) + botão baixar todas.
- **Privacidade**: entregas e posições GPS não são mais legíveis sem login (link de rastreio do cliente continua funcionando).
- **💾 Salvar meus dados** no login (entra sem digitar toda hora).
- Regras: nós `banidos`, `banidosDispositivos/Cpf/Email/Telefone`, campo `dispositivo`. Novo plugin `@capacitor/device` (ID estável do aparelho).

## v1.4.26 — Trava do "enviando" + WhatsApp na recusa (`594e6c9`)

- Corrigida tela presa em "Enviando sua solicitação" (loop interno; agora tem timeout de 20s e tela de erro com TENTAR DE NOVO).
- Tela de recusa com botão **💬 FALAR NO WHATSAPP** (mensagem pronta + anexos por lá) e **🔄 JÁ FUI LIBERADO** (liberação em tempo real, sem sair/entrar).

## v1.4.27 — Validação visual + pagamento PIX (`9233dfa`)

- Campos errados ficam **vermelhos com mensagem explicativa** (nome, CPF, telefone, e-mail, senha) no login e cadastro; **CPF/e-mail repetidos** bloqueiam em vermelho; nome repetido dá aviso amarelo.
- **💰 Minha chave Pix** no app do entregador.
- Empresa gera **QR Code PIX + copia e cola** (padrão Banco Central, `empresa/src/pix.js`, lib `qrcode`) do valor líquido.
- **Confirmação dupla**: empresa paga → motoboy toca ✅ CAIU/CONFIRMAR (ou ❌ NÃO RECEBI) → só então PAGO CONFIRMADO.

## v1.4.28 — Cadastro fresco nunca libera antes da hora (`ca24e8e`)

- Marca de "cadastro fresco na sessão": app fica preso em "Cadastro em análise" até o banco responder (nem pisca o Dashboard).

## v1.4.29 — Aviso de bloqueio não se perde (`3268d4d`)

- Mensagem de bloqueio/duplicado/erro de regras é salva e **aparece na tela de login** (antes se perdia ao deslogar).

## v1.4.30 — Pedido de aprovação leve (`26f614e`)

- Fotos menores (800px/JPEG 0.6) e **documentos só no perfil** (pedido leve chega em segundos no 4G).
- Cadastro mostra o andamento (Salvando → Enviando → Confirmando).
- Recadastro preserva documentos já enviados.
- Regras: campos `temDocumentos`, `qtdDocumentos`.

## v1.4.31 — Trava total de pagamento (`3c86c9b`, atual)

- Painel da empresa **trava na tela grande de pagamento** quando há entrega concluída sem pagamento (PIX com QR ou outro meio).
- Após pagar, trava em **⏳ AGUARDANDO O MOTOBOY CONFIRMAR**; só libera com o OK dele (✅ CAIU — CONFIRMAR) no app.
- Se ele disser que não recebeu, a tela de pagamento volta até pagar de novo.
- App do motoboy mostra a forma (via Pix ou em dinheiro).

---

## Botão do Master: RESETAR CADASTROS (`877f19d`)

- **🧹 RESETAR CADASTROS (TODOS)** na Zona de Manutenção: apaga entregadores + empresas (aprovados, pendentes, recusados/bloqueados), entregas, chats, GPS e rastreios. Mantém acesso admin e configurações (taxa, preço/km, versão mínima).

## Regras Firebase — OBRIGATÓRIO publicar a cada mudança

`firebase-rules.json` → Firebase Console → Realtime Database → Rules → **Publicar**.
Versões com mudança de regras: v1.4.23, v1.4.25, v1.4.30.

## Processo padrão de release do APK do entregador

1. Subir `APP_VERSAO` (`entregador/src/App.jsx`) + `APP_VERSAO_ENTREGADOR`/`MASTER_BUILD` (`admin/src/App.jsx`).
2. `npm run build` nos 3 apps → `npx cap sync android` → `gradlew assembleDebug`.
3. Copiar APK para `docs/apk/ConectaEntregas-{VERSAO}.apk` + `docs/apk/App-Entregador.apk`.
4. Publicar `dist` em `docs/entregador|empresa|admin`.
5. Commit + push. Definir versão mínima no Master.
