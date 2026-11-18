#!/bin/sh

set -eu

HTML_ROOT="${EWORK_HTML_ROOT:-/usr/share/nginx/html}"
CONFIG_FILE="${EWORK_CONFIG_FILE:-$HTML_ROOT/config.js}"
NGINX_TEMPLATE="${EWORK_NGINX_TEMPLATE:-/etc/nginx/templates/rainbow-bridge.conf.template}"
NGINX_CONF="${EWORK_NGINX_CONF:-/etc/nginx/conf.d/default.conf}"

# 把环境变量安全地写入 JS 字符串：反斜杠、双引号、换行、制表符、回车和换页符。
json_escape() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '
        BEGIN { ORS = ""; first = 1 }
        {
            if (!first) printf "\\n"
            first = 0
            gsub(/\t/, "\\t")
            gsub(/\r/, "\\r")
            gsub(/\f/, "\\f")
            printf "%s", $0
        }'
}

bool_value() {
    case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
        true|1|yes|on) echo true ;;
        false|0|no|off) echo false ;;
        *) echo "$2" ;;
    esac
}

data_mode="$(printf '%s' "${DATA_MODE:-local}")"
case "$data_mode" in
    local|remote) ;;
    *)
        echo "invalid DATA_MODE '$data_mode', fallback to local" >&2
        data_mode=local
        ;;
esac

config_type="$(printf '%s' "${CONFIG_TYPE:-rainbow-bridge}")"
case "$config_type" in
    rainbow-bridge|nacos|apollo) ;;
    *)
        echo "invalid CONFIG_TYPE '$config_type', fallback to rainbow-bridge" >&2
        config_type=rainbow-bridge
        ;;
esac

skip_ssl_verify="$(bool_value "${SKIP_SSL_VERIFY:-true}" true)"

# 上游只写 scheme://host[:port]，避免和 Nginx location 叠加出重复的 /rainbow-bridge。
RB_PROXY_UPSTREAM="${RB_PROXY_UPSTREAM:-https://rainbow.me}"
RB_PROXY_UPSTREAM="${RB_PROXY_UPSTREAM%/}"
RB_PROXY_UPSTREAM="${RB_PROXY_UPSTREAM%/rainbow-bridge}"
RB_PROXY_UPSTREAM="${RB_PROXY_UPSTREAM%/}"

case "$RB_PROXY_UPSTREAM" in
    http://*|https://*) ;;
    *)
        echo "RB_PROXY_UPSTREAM must start with http:// or https://" >&2
        exit 1
        ;;
esac

upstream_scheme="${RB_PROXY_UPSTREAM%%://*}"
upstream_host="${RB_PROXY_UPSTREAM#*://}"
upstream_host="${upstream_host%%/*}"
if [ -z "$upstream_host" ]; then
    echo "RB_PROXY_UPSTREAM has no host: $RB_PROXY_UPSTREAM" >&2
    exit 1
fi

RB_PROXY_HOST="${RB_PROXY_HOST:-$upstream_host}"
# 显式设置空串表示不发送 Referer；未设置时沿用上游 origin。
RB_PROXY_REFERER="${RB_PROXY_REFERER-$upstream_scheme://$upstream_host}"
export RB_PROXY_UPSTREAM RB_PROXY_HOST RB_PROXY_REFERER

mkdir -p "$(dirname "$CONFIG_FILE")"
config_tmp="${CONFIG_FILE}.tmp"
cat > "$config_tmp" <<EOF
window.ESHOP_CONFIG = {
  dataMode: "$(json_escape "$data_mode")",
  configType: "$(json_escape "$config_type")",
  baseUrl: "$(json_escape "${RB_BASE_URL:-/rainbow-bridge}")",
  environment: "$(json_escape "${RB_ENVIRONMENT:-navi}")",
  localDataUrl: "$(json_escape "${LOCAL_DATA_URL:-/nav-data.json}")",
  nacosServerAddr: "$(json_escape "${NACOS_SERVER_ADDR:-http://localhost:8848/nacos}")",
  nacosNamespace: "$(json_escape "${NACOS_NAMESPACE:-public}")",
  nacosDataId: "$(json_escape "${NACOS_DATA_ID:-ework-nav.json}")",
  nacosGroup: "$(json_escape "${NACOS_GROUP:-DEFAULT_GROUP}")",
  apolloMeta: "$(json_escape "${APOLLO_META:-http://localhost:8080}")",
  apolloAppId: "$(json_escape "${APOLLO_APP_ID:-ework-nav}")",
  apolloNamespace: "$(json_escape "${APOLLO_NAMESPACE:-application}")",
  skipSslVerify: $skip_ssl_verify
};
EOF
mv "$config_tmp" "$CONFIG_FILE"

mkdir -p "$(dirname "$NGINX_CONF")"
envsubst '${RB_PROXY_UPSTREAM} ${RB_PROXY_HOST} ${RB_PROXY_REFERER}' \
    < "$NGINX_TEMPLATE" > "$NGINX_CONF"

# 供本地/镜像校验只渲染配置，不启动 Nginx。
if [ "${EWORK_RENDER_ONLY:-0}" = "1" ]; then
    exit 0
fi

nginx -t
exec nginx -g 'daemon off;'
