# Docker 部署说明

## 快速开始

### 1. 本地文件模式（默认）
```bash
docker-compose -f docker-compose.simple.yml up -d
```
访问 http://localhost:8080，使用本地 `nav-data.json` 配置。

### 2. 虹桥计划远程模式
```bash
# 把 DATA_MODE 改为 remote，并确认 RB_ENVIRONMENT / RB_PROXY_UPSTREAM
docker-compose -f docker-compose.simple.yml up -d --build
```

### 3. 完整模式（含 Nacos/Apollo）
```bash
# 启动导航 + Nacos
docker-compose --profile nacos up -d

# 启动导航 + Apollo
docker-compose --profile apollo up -d
```

## 容器运行时配置

镜像构建完成后，`docker-entrypoint.sh` 在每次容器启动时：

1. 根据环境变量生成 `/usr/share/nginx/html/config.js`，对引号、反斜杠、换行等做安全转义；
2. 用 `RB_PROXY_UPSTREAM` 渲染 Nginx 的 `/rainbow-bridge/` 反向代理；
3. 校验并启动 Nginx。

页面在应用 bundle 之前加载 `config.js`，取值优先级为：

```
浏览器「三方API 设置」Cookie (__rb_settings__)  >  容器运行配置 (config.js)  >  构建时默认值
```

因此同一个 EWork 镜像只需调整运行参数即可切换虹桥实例和团队环境，无需重新构建：

```bash
docker run -d --name ework-nav -p 8080:80 \
  -e DATA_MODE=remote \
  -e CONFIG_TYPE=rainbow-bridge \
  -e RB_BASE_URL=/rainbow-bridge \
  -e RB_ENVIRONMENT=<团队环境 key> \
  -e RB_PROXY_UPSTREAM=http://<虹桥主机>:<端口> \
  ework-nav:latest
```

修改环境变量后重启容器生效。如果试点浏览器此前保存过「三方API 设置」，
Cookie `__rb_settings__` 会覆盖容器配置；试点前清除该 Cookie，或在设置面板点击「恢复默认」。
`RB_PROXY_UPSTREAM` 只写 `scheme://host[:port]`，脚本会自动去掉误带的 `/rainbow-bridge`，避免代理路径重复。

### 内网试点配置示例

仓库内的 `deploy/ework-pilot.env.example` 可直接复制填写，Compose 会读取其中的变量：

```bash
cp deploy/ework-pilot.env.example deploy/ework-pilot.env
# 填写 RB_ENVIRONMENT、RB_PROXY_UPSTREAM 等实际值
docker compose --env-file deploy/ework-pilot.env up -d --build
```

启动后可先检查运行配置和公开接口：

```bash
curl -s http://127.0.0.1:8080/config.js
curl -s http://127.0.0.1:8080/rainbow-bridge/api/v1/runtime/overview
curl -s -H 'x-environment: <环境 key>' -H 'x-pipeline: <渠道 key>' \
  'http://127.0.0.1:8080/rainbow-bridge/api/v1/runtime/release?scope_id=<scope_id>'
```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DATA_MODE` | local | 数据模式: `local` / `remote` |
| `CONFIG_TYPE` | rainbow-bridge | 配置中心类型: `rainbow-bridge` / `nacos` / `apollo` |
| `LOCAL_DATA_URL` | /nav-data.json | 本地数据文件路径 |

### 虹桥计划配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `RB_BASE_URL` | /rainbow-bridge | 页面读取虹桥的 API 地址，建议保持同源相对路径 |
| `RB_ENVIRONMENT` | navi | 团队环境 key，对应虹桥 `/runtime/overview` 中的 `environment_key` |
| `RB_PROXY_UPSTREAM` | https://rainbow.me | Nginx 实际代理到的虹桥 origin，只写 `scheme://host[:port]` |
| `RB_PROXY_HOST` | 由上游推导 | 转发时使用的 Host 头，特殊虚拟主机场景才需要显式指定 |
| `RB_PROXY_REFERER` | 由上游推导 | 转发时使用的 Referer；显式设为空串表示不发送 |

`RB_PROXY_HOST` / `RB_PROXY_REFERER` 只在部署方需要覆盖时设置，普通试点不需要。

### Nacos 配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NACOS_SERVER_ADDR` | http://nacos:8848/nacos | 服务地址 |
| `NACOS_NAMESPACE` | public | 命名空间 |
| `NACOS_DATA_ID` | ework-nav.json | 配置 Data ID |
| `NACOS_GROUP` | DEFAULT_GROUP | 配置 Group |

### Apollo 配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `APOLLO_META` | http://apollo:8080 | Meta 服务地址 |
| `APOLLO_APP_ID` | ework-nav | 应用 ID |
| `APOLLO_NAMESPACE` | application | Namespace |

### 其他配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `SKIP_SSL_VERIFY` | true | 跳过 SSL 证书验证 |

## 本地文件注入

修改 `nav-data.json` 文件后重启容器即可生效：
```bash
docker-compose restart ework-nav
```

## 数据格式

nav-data.json 格式示例：

```json
[
  {
    "title": "研发常用地址",
    "name": "backend",
    "nav": [
      {
        "name": "GitHub",
        "link": "https://github.com",
        "icon": "https://github.com/favicon.ico",
        "desc": "代码托管平台"
      },
      {
        "name": "Stack Overflow",
        "link": "https://stackoverflow.com",
        "icon": "https://stackoverflow.com/favicon.ico",
        "desc": "程序员问答社区"
      }
    ]
  },
  {
    "title": "办公常用网址",
    "name": "work",
    "nav": [
      {
        "name": "语雀",
        "link": "https://www.yuque.com",
        "icon": "https://www.yuque.com/favicon.ico",
        "desc": "知识总结，就在此刻"
      }
    ]
  }
]
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 分类显示名称 |
| `name` | string | ✅ | 分类唯一标识 |
| `nav` | array | ✅ | 该分类下的导航链接数组 |
| `nav[].name` | string | ✅ | 链接名称 |
| `nav[].link` | string | ✅ | 跳转地址 |
| `nav[].icon` | string | ❌ | 图标地址 |
| `nav[].desc` | string | ❌ | 描述文字 |

## 常用命令

```bash
# 启动
docker-compose up -d

# 查看日志
docker-compose logs -f ework-nav

# 重启
docker-compose restart ework-nav

# 停止并删除
docker-compose down

# 重新构建镜像
docker-compose build --no-cache
```

## 使用 GitHub Actions 自动构建

本项目已配置 GitHub Actions 支持：

1. 提交代码到 main 分支自动触发构建
2. 构建多架构镜像 (amd64/arm64)
3. 自动推送到 GitHub Container Registry (GHCR)

配置文件位置：`.github/workflows/docker-build.yml`

详细说明请参考 `GITHUB_ACTIONS.md`

### 快速使用预构建镜像

```bash
# 修改 docker-compose.simple.yml 使用预构建镜像
# 注释 build 行，取消 image 注释并替换为你的用户名
# image: ghcr.io/你的用户名/ework-nav:latest

# 直接启动（无需本地构建）
docker-compose -f docker-compose.simple.yml up -d
```
