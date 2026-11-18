import axios from 'axios'

function createService(skipSslVerify) {
  var config = { timeout: 10000 }
  
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    var https = require('https')
    if (skipSslVerify) {
      config.httpsAgent = new https.Agent({
        rejectUnauthorized: false
      })
    }
  }
  
  var service = axios.create(config)

  service.interceptors.response.use(
    function (resp) { return resp },
    function (error) {
      // eslint-disable-next-line no-console
      console.error('Config API Error:', error)
      return Promise.reject(error)
    }
  )
  
  return service
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

function configSortOrder(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    var parsed = Number(value)
    if (Number.isInteger(parsed)) return parsed
  }
  return null
}

function hasControlCharacter(value) {
  for (var i = 0; i < value.length; i++) {
    var code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true
  }
  return false
}

function isSafeHttpUrl(value) {
  var raw = String(value || '').trim()
  if (!raw || raw.indexOf('\\') > -1 || hasControlCharacter(raw)) return false
  try {
    var parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (!parsed.hostname || parsed.username || parsed.password) return false
    if (parsed.port) {
      var port = Number(parsed.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) return false
    }
    return true
  } catch (e) {
    return false
  }
}

function webLinkContent(c) {
  if (typeof c.content === 'string') {
    try {
      return JSON.parse(c.content)
    } catch (e) {
      return null
    }
  }
  return c.content && typeof c.content === 'object' ? c.content : null
}

// 虹桥远程模式只把当前生效版本中的 web_link 映射为导航卡片。
function configToNavItem(c) {
  if (!c || String(c.type || '').trim() !== 'web_link') return null

  var content = webLinkContent(c)
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null

  var link = String(content.url || '').trim()
  if (!isSafeHttpUrl(link)) return null

  var icon = String(content.icon_url || '').trim()
  return {
    name: c.name || c.alias || '',
    link: link,
    desc: c.remark || c.description || '',
    icon: isSafeHttpUrl(icon) ? icon : '',
    sortOrder: configSortOrder(content.sort_order),
    alias: c.alias || '',
    resourceKey: c.resource_key || ''
  }
}

function navItemCompare(a, b) {
  var aHas = a.sortOrder !== null && a.sortOrder !== undefined
  var bHas = b.sortOrder !== null && b.sortOrder !== undefined
  if (aHas !== bHas) return aHas ? -1 : 1
  if (aHas && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  var aliasCompare = String(a.alias || '').localeCompare(String(b.alias || ''), 'en')
  if (aliasCompare !== 0) return aliasCompare
  return String(a.resourceKey || '').localeCompare(String(b.resourceKey || ''), 'en')
}

function rbErrorInfo(error) {
  var response = error && error.response
  var body = response && response.data
  return {
    status: response && response.status,
    errorType: body && body.error_type,
    message: (body && (body.error || body.msg)) || (error && error.message) || 'unknown error'
  }
}

function fetchPipelineConfig(service, baseUrl, environment, pipeline) {
  return service({
    url: baseUrl + '/api/v1/runtime/release',
    method: 'get',
    headers: {
      'x-environment': environment,
      'x-pipeline': pipeline.pipeline_key
    },
    params: {
      scope_id: pipeline.scope_id
    }
  }).then(function (resp) {
    var body = resp.data
    if (!body || body.code !== 200 || !body.data || !Array.isArray(body.data.configs)) {
      var error = new Error('虹桥返回了无法识别的导航配置')
      error.rbErrorType = body && body.error_type
      throw error
    }
    return body.data.configs
      .map(configToNavItem)
      .filter(function (n) { return n !== null })
      .sort(navItemCompare)
  })
}

export function fetchAllNavData(baseUrl, environment, skipSslVerify) {
  var service = createService(skipSslVerify)
  var root = normalizeBaseUrl(baseUrl)
  return service({
    url: root + '/api/v1/runtime/overview',
    method: 'get'
  }).then(function (resp) {
    var body = resp.data
    if (!body || body.code !== 200 || !body.data || !Array.isArray(body.data.list)) {
      throw new Error('虹桥环境与分组读取失败')
    }
    var env = body.data.list.find(function (item) {
      return item.environment_key === environment
    })
    if (!env) {
      throw new Error('虹桥环境未找到: ' + environment)
    }

    var pipelines = Array.isArray(env.pipelines) ? env.pipelines : []
    var failedGroups = []
    var requests = pipelines.map(function (pipeline) {
      return fetchPipelineConfig(service, root, environment, pipeline).then(function (nav) {
        if (nav.length === 0) return null
        return {
          title: pipeline.pipeline_name || pipeline.pipeline_key,
          name: pipeline.pipeline_key,
          nav: nav
        }
      }).catch(function (error) {
        var info = rbErrorInfo(error)
        if (info.status === 404 && info.errorType === 'RELEASE_NOT_ACTIVE') {
          return null
        }
        failedGroups.push({
          key: pipeline.pipeline_key,
          title: pipeline.pipeline_name || pipeline.pipeline_key,
          status: info.status,
          errorType: info.errorType,
          message: info.message
        })
        return null
      })
    })

    return Promise.all(requests).then(function (results) {
      return {
        groups: results.filter(function (group) { return group !== null }),
        failedGroups: failedGroups
      }
    })
  })
}

export function fetchNacosConfig(serverAddr, namespace, dataId, group, skipSslVerify) {
  var service = createService(skipSslVerify)
  var url = serverAddr + '/v1/cs/configs'
  return service({
    url: url,
    method: 'get',
    params: {
      dataId: dataId,
      group: group,
      tenant: namespace
    }
  }).then(function (resp) {
    var content = resp.data
    if (typeof content === 'string') {
      try {
        return JSON.parse(content)
      } catch (e) {
        return content
      }
    }
    return content
  })
}

export function fetchApolloConfig(meta, appId, namespace, skipSslVerify) {
  var service = createService(skipSslVerify)
  var url = meta + '/configs/' + appId + '/default/' + namespace
  return service({
    url: url,
    method: 'get'
  }).then(function (resp) {
    var body = resp.data
    if (body && body.configurations) {
      var navData = body.configurations.navData || body.configurations.ework_nav
      if (navData) {
        try {
          return JSON.parse(navData)
        } catch (e) {
          return navData
        }
      }
      return body.configurations
    }
    return []
  })
}

export function getLocalData(url, skipSslVerify) {
  var service = createService(skipSslVerify)
  return service({
    url: url,
    method: 'get'
  }).then(function (resp) {
    return resp.data
  })
}
