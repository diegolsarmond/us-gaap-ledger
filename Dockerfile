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

# Instala socat para suporte automático a tráfego na porta 80 e 3000 no Easypanel
RUN apk add --no-cache socat

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
ENV PORT=3000
ENV NITRO_PORT=3000

# Copia os artefatos compilados
COPY --from=builder /app/.output ./.output

# Garante a integridade das dependências rastreadas pelo Nitro no runtime
RUN if [ -f .output/server/package.json ]; then cd .output/server && npm install --omit=dev; fi

# Copia o script de inicialização dual-port
COPY entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

# Expõe ambas as portas para compatibilidade com qualquer roteamento no Easypanel
EXPOSE 3000
EXPOSE 80

# Inicializa via script entrypoint
ENTRYPOINT ["/bin/sh", "./entrypoint.sh"]
