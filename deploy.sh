#!/bin/sh
# Сайтты Cloudflare Pages-ке жариялау: тек сайт файлдарын dist/ ішіне көшіреміз (setup.sql, .git т.б. кірмейді)
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
cp -r *.html css js dist/
npx -y wrangler@latest deploy
