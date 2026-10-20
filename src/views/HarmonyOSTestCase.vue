<script setup>
/**
 * HarmonyOSTestCase.vue - HarmonyOS 测试用例管理页面
 * 展示 HarmonyOS 平台的测试用例列表，支持用例的增删改查操作
 */

// 引入 Vue 响应式 API
import { ref } from 'vue';

// 引入路由
import { useRoute } from 'vue-router';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入测试用例列表组件
import TestCaseList from '../components/TestCaseList.vue';

// 引入平台类型常量
import { PLATFORM_TYPE } from '@/config/constants';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 获取当前路由信息
const route = useRoute();

// 测试用例列表组件引用
const caseList = ref(null);

// 项目 ID（从路由参数获取）
const projectId = ref(parseInt(route.params.projectId));

// 平台标识：3 表示 HarmonyOS 平台
const platform = PLATFORM_TYPE.HARMONYOS;
</script>

<template>
  <el-button size="mini" round type="primary" @click="caseList.open()">{{
    $t('androidTestCase.addCase')
  }}</el-button>
  <test-case-list
    ref="caseList"
    :project-id="projectId"
    :platform="platform"
    :is-read-only="false"
  />
</template>
