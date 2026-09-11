# Guia de Deploy no Easypanel (Produção)

Este projeto utiliza **TanStack Start + Nitro** compilado para um servidor standalone Node.js.

---

## 1. Configuração Correta no Easypanel

Ao criar ou editar o serviço no Easypanel:

1. **Service Type**: **App**
2. **Build Method**: **Dockerfile** (caminho `./Dockerfile`)
3. **Porta do Contêiner (CRÍTICO)**:
   - Vá na aba **Domains** (ou **Ports**):
   - Altere a porta de destino de `80` para **`3000`**.
   - Protocolo: `http`.
   - Se a porta permanecer em `80`, o Easypanel não conseguirá se comunicar com a aplicação e exibirá o erro:
     > *"Service is not reachable. Make sure the service is running and healthy."*

4. **Health Check no Easypanel**:
   - Se houver a seção **Health Check** habilitada no painel do Easypanel:
     - **Path**: `/`
     - **Port**: `3000`
     - **Initial Delay**: `15` segundos

---

## 2. Diagnóstico de Problemas Comuns

### Erro: "Service is not reachable. Make sure the service is running and healthy."

Este erro ocorre por dois motivos principais:

1. **Porta incompatível**:
   - O Easypanel assume porta `80` por padrão em novos serviços. O Node.js/Nitro está escutando na porta **`3000`**.
   - **Solução**: No Easypanel, vá em **Domains** > clique no seu domínio > ajuste a porta para **3000** e salve.

2. **Status Unhealthy**:
   - Removido o healthcheck nativo do Busybox no Dockerfile (o `wget` minimalista do Alpine causava falso-negativo e marcava o contêiner como *unhealthy*). O novo `Dockerfile` inicia o serviço limpo e saudável.

3. **Verificar os Logs**:
   - Vá na aba **Logs** do serviço no Easypanel. Você deve ver a mensagem:
     ```
     ➜ Listening on: http://localhost:3000/ (all interfaces)
     ```
   - Se a linha acima aparecer, a aplicação está rodando 100% e pronta para receber requisições.
