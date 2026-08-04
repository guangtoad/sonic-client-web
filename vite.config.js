import { defineConfig } from 'vite';
import { join } from 'path';
import vue from '@vitejs/plugin-vue';
// 引入 vue-inspector 插件，支持点击页面元素跳转到 Vue 源代码
import VueInspector from 'vite-plugin-vue-inspector';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Vue 插件，启用编译器的 sourcemap 支持
    vue({
      compilerOptions: {
        preserveWhitespace: true,
      },
    }),
    // Vue Inspector 插件，支持点击页面元素跳转到 Vue 源代码
    VueInspector({
      // 启用插件
      enable: true,
      // 快捷键：Ctrl/Cmd + Shift + I 切换检查模式
      toggleButtonVisibility: 'always',
      toggleComboKey: 'control-shift',
      // 显示检查按钮在页面右下角
      inspectorButtonPosition: 'bottom-right',
      // 配置编辑器为 VS Code
      editor: 'code',
    }),
  ],
  // 开发服务器配置
  server: {
    port: 3002,
    hmr: true, // 热更新开启
  },
  // 构建配置
  build: {
    // 生产模式下启用 sourcemap
    sourcemap: true,
    chunkSizeWarningLimit: 600, // 设置警告阈值为600KiB
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id
              .toString()
              .split('node_modules/')[1]
              .split('/')[0]
              .toString();
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
    },
  },
});
