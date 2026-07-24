<script setup>
/**
 * App.vue - 应用根组件
 * 负责应用的全局样式、语言配置和路由视图渲染
 */

// 引入亮色主题样式
import './assets/light.css';

// 引入暗色主题样式
import './assets/dark.css';

// 引入 Vue Composition API 的响应式函数
import { ref, watch, computed } from 'vue';

// 引入 Vuex store 用于获取全局状态
import { useStore } from 'vuex';

// 引入 Element Plus 语言配置工具函数
import { getElementPlusLocale } from './locales/setupI18n';

// 获取 Vuex store 实例
const store = useStore();

// 响应式变量，存储 Element Plus 的语言配置
const locale = ref(getElementPlusLocale());

// 计算属性，从 Vuex store 中获取当前语言设置
const storelocale = computed(() => {
  return store.getters.getLocale;
});

// 监听语言切换事件，当 store 中的语言改变时更新 Element Plus 的语言配置
watch(storelocale, () => {
  locale.value = getElementPlusLocale();
});
</script>

<template>
  <!-- 使用 Element Plus 的配置提供者组件，全局设置语言环境 -->
  <el-config-provider :locale="locale">
    <!-- 路由视图容器，根据当前路由渲染对应的页面组件 -->
    <router-view />
  </el-config-provider>
</template>

<style>
/* 引入全局通用样式 */
@import './assets/common.css';
</style>
