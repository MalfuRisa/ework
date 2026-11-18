# 三方API (配置中心) 对接文档

## 概述

ework 导航站通过「三方API」配置中心动态获取导航数据，支持多种主流配置中心：
- **虹桥计划 (Rainbow Bridge)** — 原内置配置中心
- **Nacos** — 阿里巴巴开源配置中心
- **Apollo** — 携程开源配置中心

配置中心管理各环境下的分类和导航链接，ework 作为消费端读取这些配置并渲染为导航卡片。

## 架构

```
┌─────────────┐         ┌──────────────────────┐
│             │  HTTP   │   Rainbow Bridge     │
│   ework     │ ──────> │   配置管理平台         │
│  导航站      │         │                      │
│             │ <────── │  /api/v1/runtime/overview│
│             │         │  /api/v1/runtime/release│
└─────────────┘         └──────────────────────┘
```

## 数据流

```
页面加载
  │
  ├─ 执行容器生成的 config.js
  │    └─ window.ESHOP_CONFIG（运行配置）
  │
  ├─ 读取 Cookie 中的覆盖配置 (loadRbSettings)
  │    ├─ dataMode: local / remote
  │    ├─ configType: rainbow-bridge / nacos / apollo
  │    ├─ 各配置中心连接参数
  │    └─ skipSslVerify: SSL 证书验证开关
  │
  │  取值优先级：有效浏览器设置 > 容器运行配置 > 构建时默认值
  │
  ├─ dataMode === 'local'
  │    └─ 请求静态 JSON 文件 (COS)
  │
  └─ dataMode === 'remote'
       ├─ configType === 'rainbow-bridge'
       │    ├─ GET /api/v1/runtime/overview（公开，环境/分组顺序）
       │    └─ 对每个分组: GET /api/v1/runtime/release?scope_id=...
       │       （Header 带环境/渠道，读取当前 active；未发布分组隐藏）
       │
       ├─ configType === 'nacos'
       │    └─ GET /v1/cs/configs 直接获取导航 JSON
       │
       └─ configType === 'apollo'
            └─ GET /configs/{appId}/default/{namespace}
               → 提取 navData 配置项
```

---

## API 接口

### 1. 获取环境与分组概览

```
GET {baseUrl}/api/v1/runtime/overview
```

公开接口，无需登录或管理 Cookie。返回已启用的环境与渠道，`pipelines` 顺序即服务端分组顺序（`sort_order ASC, created_at ASC`）。分组标题使用 `pipeline_name`；不能把发布快照里的旧渠道名当作当前标题。

```json
{
  "code": 200,
  "msg": "OK",
  "data": {
    "total": 1,
    "list": [{
      "environment_key": "navi",
      "environment_name": "研发团队",
      "environment_id": "...",
      "pipelines": [{
        "pipeline_key": "smoke",
        "pipeline_name": "监控与排障",
        "scope_id": "...",
        "environment_id": "..."
      }]
    }]
  }
}
```

### 2. 读取分组当前生效版本

```
GET {baseUrl}/api/v1/runtime/release?scope_id={scope_id}&x-environment={environment}&x-pipeline={pipeline_key}
```

实际请求使用 Header `x-environment`、`x-pipeline`，并把概览返回的 `scope_id` 作为 query 固定当前范围代身份。省略 `version` 即读取当前 active；不要用管理接口 `/pipeline/list` 或已删除的旧 `/runtime/config`。

**成功：** HTTP 200 且正文 `code=200`，从 `data.configs` 生成卡片。`data.version`、`data.snapshot_id` 是该次实际读取的快照。

**404 `RELEASE_NOT_ACTIVE`：** 分组尚未发布，隐藏该分组。
**503 或其他错误：** 保留其他成功分组，并提示失败分组名称；不要把错误 JSON 当作卡片。

---

## 卡片顺序

- 仅 `web_link` 的 `content.sort_order` 按数值升序；未设置或非整数放末尾。
- 同顺序按 `alias`，再按 `resource_key` 稳定排序。
- `0` 是有效顺序，不能写成 `sort_order || 0` 后把未设置当成 0。
- 分组顺序完全沿用 `/runtime/overview`，前端不重新排序。

## 网页链接配置（web_link）

虹桥远程模式只为当前生效版本中的 `type: "web_link"` 生成卡片。普通文本、图片、对象、键值对即使包含完整网址也不会显示。
服务端同时校验网址结构，EWork 浏览器端会再次校验，非法或缺失地址的记录直接跳过，同组其他有效链接保留。

### content 格式

```json
{
  "url": "https://example.com/path?from=nav#entry",
  "icon_url": "https://example.com/icon.png",
  "sort_order": 10
}
```

- `url` 必填，必须是带 `http://` 或 `https://` 的完整地址；支持内网域名、IP、端口、查询参数和片段。
- 拒绝空值、相对地址、协议相对地址、其他协议、含用户信息的地址，以及包含控制字符或反斜杠的地址。
- `icon_url` 选填，规则与 `url` 相同；留空或无效时 EWork 显示名称首字母。
- `sort_order` 选填 int32 整数，`0` 有效；留空排在已设置排序的卡片之后。
- 服务端校验失败返回 HTTP 400、`error_type: CONFIG_INVALID_REQUEST`，错误正文可直接展示在网址/图标/排序字段旁。
- `runtime/release` 默认把 `web_link.content` 返回为 JSON 对象；显式 `content_format=raw` 返回 JSON 字符串。

### 旧导航迁移

1. 维护人员从确实用于导航的旧对象或文本中复制名称和网址，新建 `web_link` 配置。例如把试点 `rd1` 对象录入为新别名 `rd1-link`。
2. 对目标渠道完成锁版、创建版本、切换生效，确认 `runtime/release` 中出现 `web_link`。
3. 再切换 EWork 到严格筛选。旧对象、普通业务配置和历史版本留在原处，不批量推断或转换。
4. 回退旧快照时，EWork 只显示该快照中已经存在的 `web_link`；旧对象卡片不会重新出现。需要恢复旧卡片内容时，切回之前的生效版本，或在旧快照中补录 `web_link` 后重新发布。收藏/常用中匹配不到当前 `resource_key` 的旧记录保留在本地但不显示。

---

## Nacos 配置中心

### 接口说明

ework 直接调用 Nacos Open API 获取配置：

```
GET {serverAddr}/v1/cs/configs?dataId={dataId}&group={group}&tenant={namespace}
```

### 数据格式要求

Nacos 配置内容需为 JSON 数组，格式与本地静态文件格式一致：

```json
[
    {
        "title": "开发工具",
        "name": "dev-tools",
        "nav": [
            {
                "name": "GitLab",
                "link": "https://gitlab.com",
                "icon": "https://gitlab.com/favicon.ico",
                "desc": "代码仓库"
            }
        ]
    }
]
```

### 配置步骤

1. 在 Nacos 控制台创建命名空间（或使用 `public`）
2. 创建配置：
   - **Data ID**: `ework-nav.json`
   - **Group**: `DEFAULT_GROUP`
   - **配置格式**: JSON
3. 填入导航数据 JSON 数组
4. 在 ework 设置面板选择「Nacos」类型，填入地址和配置信息

---

## Apollo 配置中心

### 接口说明

ework 调用 Apollo Open API 获取配置：

```
GET {meta}/configs/{appId}/default/{namespace}
```

### 数据格式要求

在 Apollo 中添加一个 key 为 `navData` 或 `ework_nav` 的配置项，value 为 JSON 数组字符串。

### 配置步骤

1. 在 Apollo 门户创建 App（如 `ework-nav`）
2. 在 `application` namespace 中添加配置：
   - **Key**: `navData`
   - **Value**: 导航数据 JSON 数组字符串
3. 发布配置
4. 在 ework 设置面板选择「Apollo」类型，填入地址和配置信息

---

## 环境配置

### 本地开发代理

`vue.config.js` 的 `/rainbow-bridge` 开发代理支持三种上游，前两种保持原有默认行为：

| 配置 | 代理目标 | devServer 端口 | Referer |
|------|----------|----------------|---------|
| 都不设置 | `https://rainbow.me` | 8080 | 自动携带上游 Referer |
| `RB_LOCAL=1` | `http://localhost:8080` | 8081 | 不发送 |
| `RB_PROXY_TARGET=http://host:port` | 指定虹桥 origin | 8081 | 不发送 |

`RB_PROXY_TARGET` 优先于 `RB_LOCAL`，只写 `scheme://host[:port]`；误带 `/rainbow-bridge` 会自动去掉。
设置后可配合 `VUE_APP_RB_BASE_URL=/rainbow-bridge`、`VUE_APP_RB_ENVIRONMENT=<环境 key>` 启动开发服务。

Windows 本地联调可以先双击虹桥的 `start-rainbow.cmd`，再双击 EWork 的 `start-ework.cmd`。EWork 默认在 `http://127.0.0.1:8081/` 监听，通过同源代理连接 `127.0.0.1:18080`。如果虹桥已有 `ework-pilot` 环境则默认读取它，否则读取 `default`。已有浏览器设置优先于启动参数，可在 EWork 设置中恢复默认值，或使用无痕窗口验证。导航仅显示目标环境已生效的「网页链接」。

```powershell
.\start-ework.cmd -Port 8082 -RainbowPort 18081 -EnvironmentKey ework-pilot -NoBrowser
```

> Windows Git Bash/MSYS 会把命令行里以 `/` 开头的 `VUE_APP_RB_BASE_URL` 转成 `D:/...`，页面会报
> `Unsupported protocol D:`。请把 `VUE_APP_RB_BASE_URL=/rainbow-bridge` 写在 `.env.development.local`，
> 或在容器里使用运行配置 `config.js`；启动命令只传 `RB_PROXY_TARGET` 和 `VUE_APP_RB_ENVIRONMENT`。

### 容器运行时变量

容器启动时 `docker-entrypoint.sh` 会把下列环境变量写入 `/usr/share/nginx/html/config.js`，
页面在应用 bundle 之前读取。同一个镜像无需重新构建即可切换虹桥实例和团队环境，改完重启容器生效。

| 变量 | 写入字段 | 说明 | 默认值 |
|------|----------|------|--------|
| `DATA_MODE` | `dataMode` | `local` / `remote` | `local` |
| `CONFIG_TYPE` | `configType` | `rainbow-bridge` / `nacos` / `apollo` | `rainbow-bridge` |
| `RB_BASE_URL` | `baseUrl` | 页面读取虹桥的地址，建议同源 `/rainbow-bridge` | `/rainbow-bridge` |
| `RB_ENVIRONMENT` | `environment` | 团队环境 key | `navi` |
| `LOCAL_DATA_URL` | `localDataUrl` | 本地数据 JSON 地址 | `/nav-data.json` |
| `NACOS_*` | 对应字段 | Nacos 连接参数 | 见下表 |
| `APOLLO_*` | 对应字段 | Apollo 连接参数 | 见下表 |
| `SKIP_SSL_VERIFY` | `skipSslVerify` | `true` / `false` | `true` |

Nginx 反向代理由同一入口脚本渲染，变量只影响服务器侧：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `RB_PROXY_UPSTREAM` | 虹桥 origin，只写 `scheme://host[:port]`，脚本会去掉误带的 `/rainbow-bridge` | `https://rainbow.me` |
| `RB_PROXY_HOST` | 转发 Host 头 | 由上游 host 推导 |
| `RB_PROXY_REFERER` | 转发 Referer；显式设为空串表示不发送 | 由上游 origin 推导 |

请求路径、查询参数 `scope_id` 以及 `x-environment` / `x-pipeline` 请求头默认原样转发。
可直接复制的试点配置见 `deploy/ework-pilot.env.example`。

### 构建时环境变量

不提供运行配置时，页面使用以下构建时默认值：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VUE_APP_ENABLE_RB` | 是否启用三方API功能 | `true` |
| `VUE_APP_DATA_MODE` | 数据模式 `local` / `remote` | `local` |
| `VUE_APP_CONFIG_TYPE` | 配置中心类型 `rainbow-bridge` / `nacos` / `apollo` | `rainbow-bridge` |
| `VUE_APP_LOCAL_DATA_URL` | 本地数据 JSON 地址 | COS 静态文件 |
| `VUE_APP_SKIP_SSL_VERIFY` | 是否跳过 SSL 证书验证（Node.js 环境有效） | `false` |

**虹桥计划相关:**
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VUE_APP_RB_BASE_URL` | 虹桥计划 API 地址 | `http://localhost:8080/rainbow-bridge` |
| `VUE_APP_RB_ENVIRONMENT` | 环境名称 | `navi` |
| `VUE_APP_RB_PIPELINE` | Pipeline（不可用户配置） | `main` |

**Nacos 相关:**
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VUE_APP_NACOS_SERVER_ADDR` | Nacos 服务器地址 | `http://localhost:8848/nacos` |
| `VUE_APP_NACOS_NAMESPACE` | 命名空间 ID | `public` |
| `VUE_APP_NACOS_DATA_ID` | 配置 Data ID | `ework-nav.json` |
| `VUE_APP_NACOS_GROUP` | 配置 Group | `DEFAULT_GROUP` |

**Apollo 相关:**
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VUE_APP_APOLLO_META` | Apollo Meta 服务地址 | `http://localhost:8080` |
| `VUE_APP_APOLLO_APP_ID` | Apollo App ID | `ework-nav` |
| `VUE_APP_APOLLO_NAMESPACE` | Apollo Namespace | `application` |

### 各环境配置

**`.env` (通用默认):**
```
VUE_APP_ENABLE_RB=true
VUE_APP_DATA_MODE=local
VUE_APP_CONFIG_TYPE=rainbow-bridge
VUE_APP_RB_BASE_URL=http://localhost:8080/rainbow-bridge
VUE_APP_RB_ENVIRONMENT=navi
VUE_APP_RB_PIPELINE=main
VUE_APP_NACOS_SERVER_ADDR=http://localhost:8848/nacos
VUE_APP_NACOS_NAMESPACE=public
VUE_APP_NACOS_DATA_ID=ework-nav.json
VUE_APP_NACOS_GROUP=DEFAULT_GROUP
VUE_APP_APOLLO_META=http://localhost:8080
VUE_APP_APOLLO_APP_ID=ework-nav
VUE_APP_APOLLO_NAMESPACE=application
VUE_APP_SKIP_SSL_VERIFY=false
```

**`.env.development` (开发):**
```
VUE_APP_ENABLE_RB=true
VUE_APP_DATA_MODE=remote
VUE_APP_RB_BASE_URL=http://localhost:8080/rainbow-bridge
VUE_APP_RB_ENVIRONMENT=navi
VUE_APP_RB_PIPELINE=dev
```

**`.env.production` (生产):**
```
VUE_APP_ENABLE_RB=true
VUE_APP_DATA_MODE=remote
VUE_APP_RB_BASE_URL=/rainbow-bridge
VUE_APP_RB_ENVIRONMENT=navi
VUE_APP_RB_PIPELINE=prod
```

**`.env.static` (纯静态版):**
```
VUE_APP_ENABLE_RB=false
VUE_APP_DATA_MODE=local
```

### 构建命令

```bash
# 标准版（含虹桥计划功能）
yarn build

# 纯静态版（无虹桥计划功能）
yarn build:static
```

**`VUE_APP_ENABLE_RB=false` 时以下内容被隐藏：**
- 侧边栏底部「三方API」设置按钮
- Header 中的 Pipeline Tag
- 设置面板组件
- 强制使用 local 数据模式，不加载相关模块

### SSL 证书跳过验证

针对自签名证书或内网 HTTPS 服务，可开启「跳过 SSL 证书验证」选项：

- **适用场景**: Node.js 环境（Electron、SSR 等）
- **浏览器限制**: 浏览器环境下此选项不生效（浏览器安全策略不允许跳过证书验证）
- **建议**: 浏览器环境下请安装自签名证书到系统信任根证书存储

### Cookie 覆盖机制

用户可通过侧边栏底部「三方API」设置面板动态修改以下配置，修改后保存在 Cookie (`__rb_settings__`) 中，覆盖编译时默认值：

| Cookie 字段 | 说明 |
|-------------|------|
| `dataMode` | 数据模式覆盖值 |
| `configType` | 配置中心类型 |
| `baseUrl` | 虹桥计划 API 地址 |
| `environment` | 环境名称 |
| `nacosServerAddr` | Nacos 服务器地址 |
| `nacosNamespace` | Nacos 命名空间 |
| `nacosDataId` | Nacos Data ID |
| `nacosGroup` | Nacos Group |
| `apolloMeta` | Apollo Meta 地址 |
| `apolloAppId` | Apollo App ID |
| `apolloNamespace` | Apollo Namespace |
| `skipSslVerify` | 是否跳过 SSL 证书验证 |

**优先级:** 有效的 Cookie 覆盖值 > 容器运行配置 (`window.ESHOP_CONFIG`) > 构建时环境变量默认值

- Cookie 中不存在、类型不合法或无法识别的字段会被忽略，继续向下一层回退。
- 数据类型要求：`dataMode` 只能是 `local`/`remote`，`configType` 只能是 `rainbow-bridge`/`nacos`/`apollo`，
  其余字段为非空字符串，`skipSslVerify` 为布尔值。
- 试点浏览器如果此前保存过设置，会覆盖容器配置；清除 Cookie `__rb_settings__` 或点击设置面板「恢复默认」即可回到容器配置。

**恢复默认:** 点击「恢复默认」按钮清除 Cookie，回到容器运行配置或构建时注入的值。

---

## 在虹桥计划中配置导航

### 步骤

1. **创建/选择环境** — 如 `navi`

2. **创建 Pipeline** — 每个 Pipeline 对应导航站中的一个分类卡片
   - `pipeline_key`: 如 `dev-tools`
   - `pipeline_name`: 如 `开发工具`（将显示为卡片标题）
   - `sort_order`: 控制卡片显示顺序
   - `is_active`: 设为 `true`

3. **在 Pipeline 下创建配置项** — 每个配置项对应一个导航链接
   - `name`: 链接名称，如 `GitLab`
   - `type`: 选择「网页链接」（`web_link`）
   - `content`: 填写网址，选填图标网址和排序值

4. **验证** — 在 ework 中将数据模式切换为 `remote`，填入 API 地址和环境名称，保存后页面自动刷新加载数据

### 配置示例

**Pipeline: 开发工具 (dev-tools)**

| 配置项 name | type | content |
|-------------|------|---------|
| GitLab | web_link | `{"url":"https://gitlab.com","icon_url":"https://gitlab.com/favicon.ico","sort_order":10}` |
| Jenkins | web_link | `{"url":"https://jenkins.io","sort_order":20}` |
| Nginx | web_link | `{"url":"https://nginx.org","sort_order":30}` |

**Pipeline: 文档管理 (docs)**

| 配置项 name | type | content |
|-------------|------|---------|
| ShowDoc | web_link | `{"url":"https://showdoc.com","sort_order":0}` |
| Confluence | web_link | `{"url":"https://confluence.com","sort_order":10}` |

---

## 文件结构

```
src/
├── api/
│   ├── github.js          # 数据获取入口，读取 Cookie 配置分发请求
│   └── config.js           # 配置中心 API 客户端 (Rainbow Bridge / Nacos / Apollo)
├── common/js/
│   └── cache.js            # Cookie 存储 (收藏/常用/三方API设置)
├── components/
│   ├── main.vue            # 主布局，侧边栏设置入口
│   ├── settings.vue        # 三方API 设置面板
│   └── card/
│       ├── sub.vue         # 分类卡片容器
│       └── nav.vue         # 导航链接项
└── store/                  # Vuex (收藏/常用)
```

容器运行配置相关：

```
public/config.js               # 占位文件，容器启动时由 entrypoint 覆盖
public/index.html              # 在应用 bundle 之前加载 config.js
nginx.conf.template            # /rainbow-bridge/ 代理模板
docker-entrypoint.sh           # 生成 config.js 并渲染 Nginx 配置
deploy/ework-pilot.env.example # 内网试点配置示例
```

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| API 地址不可达 | 页面提示「数据加载失败，请检查配置」 |
| 配置中心返回空数据 | 页面无分类卡片显示 |
| 某个分类配置获取失败 | 该分类显示为空卡片，不影响其他分类 |
| SSL 证书验证失败（浏览器） | 请安装自签名证书到系统信任存储 |
| Cookie 设置后 API 不可用 | 点击「恢复默认」回到编译时配置 |
