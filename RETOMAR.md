# Arquivo de Retomada do Projeto - Sistema de Entregas PRO

**Última atualização:** 02/09/2026 (Versão 4.0 Premium)
**Projeto:** Ecossistema Logístico "Uber Style" - Empresa & Entregador

---

## 🚀 Estado Atual do Sistema

### 💎 Interface & UX (Premium)
- **Painel Empresa 4.0**: Layout profissional reconstruído com padrão administrativo moderno (degradês, cards com sombra, tipografia Inter).
- **Acesso Unificado**: Tela de Login e Cadastro de Empresa agora aparecem **lado a lado** (colunas simultâneas) para visibilidade máxima.
- **Dashboard Interativo**:
    - KPIs (Pendentes, Em Rota, Concluídas) agora são **filtros clicáveis**.
    - Ao clicar em um status, a lista de pedidos abaixo é atualizada instantaneamente.
    - Card de pedidos com bordas coloridas dinâmicas por status.
- **Relatório de Atividades**: Nova seção de histórico detalhado com:
    - Data e Horário exato da conclusão.
    - Nome do Entregador e identificação do veículo (Modelo/Placa).
    - Valor total da corrida e endereços.

### 🛡️ Blindagem & Rastreamento (Industrial)
- **Camada de Sobrevivência**: Ambos os apps possuem serviço nativo Java com:
    - **WakeLock**: Impede o processador de entrar em repouso.
    - **WifiLock**: Mantém o rádio de dados/wifi em alta performance.
    - **Heartbeat (30s)**: Sinal de vida para manter o socket do Firebase aberto.
    - **START_STICKY**: Reinicialização automática pelo Android se o app for morto.
- **Acessibilidade & Sobreposição**: Suporte técnico para manter o app acima de outros e blindado contra fechamento pelo sistema.
- **Inteligência Logística**: 
    - Entregador vê distância exata: `Sua Posição -> Empresa` e `Empresa -> Cliente`.
    - Empresa vê no mapa: Nome, Telefone, Moto e Placa do entregador em tempo real.

---

## 📝 Estrutura de Dados (Firebase)

- **empresas/**: `{ nome, email, telefone, cnpj, endereco, createdAt }`
- **entregadores/**: `{ nome, email, telefone, cpf, veiculo, placa, endereco, status, bloqueado, empresasBloqueadas }`
- **entregas/**: `{ status, valor, descricao, origem, destino, empresaId, empresaNome, empresaTelefone, entregadorId, entregadorNome, createdAt, aceiteAt, entregueEm }`
- **posicoes/**: `{ lat, lng, timestamp, online, source }`

---

## 📂 Status dos Componentes Críticos

| Componente | Estado | Observações |
|---------|--------|-------------|
| `Auth.jsx` (Empresa) | ✅ Premium | Login e Cadastro simultâneos (lado a lado). |
| `Dashboard.jsx` (Empresa) | ✅ Premium | Filtros por status e relatório de conclusões. |
| `LocationService.java` | ✅ Blindado | WakeLock + Heartbeat + High Perf Wifi. |
| `iniciar-empresa.bat` | ✅ v4.0 | Menu interativo, ASCII Art e limpeza de cache. |
| `App-Empresa.apk` | ✅ Build 4.0 | Sincronizado com o novo layout administrativo. |
| `App-Entregador.apk` | ✅ Build 4.0 | Cadastro de veículo/placa e rastreamento full background. |

---

## ⚠️ Configurações Obrigatórias nos Dispositivos

1. **Localização**: Deve ser marcada como **"Permitir o tempo todo"** nas configurações do Android.
2. **Bateria**: O app deve ser configurado como **"Sem Restrições"** ou **"Não Otimizar"**.
3. **Acessibilidade**: Deve ser ativada manualmente para blindagem total do processo contra encerramento forçado.

---

## 🛠️ Comandos de Operação

```bash
# Iniciar Painel Administrativo (Empresa)
.\iniciar-empresa.bat

# Iniciar App do Entregador (Dev)
.\iniciar-entregador.bat

# Iniciar Tudo
.\iniciar-tudo.bat
```

## 📋 Próximos Passos
1. Implementar **Notificações Push (FCM)** para novos pedidos mesmo com o app fechado.
2. Criar aba de **Financeiro** para fechamento mensal de entregadores.
3. Adicionar upload de **Foto do Comprovante** na finalização da entrega.
