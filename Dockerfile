# ===================================================
# 1. Estágio de Build (Compilação da Aplicação)
# ===================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Dependências nativas do Alpine se necessárias
RUN apk add --no-cache libc6-compat

# Copia manifestos de dependências
COPY package.json package-lock.json ./

# Instala todas as dependências necessárias para a compilação
RUN npm install

# Copia todo o código-fonte
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

# Garante bind em todas as interfaces de rede e porta 3000 (respeitando env vars externas)
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
ENV PORT=3000
ENV NITRO_PORT=3000

# Copia os artefatos compilados
COPY --from=builder /app/.output ./.output

# Garante permissões adequadas
RUN chown -R node:node /app

# Executa com usuário seguro não-root
USER node

# Porta padrão de exposição
EXPOSE 3000

# Inicializa o servidor web standalone
CMD ["node", ".output/server/index.mjs"]
