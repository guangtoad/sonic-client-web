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
 * 国际化操作 Hook
 * 提供语言切换功能，封装 Vuex store 和 vue-i18n 的交互逻辑
 */

// 引入 Vue 的 unref 函数，用于获取响应式值
import { unref } from 'vue';

// 引入 i18n 实例
import { i18n } from './setupI18n';

// 引入设置 HTML 语言属性的函数
import { setHtmlPageLang } from './helper';

/**
 * 设置当前语言
 * 根据 i18n 模式（legacy 或 composition）设置全局语言
 * @param {string} locale - 语言代码（如 'zh_CN'）
 */
function setI18nLanguage(locale) {
  // 兼容不同模式的语言设置方式
  if (i18n.mode === 'legacy') {
    // 传统模式
    i18n.global.locale = locale;
  } else {
    // Composition API 模式（响应式值）
    i18n.global.locale.value = locale;
  }
  // 更新 HTML 页面的 lang 属性
  setHtmlPageLang(locale);
}

/**
 * 国际化 Hook
 * 返回语言切换函数和当前语言获取器
 * @param {Object} store - Vuex store 实例
 * @returns {Object} 包含 changeLocale 和 getLocale 的对象
 */
export default function useLocale(store) {
  // 从 store 的 getters 中获取当前语言
  const { getLocale } = store.getters;

  /**
   * 切换语言
   * 异步加载新语言包并更新全局语言设置
   * @param {string} locale - 目标语言代码
   * @returns {string} 切换后的语言代码
   */
  async function changeLocale(locale) {
    // 获取全局 i18n 实例
    const globalI18n = i18n.global;

    // 获取当前语言（处理响应式值）
    const currentLocale = unref(globalI18n.locale);

    // 如果目标语言与当前语言相同，不做处理
    if (currentLocale === locale) {
      return locale;
    }

    // 动态导入目标语言的语言包
    const langModule = (await import(`./lang/${locale}.js`)).default;

    // 如果语言包不存在，返回
    if (!langModule) return;

    // 提取语言包中的 message 对象
    const { message } = langModule;

    // 更新 Vuex store 中的语言配置（并持久化到本地存储）
    store.dispatch('changeLocaleInfo', { locale });

    // 更新 vue-i18n 的语言消息
    globalI18n.setLocaleMessage(locale, message);

    // 设置全局语言
    setI18nLanguage(locale);

    // 强制刷新页面，确保所有组件都使用新语言
    location.reload();

    // 返回切换后的语言代码
    return locale;
  }

  // 返回暴露给组件使用的方法和属性
  return {
    changeLocale, // 切换语言方法
    getLocale,    // 获取当前语言方法
  };
}
