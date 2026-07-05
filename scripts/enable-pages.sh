#!/bin/bash
# 启用 GitHub Pages (Actions 模式)
TOKEN=$(git credential fill <<< "protocol=https
host=github.com" 2>/dev/null | grep "^password=" | cut -d= -f2)

curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/clairechen0088-sketch/daka-pwa/pages" \
  -d '{"build_type":"workflow"}'

echo ""
echo "Done! Check: https://github.com/clairechen0088-sketch/daka-pwa/settings/pages"
