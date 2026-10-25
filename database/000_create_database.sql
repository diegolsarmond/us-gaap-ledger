-- Execute conectado ao banco postgres como administrador.
-- Substitua a senha ANTES de executar e use o mesmo valor em DATABASE_URL.
CREATE ROLE ledgerx LOGIN PASSWORD 'CHANGE_ME';
CREATE DATABASE "WorldBusiness" OWNER ledgerx;
-- Depois conecte como ledgerx ao banco WorldBusiness e execute 001_auth.sql.

