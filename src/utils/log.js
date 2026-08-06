// 环境控制：生产环境关闭debug日志
// const IS_DEBUG = import.meta.env.DEV // Vite
// const IS_DEBUG = process.env.NODE_ENV === 'development' // Webpack
const IS_DEBUG = true;
const log = {
  // 调试日志（开发生效，生产直接空函数不执行）
  debug: (...args) => {
    if (!IS_DEBUG) return
    console.debug('[DEBUG]', ...args)
  },
  info: (...args) => console.info('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  log: (...args) => console.log('[LOG]', ...args)
}

export default log