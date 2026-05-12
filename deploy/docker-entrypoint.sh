#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "migrate" ]]; then
  exec java -cp /app/app.jar com.example.quiz.MigrateKt
fi

exec java -jar /app/app.jar "$@"
