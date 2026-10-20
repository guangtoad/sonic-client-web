<script setup>
/**
 * Index.vue - 首页入口页面
 * 作为系统首页，仅包含顶部导航栏组件
 */

// 引入顶部导航栏组件
import Header from '../components/Header.vue';
</script>

<template>
  <!-- Element Plus 布局容器 -->
  <el-container>
    <!-- 顶部导航栏 -->
    <Header></Header>
  </el-container>
</template>
