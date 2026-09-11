# ===================================================
# 1. Estágio de Build (Compilação da Aplicação)
# ===================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Instala dependências do sistema necessárias se houver pacotes nativos
RUN apk add --no-cache libc6-compat

# Copia manifestos de dependências primeiro para aproveitar o cache do Docker
COPY package.json package-lock.json ./

# Instala todas as dependências necessárias para a compilação
RUN npm install

# Copia todo o código-fonte da aplicação (respeitando o .dockerignore)
COPY . .

# Configura o Nitro para gerar o servidor standalone Node.js (preset node-server)
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production

# Compila a aplicação TanStack Start + Nitro
RUN npm run build

# ===================================================
# 2. Estágio de Produção (Runtime Minimalista)
# ===================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Define variáveis de execução para produção
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Executa com usuário sem privilégios de root por boas práticas de segurança
USER node

# Copia apenas o resultado da compilação (.output) da etapa de build
COPY --from=builder --chown=node:node /app/.output ./.output

# Porta padrão de escuta da aplicação
EXPOSE 3000

# Verificação de integridade (Healthcheck) do contêiner
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

# Inicializa o servidor web standalone
CMD ["node", ".output/server/index.mjs"]
