// 开发/静态部署占位文件。
// 容器启动时 docker-entrypoint.sh 会用 DATA_MODE、RB_BASE_URL、RB_ENVIRONMENT 等环境变量覆盖本文件。
// 这里保持为空对象，页面会回退到构建时默认值。
window.ESHOP_CONFIG = window.ESHOP_CONFIG || {};