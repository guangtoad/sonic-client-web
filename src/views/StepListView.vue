<script setup>
/**
 * StepListView.vue - 步骤列表视图页面
 * 展示测试用例的详细步骤信息
 */

// 引入路由
import { useRoute, useRouter } from 'vue-router';

// 引入 Vue 生命周期钩子和响应式 API
import { onMounted, ref } from 'vue';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入 axios
import axios from '../http/axios';

// 引入步骤列表组件
import StepList from '../components/StepList.vue';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 加载所有图片资源
const img = Object.fromEntries(
  Object.entries(import.meta.glob('./../assets/img/*', { eager: true })).map(
    ([k, v]) => [k.startsWith('./') ? k : './' + k, v]
  )
);

// 获取当前路由信息
const route = useRoute();

// 获取路由实例
const router = useRouter();

// 测试用例数据
const testCase = ref({});

/**
 * 获取设备图片
 * @param {string} name - 设备型号名称
 * @returns {string} 图片 URL
 */
const getImg = (name) => {
  let result;
  // 型号名称统一处理
  if (name === 'meizu') {
    name = 'Meizu';
  }
  if (name === 'LENOVO') {
    name = 'Lenovo';
  }
  try {
    result = img[`./../assets/img/${name}.jpg`].default;
  } catch {
    // 使用默认图片
    result = img['./../assets/img/unName.jpg'].default;
  }
  return result;
};

/**
 * 获取测试用例详情
 * @param {number} id - 用例 ID
 */
const getCaseInfo = (id) => {
  axios
    .get('/controller/testCases', {
      params: {
        id,
      },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        testCase.value = resp.data;
      }
    });
};

/**
 * 组件挂载后执行
 * 获取测试用例信息
 */
onMounted(() => {
  getCaseInfo(route.params.caseId);
});
</script>

<template>
  <el-page-header
    :content="$t('publicStepTS.stepInfo')"
    style="margin-bottom: 20px"
    @back="router.go(-1)"
  >
  </el-page-header>
  <el-row :gutter="20">
    <el-col :span="6">
      <el-card>
        <template #header
          ><strong>{{ $t('stepListViewTS.caseInfo') }}</strong></template
        >
        <el-form
          v-if="testCase['id']"
          label-position="left"
          class="demo-table-expand"
          label-width="100px"
          style="margin-left: 10px; word-break: break-all"
        >
          <el-form-item :label="$t('projectIndexTS.page.caseId')">
            <span>{{ testCase['id'] }}</span>
          </el-form-item>
          <el-form-item :label="$t('projectIndexTS.page.caseName')">
            <span>{{ testCase.name }}</span>
          </el-form-item>
          <el-form-item :label="$t('stepListViewTS.platformToBe')">
            <div style="display: flex; align-items: center">
              <el-avatar
                style="margin-right: 10px"
                :size="27"
                :src="getImg(testCase['platform'] === 1 ? 'ANDROID' : (testCase['platform'] === 2 ? 'IOS' : (testCase['platform'] === 6 ? 'HMOS' : 'unName')))"
                shape="square"
              ></el-avatar>
              {{
                testCase['platform'] === 1 ? $t('publicStepTS.android') : (testCase['platform'] === 6 ? $t('publicStepTS.harmonyOS') : 'iOS') 
              }}
            </div>
          </el-form-item>
          <el-form-item :label="$t('stepListViewTS.module')">
            <span>{{
              testCase['modulesDTO'] !== null ? testCase['modulesDTO'].name : ''
            }}</span>
          </el-form-item>
          <el-form-item :label="$t('stepListViewTS.versionName')">
            <span>{{ testCase['version'] }}</span>
          </el-form-item>
          <el-form-item :label="$t('stepListViewTS.designer')">
            <span>{{ testCase['designer'] }}</span>
          </el-form-item>
          <el-form-item :label="$t('stepListViewTS.last')">
            <span>{{ testCase['editTime'] }}</span>
          </el-form-item>
          <el-form-item :label="$t('stepListViewTS.testMessage')">
            <span>{{ testCase['des'] }}</span>
          </el-form-item>
        </el-form>
      </el-card>
    </el-col>
    <el-col :span="18">
      <el-card shadow="hover">
        <step-list
          v-if="testCase['id']"
          :is-show-run="false"
          :platform="testCase['platform']"
          :is-driver-finish="false"
          :case-id="testCase['id']"
          :project-id="route.params.projectId"
        />
      </el-card>
    </el-col>
  </el-row>
</template>
