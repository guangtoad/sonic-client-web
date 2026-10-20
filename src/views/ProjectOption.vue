<script setup>
/**
 * ProjectOption.vue - 项目设置页面
 * 封装项目更新组件，用于项目信息的编辑和配置
 */

// 引入项目更新组件
import ProjectUpdate from '../components/ProjectUpdate.vue';
</script>

<template>
  <!-- 项目更新组件，设置为编辑模式 -->
  <project-update :is-update="true" />
</template>
