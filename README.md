# Sistema de Entregas - Empresa & Entregador

Sistema completo para gestão de entregas com rastreamento em tempo real.

## Apps Incluídos

- **empresa/** - App para empresas solicitarem entregas
- **entregador/** - App para entregadores aceitarem entregas

## Configuração Rápida

### 1. Criar projeto no Firebase
Acesse: https://console.firebase.google.com/

1. Clique em "Adicionar projeto"
2. Nome: `sistema-entregas`
3. Desative Google Analytics
4. Clique "Criar projeto"

### 2. Habilitar Autenticação
1. Menu lateral → "Authentication" → "Primeiros passos"
2. Clique "Email/Senha"
3. Ative "Email/Senha" → "Salvar"

### 3. Criar Realtime Database
1. Menu lateral → "Realtime Database" → "Criar banco de dados"
2. Localização: São Paulo
3. "Iniciar no modo de teste"
4. "Ativar"

### 4. Obter Credenciais
1. Clique no ícone de engrenagem (Configurações)
2. Role até "Seus apps" → clique no ícone web `</>`
3. Registre o app
4. Copie o `firebaseConfig`

### 5. Atualizar Código
No terminal, na pasta do projeto:

```bash
node update-firebase.js SUA_API_KEY SEU_AUTH_DOMAIN SEU_PROJECT_ID SEU_STORAGE_BUCKET SEU_SENDER_ID SEU_APP_ID
```

Exemplo:
```bash
node update-firebase.js AIzaSy... firebase-app.firebaseapp.com sistema-entregas.appspot.com 123456789 abcd123
```

### 6. Aplicar Regras de Segurança
1. No Firebase Console → Realtime Database → "Regras"
2. Cole o conteúdo de `firebase-rules.json`

## Executar

**Opção 1 - Batch (Windows)**
```bash
iniciar-tudo.bat
```

**Opção 2 - Manual**
```bash
# Terminal 1 - Empresa (porta 5173)
cd empresa && npm install && npm run dev

# Terminal 2 - Entregador (porta 5174)
cd entregador && npm install && npm run dev
```

## Fluxo de Uso

### Empresa
1. Cadastre-se/Login
2. Clique "+ Nova Entrega"
3. Preencha origem, destino, descrição e valor
4. Aguarde entregador aceitar
5. Acompanhe em tempo real pelo mapa

### Entregador
1. Cadastre-se/Login
2. Veja entregas disponíveis
3. Clique "Aceitar"
4. Clique "Iniciar" para começar
5. Use o mapa para navegação
6. Clique "Finalizar" ao entregar

## Funcionalidades

- [x] Cadastro/Login autenticação Firebase
- [x] Criar entregas com origem/destino/valor
- [x] Lista de entregas por empresa
- [x] Aceitar/rejeitar entregas (entregador)
- [x] Status em tempo real
- [x] Localização GPS do entregador
- [x] Mapa de rastreamento
- [x] PWA instalável
- [x] Design responsivo (mobile/desktop)

## Tecnologias

- React + Vite
- Firebase (Auth + Realtime Database)
- Leaflet (Mapas)
- PWA (Service Worker)
