/**
 * Vuex 状态管理配置
 * 集中管理应用的全局状态，包括用户信息、项目数据、主题设置、国际化配置等
 */

// 引入 Vuex 核心函数
import { createStore } from 'vuex';

// 引入国际化默认配置
import { localeSetting } from '@/config/locale';

// 引入缓存键名配置
import { LOCALE_KEY } from '@/config/cache';

// 引入本地存储工具函数
import { setLocal, getLocal } from '@/utils/cache/localStorage';

// 开发模式下启用严格模式（检测不通过 mutation 修改状态的行为）
const debug = process.env.NODE_ENV !== 'production';

// 创建 Vuex store 实例
export default createStore({
  // 开发模式启用严格模式，生产模式禁用以提高性能
  strict: debug,

  /**
   * 全局状态定义
   * 包含用户信息、认证令牌、项目数据、主题配置和国际化设置
   */
  state() {
    return {
      // 用户信息对象
      userInfo: {},

      // 认证令牌，从 localStorage 中读取（页面刷新后保持登录状态）
      token: localStorage.getItem('SonicToken')
        ? localStorage.getItem('SonicToken')
        : '',

      // 侧边栏折叠状态
      isCollapse: false,

      // 当前项目信息
      project: {},

      // 项目列表
      projectList: [],

      // 菜单背景色
      menuBack: '',

      // 菜单文字颜色
      menuText: '',

      // 菜单激活状态文字颜色
      menuActiveText: '',

      // 当前主题模式（light/dark）
      currentTheme: 'light',

      // 国际化信息，从本地存储读取或使用默认配置
      localInfo: getLocal(LOCALE_KEY) || localeSetting,
    };
  },
  /**
   * Mutations - 同步状态修改方法
   * 所有状态修改必须通过 mutation 进行，确保状态变化可追踪
   */
  mutations: {
    /**
     * 保存主题设置并更新菜单颜色
     * @param {Object} state - 状态对象
     * @param {string} payload - 主题名称（'light' 或 'dark'）
     */
    saveTheme(state, payload) {
      state.currentTheme = payload;
      // 根据主题设置菜单颜色
      if (payload === 'light') {
        state.menuBack = '#ffffff';
        state.menuText = '#909399';
        state.menuActiveText = '#409EFF';
      } else {
        state.menuBack = '#545c64';
        state.menuText = '#ffffff';
        state.menuActiveText = '#ffd04b';
      }
    },

    /**
     * 保存项目列表
     * @param {Object} state - 状态对象
     * @param {Array} payload - 项目列表数组
     */
    saveProjectList(state, payload) {
      state.projectList = payload;
    },

    /**
     * 保存当前项目信息
     * @param {Object} state - 状态对象
     * @param {Object} payload - 项目信息对象
     */
    saveProject(state, payload) {
      state.project = payload;
    },

    /**
     * 切换侧边栏折叠状态
     * @param {Object} state - 状态对象
     */
    changeCollapse(state) {
      state.isCollapse = !state.isCollapse;
    },

    /**
     * 自动折叠侧边栏（仅在未折叠状态时执行）
     * @param {Object} state - 状态对象
     */
    autoChangeCollapse(state) {
      if (state.isCollapse === false) {
        state.isCollapse = !state.isCollapse;
      }
    },

    /**
     * 保存登录令牌
     * @param {Object} state - 状态对象
     * @param {string} sonicToken - 认证令牌
     */
    changeLogin(state, sonicToken) {
      state.token = sonicToken;
      // 将令牌保存到 localStorage，页面刷新后保持登录状态
      localStorage.setItem('SonicToken', sonicToken);
    },

    /**
     * 设置用户信息
     * @param {Object} state - 状态对象
     * @param {Object} userInfo - 用户信息对象
     */
    setUserInfo(state, userInfo) {
      state.userInfo = userInfo;
    },

    /**
     * 清除认证信息（登出）
     * @param {Object} state - 状态对象
     */
    clearAuth(state) {
      state.token = '';
      state.userInfo = {};
      // 从 localStorage 中移除令牌
      localStorage.removeItem('SonicToken');
    },

    /**
     * 设置国际化信息
     * @param {Object} state - 状态对象
     * @param {Object} info - 国际化配置对象
     */
    setLocaleInfo(state, info) {
      state.localInfo = info;
    },
  },
  /**
   * Getters - 状态计算属性
   * 用于从 state 派生出新的状态，类似 Vue 组件中的 computed
   */
  getters: {
    /**
     * 获取当前语言设置
     * @param {Object} state - 状态对象
     * @returns {string} 当前语言代码（如 'zh_CN'）
     */
    getLocale(state) {
      return state.localInfo?.locale ?? 'zh_CN';
    },
  },

  /**
   * Actions - 异步状态修改方法
   * 用于处理异步操作，最终通过 mutation 修改状态
   */
  actions: {
    /**
     * 修改国际化配置并持久化到本地存储
     * @param {Object} context - 上下文对象（包含 commit, state 等）
     * @param {Object} info - 国际化配置对象
     */
    changeLocaleInfo({ commit, state }, info) {
      // 合并现有配置与新配置
      const localInfo = { ...state.localInfo, ...info };
      // 通过 mutation 更新状态
      commit('setLocaleInfo', localInfo);
      // 持久化到本地存储
      setLocal(LOCALE_KEY, localInfo);
    },
  },
});
