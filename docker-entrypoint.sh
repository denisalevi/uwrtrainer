#!/bin/sh
set -e

echo "→ Applying database migrations…"
npx prisma migrate deploy

echo "→ Starting UWR Trainer on port ${PORT:-3000}…"
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
