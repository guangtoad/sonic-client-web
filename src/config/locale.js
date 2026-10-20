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
 * 国际化配置文件
 * 定义支持的语言列表、语言代码常量和默认配置
 */

/**
 * 语言代码常量定义
 * 使用大写命名规范，方便在代码中引用
 */
export const LOCALE = {
  // 简体中文
  ZH_CN: 'zh_CN',
  // 英文
  EN_US: 'en_US',
  // 繁体中文
  ZH_TW: 'zh_TW',
  // 日文
  JA_JP: 'ja_JP',
  // ...更多语言
};

/**
 * 语言选择器列表配置
 * 用于在 UI 中展示可选语言列表
 */
export const localeList = [
  {
    // 语言显示名称
    text: '简体中文',
    // 是否正在开发中（true 表示不可用）
    building: false,
    // 对应的语言代码
    event: LOCALE.ZH_CN,
  },
  {
    text: '繁體中文',
    building: true, // 繁体中文正在开发中
    event: LOCALE.ZH_TW,
  },
  {
    text: 'English',
    building: false,
    event: LOCALE.EN_US,
  },
  {
    text: '日本語',
    building: true, // 日文正在开发中
    event: LOCALE.JA_JP,
  },
  // ...更多语言
];

/**
 * 默认国际化设置
 * 包含语言选择器显示、默认语言和可用语言列表
 */
export const localeSetting = {
  // 是否显示语言选择器
  showPicker: true,
  // 默认语言（注意：这里设置为 EN_US，但实际应用可能会根据用户偏好调整）
  locale: LOCALE.EN_US,
  // 可用语言列表（支持切换的语言）
  availableLocales: [LOCALE.ZH_CN, LOCALE.EN_US, LOCALE.ZH_TW, LOCALE.JA_JP],
};
