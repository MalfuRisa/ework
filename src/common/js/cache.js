import Cookies from 'js-cookie'

const FAVORITE_KEY = '__favorite__'
const FAVORITE_MAX_LEN = 200

const USED_KEY = '__used__'
const USED_MAX_LEN = 200

function insertArray (arr, val, compare, maxLen) {
    const index = arr.findIndex(compare)
    if (index === 0) {
        arr.forEach(item => {
            if (item.link === val.link && val.num) {
                item.num += 1
            }
        })
        return
    }
    if (index > 0) {
        arr.splice(index, 1)
    }
    arr.unshift(val)
    if (maxLen && arr.length > maxLen) {
        arr.pop()
    }
}

function deleteFromArray (arr, compare) {
    const index = arr.findIndex(compare)
    if (index > -1) {
        arr.splice(index, 1)
    }
}

export function loadFavorite () {
    const value = Cookies.getJSON(FAVORITE_KEY)
    return value || []
}

export function saveFavorite (url) {
    let urls = loadFavorite()
    insertArray(urls, url, (item) => {
        return item.link === url.link
    }, FAVORITE_MAX_LEN)
    Cookies.set(FAVORITE_KEY, urls)
    return urls
}

export function deleteFavorite (url) {
    let urls = loadFavorite()
    deleteFromArray(urls, (item) => {
        return item.link === url.link
    })
    Cookies.set(FAVORITE_KEY, urls)
    return urls
}

export function removeFavorite () {
    Cookies.remove(FAVORITE_KEY)
    return []
}

export function loadUsed () {
    const value = Cookies.getJSON(USED_KEY)
    return value || []
}

export function saveUsed (url) {
    url.num = 1
    let urls = loadUsed()
    insertArray(urls, url, (item) => {
        return url.link === item.link
    }, USED_MAX_LEN)
    Cookies.set(USED_KEY, urls)
    return urls
}

export function deleteUsed (url) {
    let urls = loadUsed()
    deleteFromArray(urls, (item) => {
        return item.link === url.link
    })
    Cookies.set(USED_KEY, urls)
    return urls
}

export function removeUsed () {
    Cookies.remove(USED_KEY)
    return []
}

const RB_SETTINGS_KEY = '__rb_settings__'

const RB_BUILD_DEFAULTS = {
    dataMode: process.env.VUE_APP_DATA_MODE || 'local',
    configType: process.env.VUE_APP_CONFIG_TYPE || 'rainbow-bridge',
    baseUrl: process.env.VUE_APP_RB_BASE_URL || '/rainbow-bridge',
    environment: process.env.VUE_APP_RB_ENVIRONMENT || 'navi',
    localDataUrl: process.env.VUE_APP_LOCAL_DATA_URL || 'https://ework-1251965636.cos.ap-beijing.myqcloud.com/web.json',
    nacosServerAddr: process.env.VUE_APP_NACOS_SERVER_ADDR || 'http://localhost:8848/nacos',
    nacosNamespace: process.env.VUE_APP_NACOS_NAMESPACE || 'public',
    nacosDataId: process.env.VUE_APP_NACOS_DATA_ID || 'ework-nav.json',
    nacosGroup: process.env.VUE_APP_NACOS_GROUP || 'DEFAULT_GROUP',
    apolloMeta: process.env.VUE_APP_APOLLO_META || 'http://localhost:8080',
    apolloAppId: process.env.VUE_APP_APOLLO_APP_ID || 'ework-nav',
    apolloNamespace: process.env.VUE_APP_APOLLO_NAMESPACE || 'application',
    skipSslVerify: process.env.VUE_APP_SKIP_SSL_VERIFY === 'true'
}

const RB_DATA_MODES = ['local', 'remote']
const RB_CONFIG_TYPES = ['rainbow-bridge', 'nacos', 'apollo']
const RB_STRING_KEYS = [
    'baseUrl',
    'environment',
    'localDataUrl',
    'nacosServerAddr',
    'nacosNamespace',
    'nacosDataId',
    'nacosGroup',
    'apolloMeta',
    'apolloAppId',
    'apolloNamespace'
]

function rbString (value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
}

function rbBoolean (value) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized === 'true' || normalized === '1') return true
        if (normalized === 'false' || normalized === '0') return false
    }
    return null
}

// 只接受已知字段和合法类型，非法值视为未设置，继续向下一层回退。
function normalizeRbConfig (value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const config = {}
    if (RB_DATA_MODES.indexOf(value.dataMode) > -1) config.dataMode = value.dataMode
    if (RB_CONFIG_TYPES.indexOf(value.configType) > -1) config.configType = value.configType
    RB_STRING_KEYS.forEach(function (key) {
        const normalized = rbString(value[key])
        if (normalized !== null) config[key] = normalized
    })
    const skipSslVerify = rbBoolean(value.skipSslVerify)
    if (skipSslVerify !== null) config.skipSslVerify = skipSslVerify
    return config
}

function readRuntimeConfig () {
    if (typeof window === 'undefined') return {}
    return normalizeRbConfig(window.ESHOP_CONFIG)
}

// 优先级：有效的浏览器设置 > 容器运行配置(config.js) > 构建默认值
const RB_DEFAULTS = Object.assign({}, RB_BUILD_DEFAULTS, readRuntimeConfig())

export function loadRbSettings () {
    return Object.assign({}, RB_DEFAULTS, normalizeRbConfig(Cookies.getJSON(RB_SETTINGS_KEY)))
}

export function saveRbSettings (settings) {
    Cookies.set(RB_SETTINGS_KEY, normalizeRbConfig(settings))
}

export function removeRbSettings () {
    Cookies.remove(RB_SETTINGS_KEY)
}

export function getRbDefaults () {
    return { ...RB_DEFAULTS }
}
