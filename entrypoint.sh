#!/bin/sh
set -e

TARGET_PORT="${PORT:-3000}"
export PORT="${TARGET_PORT}"
export NITRO_PORT="${TARGET_PORT}"
export HOST="0.0.0.0"
export NITRO_HOST="0.0.0.0"

echo "=================================================="
echo " Starting US GAAP Ledger Server"
echo " Target Port: ${TARGET_PORT}"
echo " Host: 0.0.0.0"
echo "=================================================="

# Se a porta principal for 3000, habilita também a porta 80 em background via socat
# Isso garante que se o Easypanel estiver roteando para a porta 80 por padrão, o tráfego funcione sem erros.
if [ "$TARGET_PORT" = "3000" ]; then
  echo " Enabling dual-port listener: Port 80 forward to Port 3000..."
  socat TCP-LISTEN:80,fork,reuseaddr TCP:127.0.0.1:3000 &
fi

# Executa o servidor standalone Node.js gerado pelo Nitro
exec node .output/server/index.mjs
