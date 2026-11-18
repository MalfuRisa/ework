const path = require('path');
// eslint-disable-next-line no-unused-vars
const webpack = require('webpack');
// const UglifyPlugin = require("uglifyjs-webpack-plugin");

// 本地联调开关（默认关闭，保持上游行为）：
//   RB_LOCAL=1 时，/rainbow-bridge 代理到本机运行的虹桥计划后端，
//   并把 devServer 端口让到 8081（8080 留给虹桥）。
//   RB_PROXY_TARGET 可显式指定任意虹桥上游（含内网实例），优先于 RB_LOCAL；
//   同样让出 8080，默认端口 8081。
// 开关可以写在 shell 里，也可以写在已被 gitignore 的 .env.development.local 中。
const RB_LOCAL = process.env.RB_LOCAL === '1'
const RB_PROXY_TARGET_RAW = (process.env.RB_PROXY_TARGET || '').trim()
const RB_PROXY_CUSTOM = RB_PROXY_TARGET_RAW !== ''
if (RB_PROXY_CUSTOM && !/^https?:\/\//i.test(RB_PROXY_TARGET_RAW)) {
    throw new Error('RB_PROXY_TARGET must start with http:// or https://')
}
// 只接受 origin；误带 /rainbow-bridge 时去掉，避免和 location 前缀重复。
const RB_PROXY_CUSTOM_TARGET = RB_PROXY_TARGET_RAW
    .replace(/\/+$/, '')
    .replace(/\/rainbow-bridge$/, '')

// 代理目标：显式上游 / 本机虹桥 / 上游线上实例
const RB_PROXY_TARGET = RB_PROXY_CUSTOM
    ? RB_PROXY_CUSTOM_TARGET
    : (RB_LOCAL ? 'http://localhost:8080' : 'https://rainbow.me')

// rainbow.me 线上实例要求携带 Referer，本机/自建上游默认不发送
const RB_PROXY_OPTIONS = {
    target: RB_PROXY_TARGET,
    changeOrigin: true,
    secure: false,
    ...(RB_LOCAL || RB_PROXY_CUSTOM ? {} : { headers: { 'Referer': RB_PROXY_TARGET } })
}


module.exports = {
    // 基本路径
    publicPath: './',
    // 输出文件目录
    outputDir: 'dist',
    // eslint-loader 是否在保存的时候检查
    lintOnSave: true,
    // webpack配置
    // see https://github.com/vuejs/vue-cli/blob/dev/docs/webpack.md
    chainWebpack: () => {
    },
    configureWebpack: (config) => {
        if (process.env.NODE_ENV === 'production') {
            // 为生产环境修改配置...
            config.mode = 'production';
            // 将每个依赖包打包成单独的js文件
            let optimization = {
                runtimeChunk: 'single',
                splitChunks: {
                    chunks: 'all',
                    maxInitialRequests: Infinity,
                    minSize: 20000, // 依赖包超过20000bit将被单独打包
                    cacheGroups: {
                        vendor: {
                            test: /[\\/]node_modules[\\/]/,
                            name(module) {
                                // get the name. E.g. node_modules/packageName/not/this/part.js
                                // or node_modules/packageName
                                const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1]
                                // npm package names are URL-safe, but some servers don't like @ symbols
                                return `npm.${packageName.replace('@', '')}`
                            }
                        }
                    }
                },
                minimizer: [
                    // new UglifyPlugin({
                    //     uglifyOptions: {
                    //         compress: {
                    //             drop_console: true, // console
                    //             drop_debugger: false,
                    //             pure_funcs: ["console.log"] // 移除console
                    //         }
                    //     }
                    // })
                ]
            }
            Object.assign(config, {
                optimization
            })
        } else {
            // 为开发环境修改配置...
            config.mode = 'development';
        }

        Object.assign(config, {
            // 开发生产共同配置
            resolve: {
                extensions: ['.js', '.vue', '.json'],
                alias: {
                    '@': path.resolve(__dirname, './src'),
                    '@c': path.resolve(__dirname, './src/components')
                }
            }
        });
    },
    // 生产环境是否生成 sourceMap 文件
    productionSourceMap: false,
    // css相关配置
    css: {
        // 是否使用css分离插件 ExtractTextPlugin
        extract: true,
        // 开启 CSS source maps?
        sourceMap: false,
        // css预设器配置项
        loaderOptions: {},
        // 启用 CSS modules for all css / pre-processor files.
        modules: false
    },
    // use thread-loader for babel & TS in production build
    // enabled by default if the machine has more than 1 cores
    parallel: require('os').cpus().length > 1,
    // PWA 插件相关配置
    // see https://github.com/vuejs/vue-cli/tree/dev/packages/%40vue/cli-plugin-pwa
    pwa: {},
    // webpack-dev-server 相关配置
    devServer: {
        open: process.platform === 'darwin',
        host: '0.0.0.0',
        // 联调时让出 8080 给本机虹桥，默认与上游一致
        port: (RB_LOCAL || RB_PROXY_CUSTOM) ? 8081 : 8080,
        https: false,
        hotOnly: false,
        proxy: {
            '/rainbow-bridge': RB_PROXY_OPTIONS
        },
        // eslint-disable-next-line no-unused-vars
        before: (app) => {
        }
    },
    // 第三方插件配置
    pluginOptions: {
        // ...
    }
};
