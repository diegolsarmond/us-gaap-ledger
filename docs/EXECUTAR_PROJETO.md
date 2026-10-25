# Executar o LedgerX com login

Requisitos: Node.js 22.12+ e PostgreSQL 16+. O banco precisa estar acessível pelo servidor da aplicação.

## 1. Criar o banco

Edite `database/000_create_database.sql`, substituindo `CHANGE_ME` por uma senha forte. Execute como administrador do PostgreSQL, fora de uma transação:

```powershell
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f database/000_create_database.sql
psql -h localhost -U ledgerx -d WorldBusiness -v ON_ERROR_STOP=1 -f database/001_auth.sql
```

O segundo script pode ser reexecutado. O primeiro é apenas para a criação inicial. Se o provedor já criou banco e usuário, execute apenas `001_auth.sql` usando essa conexão.

## 2. Configurar e criar o usuário

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

Edite `.env` com a conexão real: `DATABASE_URL=postgresql://ledgerx:SUA_SENHA@localhost:5432/WorldBusiness`. O nome do banco é `WorldBusiness`; o script usa aspas duplas para preservar as letras maiúsculas no PostgreSQL. Codifique caracteres especiais da senha na URL (por exemplo, `@` como `%40`). Nunca coloque DATABASE_URL em variável VITE_ ou publique o arquivo .env.

Crie o primeiro usuário sem gravar a senha no histórico de comandos:

```powershell
$credential = Get-Credential -UserName 'admin@empresa.com' -Message 'Informe a senha inicial (mínimo 12 caracteres)'
$env:LEDGER_INITIAL_PASSWORD = $credential.GetNetworkCredential().Password
node --env-file=.env scripts/create-user.mjs admin@empresa.com "Administrador"
Remove-Item Env:LEDGER_INITIAL_PASSWORD
```

A tela pública `/cadastro`, acessível pelo link Criar conta no login, permite cadastrar nome, e-mail, senha e confirmação. O cadastro usa as mesmas tabelas do script `001_auth.sql`, sem migração adicional. As senhas exigem de 12 a 256 caracteres, e e-mails duplicados são rejeitados. Após cadastrar, entre pela tela de login. Não há usuário ou senha padrão. O script cria outros usuários da mesma forma; e-mail duplicado é rejeitado. Para redefinir uma senha, desative o usuário e revogue suas sessões até que o administrador faça a atualização segura do hash.

## 3. Executar

```powershell
npm.cmd run dev
```

Abra a URL exibida pelo Vite. `/` apresenta o login; o acesso autenticado leva a `/dashboard`. Rotas internas exigem sessão, inclusive por URL direta. O botão Sair revoga a sessão. A sessão dura oito horas e não usa localStorage.

## 4. Produção (Node / Easypanel)

```powershell
$env:NITRO_PRESET = 'node-server'
npm.cmd run build
node --env-file=.env .output/server/index.mjs
```

No Easypanel, configure DATABASE_URL nas variáveis do serviço e use o Dockerfile existente. Execute os scripts de banco e criação de usuário antes do primeiro acesso. Use HTTPS: em produção o cookie usa Secure. Os arquivos .env não devem entrar na imagem Docker.

## Escopo atual

O PostgreSQL armazena usuários, hashes de senha scrypt, sessões (somente hash do token) e controle de tentativas de login (dez por e-mail a cada quinze minutos). Cookies são HttpOnly e SameSite=Lax, e as ações de login/logout usam a proteção CSRF do TanStack Start.

Os módulos contábeis existentes continuam sendo um protótipo com dados de demonstração e persistência local no navegador. Estes scripts NÃO implementam persistência contábil, segregação por cliente ou autorização por função no servidor. Todos os usuários cadastrados acessam o mesmo protótipo. Não use dados reais de múltiplos clientes antes de implementar essa camada.

Para desativar um acesso e revogar sessões, execute comandos parametrizados na ferramenta administrativa, ou substitua o e-mail no exemplo SQL:

```sql
BEGIN;
UPDATE app_users SET active = false WHERE email = 'usuario@empresa.com';
DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM app_users WHERE email = 'usuario@empresa.com');
COMMIT;
```

## Troca obrigatória de senha e logins

Execute `database/009_required_password_change.sql` após as migrações anteriores. Redefinições administrativas exigem nova senha no próximo login. Logins bem-sucedidos são registrados na auditoria como `LOGIN`.
