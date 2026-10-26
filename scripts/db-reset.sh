#!/usr/bin/env bash
# Recria um banco LOCAL do zero (apenas desenvolvimento/testes). Uso: scripts/db-reset.sh keylingo_dev
set -euo pipefail
DB="${1:?informe o nome do banco}"
case "$DB" in *prod*) echo "Recusado: nome parece de produção"; exit 1;; esac
psql "${ADMIN_DATABASE_URL:-postgresql://keylingo:keylingo@localhost:5432/postgres}" -v ON_ERROR_STOP=1 \
  -c "drop database if exists \"$DB\" with (force)" -c "create database \"$DB\""
