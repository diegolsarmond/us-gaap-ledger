# Guia de Deploy no Easypanel (Produção)

Este projeto foi configurado com um `Dockerfile` multi-stage otimizado para o **TanStack Start + Nitro**, gerando uma imagem de produção leve e com servidor standalone Node.js.

---

## 1. Passo a Passo de Deploy no Easypanel

1. **Acessar o Easypanel**:
   - Entre no seu painel Easypanel e escolha o projeto/ambiente desejado.

2. **Criar um Novo Serviço**:
   - Clique em **+ New Service**.
   - Selecione **App** (Standard Application).
   - Defina o nome do serviço (ex: `us-gaap-ledger`).

3. **Configuração da Fonte (Source)**:
   - Escolha **GitHub** (ou Git Repository).
   - Selecione o repositório `diegolsarmond/us-gaap-ledger` e a branch de produção (`main`).
   - Habilite **Auto Deploy** (opcional, para atualizar a cada push).

4. **Configuração de Build**:
   - Build Method: Selecione **Dockerfile**.
   - Dockerfile Path: `./Dockerfile` (padrão na raiz).
   - Build Context: `.` (padrão na raiz).

5. **Configuração de Portas**:
   - Na aba **Domains** ou **Ports**:
     - **Container Port**: `3000`
     - **Protocol**: `http`
     - Configure o seu domínio (ex: `app.seudominio.com` ou o subdomínio temporário do Easypanel). O Easypanel gerencia o SSL (HTTPS) automaticamente via Let's Encrypt / Traefik.

6. **Variáveis de Ambiente (Environment)**:
   - Por padrão, o Dockerfile já expõe:
     - `NODE_ENV=production`
     - `HOST=0.0.0.0`
     - `PORT=3000`
   - Caso precise de variáveis customizadas futuras (ex: URLs de APIs, chaves), adicione na aba **Environment**.

7. **Healthcheck (Integridade)**:
   - Path: `/`
   - O contêiner possui verificação interna a cada 30s usando `wget` nativo.

8. **Deploy**:
   - Clique em **Deploy** no canto superior direito.
   - Acompanhe os logs de compilação. Quando o build for concluído, o status mudará para **Running**.

---

## 2. Estrutura do Dockerfile Multi-Stage

- **Estágio 1 (`builder`)**:
  - Imagem base: `node:22-alpine`.
  - Instala dependências e compila a aplicação com a variável `NITRO_PRESET=node-server`.
  - Gera o bundle completo em `.output/` (código SSR empacotado + assets estáticos em `.output/public`).

- **Estágio 2 (`runner`)**:
  - Imagem base: `node:22-alpine`.
  - Executa como usuário não-root (`USER node`).
  - Copia somente o diretório `.output/`, resultando em uma imagem mínima, rápida de iniciar e sem arquivos desnecessários de desenvolvimento.
  - Expõe a porta `3000` com comando `node .output/server/index.mjs`.

---

## 3. Teste Local (Opcional)

Se desejar testar a imagem localmente antes de subir para o Easypanel:

```bash
# Construir a imagem Docker
docker build -t us-gaap-ledger:prod .

# Executar o contêiner mapeando a porta 3000
docker run -d -p 3000:3000 --name us-gaap-app us-gaap-ledger:prod

# Acessar no navegador
http://localhost:3000
```
