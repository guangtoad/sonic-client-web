/**
 * localStorage 工具函数
 * 提供对象序列化和反序列化的封装，支持存储复杂数据类型
 */

/**
 * 设置 localStorage 数据
 * 如果值是对象，会先序列化为 JSON 字符串
 * @param {string} key - 存储键名
 * @param {any} value - 存储值（支持基本类型和对象）
 */
export function setLocal(key, value) {
  // 如果值是对象，序列化为 JSON 字符串
  if (typeof value === 'object') {
    value = JSON.stringify(value);
  }

  // 存储到 localStorage
  localStorage.setItem(key, value);
}

/**
 * 获取 localStorage 数据
 * 如果值是字符串，会尝试反序列化为对象
 * @param {string} key - 存储键名
 * @returns {any} 存储的值（如果是对象则返回解析后的对象）
 */
export function getLocal(key) {
  // 从 localStorage 获取值
  let value = localStorage.getItem(key);

  // 如果值是字符串，尝试解析为 JSON 对象
  if (typeof value === 'string') {
    value = JSON.parse(value);
  }

  return value;
}
