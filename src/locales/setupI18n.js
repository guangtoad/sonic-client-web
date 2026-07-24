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
 * 国际化初始化配置
 * 负责创建 vue-i18n 实例、加载语言包、提供翻译函数
 */

// 引入 vue-i18n 核心函数
import { createI18n } from 'vue-i18n';

// 引入本地存储工具函数
import { getLocal } from '@/utils/cache/localStorage';

// 引入缓存键名配置
import { LOCALE_KEY } from '@/config/cache';

// 引入语言配置常量
import { LOCALE, localeSetting } from '@/config/locale';

// 按需引入 Element Plus 组件库的语言包
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import zhTW from 'element-plus/es/locale/lang/zh-tw';
import en from 'element-plus/es/locale/lang/en';
import ja from 'element-plus/es/locale/lang/ja';

// 引入国际化辅助函数
import { setHtmlPageLang, getSystemLanguage, supportLanguage } from './helper';

// ...更多语言

// 默认语言（从配置中读取）
const langDefault = localeSetting.locale;

// 存储当前语言包数据
let localeData = null;

/**
 * 获取默认语言
 * 查找顺序：浏览器缓存 > 浏览器系统语言 > 默认语言
 * @returns {string} 语言代码（如 'zh_CN'）
 */
function defaultLanguage() {
  // 获取浏览器系统语言
  const systemLocale = getSystemLanguage();
  // 按优先级查找：缓存的语言 > 系统语言（需支持） > 默认语言
  return (
    getLocal(LOCALE_KEY)?.locale || supportLanguage(systemLocale) || langDefault
  );
}

/**
 * 创建 vue-i18n 配置选项
 * 异步加载当前语言的语言包
 * @returns {Object} i18n 配置对象
 */
async function createI18nOptions() {
  // 获取当前语言
  const locale = defaultLanguage();

  // 动态导入语言包（按需加载，优化首屏性能）
  const defaultLocal = await import(`./lang/${locale}.js`);

  // 提取语言包中的 message 对象
  const message = defaultLocal.default?.message ?? {};

  // 保存语言包数据供 $tc 函数使用
  localeData = message;

  // 设置 HTML 页面的 lang 属性
  setHtmlPageLang(locale);

  // 返回 i18n 配置对象
  return {
    // 使用 Composition API 模式（非传统模式）
    legacy: false,
    // 当前语言
    locale,
    // 语言包消息
    messages: {
      [locale]: message,
    },
  };
}

// i18n 实例，用于在其他模块中访问
export let i18n = null;

/**
 * 获取 Element Plus 组件库的语言配置
 * 根据当前语言返回对应的语言包
 * @returns {Object} Element Plus 语言配置对象
 */
export function getElementPlusLocale() {
  const locale = defaultLanguage();
  // 语言代码到 Element Plus 语言包的映射
  const localeMap = {
    [LOCALE.ZH_CN]: zhCn,
    [LOCALE.ZH_TW]: zhTW,
    [LOCALE.EN_US]: en,
    [LOCALE.JA_JP]: ja,
    // ...更多语言
  };
  return localeMap[locale];
}

/**
 * 本地翻译函数
 * 通过点分隔的路径获取语言包中的翻译文本
 * 例如：$tc('routes.login') 会获取 message.routes.login 的值
 * @param {string} params - 翻译路径（点分隔）
 * @returns {string} 翻译后的文本
 */
export function $tc(params) {
  // 如果语言包未初始化，抛出错误
  if (!localeData) {
    throw new Error('not init localeData!');
  }

  // 将路径按点分割成数组
  const arr = typeof params === 'string' ? params.split('.') : [];

  // 逐级查找翻译值
  let data = localeData;
  for (let i = 0; i < arr.length; i++) {
    data = data[arr[i]];
  }

  // 返回翻译结果
  return data;
}

/**
 * 初始化国际化并注册到 Vue 应用
 * @param {Object} app - Vue 应用实例
 */
export async function setupI18n(app) {
  // 创建 i18n 配置选项
  const options = await createI18nOptions();

  // 创建 vue-i18n 实例
  i18n = createI18n(options);

  // 将 i18n 注册到 Vue 应用
  app.use(i18n);
}
