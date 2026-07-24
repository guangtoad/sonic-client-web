/*
 *   sonic-client-web  Front end of Sonic cloud real machine platform.
 *   Copyright (C) 2022 SonicCloudOrg
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published
 *   by the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// 引入 Vue 核心函数，用于创建应用实例
import { createApp } from 'vue';

// 引入 Element Plus 组件库及其消息提示组件
import ElementPlus, { ElMessage } from 'element-plus';

// 引入根组件 App
import App from './App.vue';

// 引入路由配置
import { setupRouter, router } from './router/index.js';

// 引入 Vuex 状态管理
import store from './store/index.js';

// 引入 Element Plus 样式文件
import 'element-plus/dist/index.css';

// 引入封装后的 axios 实例
import axios from './http/axios';

// 引入国际化配置
import { setupI18n, $tc } from './locales/setupI18n';

/**
 * 初始化 Vue 应用的异步函数
 * 负责配置所有核心依赖并挂载应用到 DOM
 */
async function initApp() {
  // 创建 Vue 应用实例
  const app = createApp(App);

  // 初始化国际化配置（异步操作，确保语言包加载完成）
  await setupI18n(app);

  // 注册 Element Plus 组件库
  app.use(ElementPlus);

  // 注册路由
  setupRouter(app);

  // 注册 Vuex 状态管理
  app.use(store);

  // 将应用挂载到 index.html 中的 #app 元素
  app.mount('#app');
}

// 创建应用实例，初始化完成后配置路由导航守卫
initApp().then(() => {
  /**
   * 全局路由导航守卫（前置守卫）
   * 在每次路由跳转前执行，用于认证检查、页面标题设置和数据预加载
   * @param {Route} to - 即将进入的目标路由对象
   * @param {Route} from - 当前导航正要离开的路由对象
   * @param {Function} next - 继续导航的回调函数
   */
  router.beforeEach((to, from, next) => {
    // 设置页面标题，默认使用国际化的设备标题
    document.title = $tc('devices.title');
    // 如果路由配置了自定义标题，则追加到页面标题后
    if (to.meta.title) {
      document.title += ` - ${to.meta.title}`;
    }

    // 如果路由包含项目ID参数且当前未加载项目信息，异步获取项目详情
    if (to.params.projectId && store.state.project.id === undefined) {
      axios
        .get('/controller/projects', {
          params: {
            id: to.params.projectId,
          },
        })
        .then((resp) => {
          if (resp.code === 2000) {
            // 将项目信息保存到 Vuex store
            store.commit('saveProject', resp.data);
          }
        });
    }

    // 如果用户已登录（有token）但未获取用户信息，异步获取用户信息
    if (store.state.token.length !== 0 && !store.state.userInfo.userName) {
      axios.get('/controller/users').then((resp) => {
        if (resp.code === 2000) {
          // 将用户信息保存到 Vuex store
          store.commit('setUserInfo', resp.data);
          // 显示欢迎消息
          ElMessage.success({
            message: `${$tc('dialog.welcome')}${store.state.userInfo.userName}`,
          });
          next();
        }
      });
    }

    // 认证检查：如果没有token且访问的不是登录页，重定向到登录页
    if (store.state.token.length === 0 && to.path !== '/Login') {
      next({
        path: '/Login',
        // 携带当前路径作为重定向参数，登录成功后返回原页面
        query: { redirect: to.fullPath },
      });
    } else {
      // 允许继续导航
      next();
    }
  });
});
