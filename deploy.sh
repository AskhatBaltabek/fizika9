#!/bin/sh
# Сайтты Cloudflare-ге жариялау: тек сайт файлдарын dist/ ішіне көшіреміз (setup.sql, .git т.б. кірмейді)
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
cp -r *.html css js dist/
# Браузер ескі js/css-ті кэштен алмауы үшін әр жариялауға нұсқа белгісін қосамыз: app.js → app.js?v=…
V=$(date +%s)
sed -i -E "s#(src|href)=\"(js|css)/([^\"?]+)\"#\1=\"\2/\3?v=$V\"#g" dist/*.html
npx -y wrangler@latest deploy
