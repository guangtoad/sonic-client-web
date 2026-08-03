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

/**
 * Axios 封装配置文件
 * 统一配置 HTTP 请求、响应拦截器，处理认证、错误等逻辑
 */

// 引入 axios 核心库
import axios from 'axios';

// 引入 qs 库，用于 URL 参数序列化
import qs from 'qs';

// 引入 Element Plus 消息提示组件
import { ElMessage } from 'element-plus';

// 引入国际化配置
import { i18n, $tc } from '@/locales/setupI18n';

// 引入路由实例，用于未登录时重定向
import { router } from '../router/index.js';

// 根据环境配置不同的基础 URL
let baseURL = '';
if (process.env.NODE_ENV === 'development') {
  // 开发环境：指向本地后端服务
  baseURL = 'http://127.0.0.1:3000/server/api';
}
if (process.env.NODE_ENV === 'production') {
  // 生产环境：使用相对路径
  baseURL = '/server/api';
}

// 创建 axios 实例
const $http = axios.create();

// 修复可能存在的端口号问题（移除 :80/）
baseURL = baseURL.replace(':80/', '/');

// 设置基础 URL
$http.defaults.baseURL = baseURL;

// 设置请求超时时间（已注释，使用默认值）
// $http.defaults.timeout = 20000;

// 设置请求头标识，表明是 AJAX 请求
$http.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// 允许携带凭证（cookies）
$http.defaults.withCredentials = true;

// 配置参数序列化方式，数组使用方括号格式
$http.defaults.paramsSerializer = (params) =>
  qs.stringify(params, { arrayFormat: 'brackets' });

/**
 * 请求拦截器
 * 在发送请求前统一处理请求头、认证信息等
 */
$http.interceptors.request.use(
  (config) => {
    // 设置请求头
    config.headers = {
      // 设置 Content-Type 为 JSON 格式
      'Content-Type': 'application/json',
      // 设置 Accept-Language 为当前语言
      'Accept-Language': i18n.global.locale.value,
    };
    // 如果存在认证令牌，添加到请求头中
    if (localStorage.getItem('SonicToken')) {
      config.headers.SonicToken = localStorage.getItem('SonicToken');
    }
    return config;
  },
  (err) => {
    // 请求错误处理
    return Promise.reject(err);
  }
);

/**
 * 响应拦截器
 * 在接收响应后统一处理业务逻辑、错误提示等
 */
$http.interceptors.response.use(
  (response) => {
    // 根据响应码处理不同的业务逻辑
    switch (response.data.code) {
      // 2000: 成功，直接返回数据
      case 2000:
        break;

      // 1001: 未登录，重定向到登录页
      case 1001:
        if (router.currentRoute.value.path !== '/Login') {
          router
            .replace({
              path: '/Login',
              query: { redirect: router.currentRoute.value.path },
            })
            .catch((err) => {});
        }
        // 清除本地存储的令牌
        localStorage.removeItem('SonicToken');
        break;

      // 1003: 权限不足，显示错误提示
      case 1003:
        ElMessage.error({
          message: $tc('dialog.permissionDenied'),
        });
        break;

      // 其他错误：显示服务端返回的错误信息
      default:
        if (response.data.message) {
          ElMessage.error({
            message: response.data.message,
          });
        }
    }
    // 返回响应数据（已去掉 axios 包装层）
    return response.data;
  },
  (err) => {
    // 网络错误或 HTTP 错误处理
    if (err.response.status === 503) {
      // 503: 服务不可用，显示维护提示
      ElMessage.info({
        message: $tc('dialog.ready'),
      });
    } else {
      // 其他错误：显示通用错误提示
      ElMessage.error({
        message: $tc('dialog.error'),
      });
    }
    return Promise.reject(err);
  }
);

// 导出封装后的 axios 实例
export default $http;
