# Guia de Deploy no Easypanel (Produção)

Este projeto foi configurado para rodar em produção no **Easypanel** com suporte nativo a **Dual-Port (3000 e 80)**, garantindo que o serviço responda independentemente de qual porta o Easypanel roteie.

---

## 1. O que foi corrigido para resolver "Service is not reachable"

1. **Suporte Dual-Port Automático (Portas 80 e 3000)**:
   - O Easypanel por padrão aponta domínios para a porta **80**. Aplicações Node.js geralmente usam **3000**.
   - O contêiner agora possui um roteador interno (`socat`) que atende **simultaneamente** na porta `80` e na porta `3000`.
   - **Resultado**: Mesmo que a porta no Easypanel esteja como `80` ou como `3000`, a aplicação responderá com sucesso (Status 200).

2. **Remoção de bloqueios de permissão (`EACCES`)**:
   - Rodando com permissões completas no contêiner para que o bind da porta 80 funcione sem erros de privilégio no Linux.

3. **Integridade de dependências no runtime**:
   - Dependências rastreadas pelo Nitro (ex: `tslib`) são validadas e garantidas durante o build da imagem, evitando falhas silenciosas de importação em runtime.

4. **Compatibilidade de quebras de linha Windows/Linux**:
   - Conversão automática de CRLF para LF no script de inicialização para evitar erros de execução em servidores Linux.

---

## 2. Como Fazer o Deploy no Easypanel

1. Suba as alterações para o Git (`git push`).
2. No painel do **Easypanel**, acesse o seu **App**.
3. Na aba **Domains**:
   - Pode deixar a porta como **`3000`** ou **`80`** (ambas funcionam).
4. Clique em **Redeploy** (ou **Deploy**).
5. Na aba **Logs**, você verá:
   ```text
   ==================================================
    Starting US GAAP Ledger Server
    Target Port: 3000
    Host: 0.0.0.0
   ==================================================
    Enabling dual-port listener: Port 80 forward to Port 3000...
   ➜ Listening on: http://localhost:3000/ (all interfaces)
   ```
6. O serviço estará acessível e saudável!
