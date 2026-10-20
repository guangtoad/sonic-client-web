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
 * 国际化辅助函数
 * 提供语言相关的工具方法，包括设置页面语言、获取系统语言、检查语言支持等
 */

// 引入语言配置常量
import { LOCALE } from '@/config/locale';

// 引入平台类型常量
import { PLATFORM_TYPE } from '@/config/constants';

/**
 * 设置 HTML 页面的 lang 属性
 * @param {string} locale - 语言代码（如 'zh_CN'）
 */
export function setHtmlPageLang(locale) {
  // 获取 html 元素并设置 lang 属性，使用可选链避免空值错误
  document.querySelector('html')?.setAttribute('lang', locale);
}

/**
 * 获取浏览器系统语言
 * 兼容不同浏览器的语言属性
 * @returns {string} 语言代码（格式：语言_地区，如 'zh_CN'）
 */
export function getSystemLanguage() {
  // 获取浏览器语言，兼容不同浏览器（navigator.language 或 navigator.userLanguage）
  const lang = navigator.language || navigator.userLanguage;
  // 将连字符替换为下划线，统一格式
  return lang.replace('-', '_');
}

/**
 * 检查语言是否被支持
 * 判断给定的语言代码是否在支持的语言列表中
 * @param {string} lang - 语言代码
 * @returns {string} 如果支持返回语言代码，否则返回空字符串
 */
export function supportLanguage(lang) {
  // 获取所有支持的语言列表
  const localeList = Object.values(LOCALE);
  // 判断语言是否在支持列表中
  return localeList.includes(lang) ? lang : '';
}
