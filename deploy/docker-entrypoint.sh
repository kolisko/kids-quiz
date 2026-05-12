#!/usr/bin/env bash
set -euo pipefail

cd /app/site

if [[ "${1:-}" == "migrate" ]]; then
  exec java -cp ".kobweb/site/system/site-jvm-1.0-SNAPSHOT.jar" com.example.quiz.api.MigrateKt
fi

rm -f ./.kobweb/server/state.yaml
exec ./.kobweb/server/start.sh "$@"
