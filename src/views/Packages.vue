<script setup>
/**
 * Packages.vue - 应用包管理页面
 * 展示应用包列表、支持包上传、筛选和复制操作
 */

// 引入 Vue 生命周期钩子和响应式 API
import { onMounted, ref } from 'vue';

// 引入路由
import { useRoute, useRouter } from 'vue-router';

// 引入 Element Plus 消息组件
import { ElMessage } from 'element-plus';

// 引入剪贴板插件
import useClipboard from 'vue-clipboard3';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入 Jenkins 图标
import jenkins from '../assets/img/jenkins.png';

// 引入 axios
import axios from '../http/axios';

// 引入分页组件
import Pageable from '../components/Pageable.vue';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 初始化剪贴板
const { toClipboard } = useClipboard();

// 获取当前路由信息
const route = useRoute();

// 获取路由实例
const router = useRouter();

// 分页数据
const pageData = ref({});

// 每页条数
const pageSize = ref(15);

// 当前页码
const pageCurrNum = ref(1);

// 平台筛选条件
const platform = ref('');

// 分支筛选条件
const branch = ref('');

/**
 * 获取应用包列表
 * @param {number} pageNum - 页码
 * @param {number} pSize - 每页条数
 */
const getPackageList = (pageNum, pSize) => {
  pageSize.value = pSize || pageSize.value;
  pageCurrNum.value = pageNum || pageCurrNum.value;
  axios
    .get('/controller/packages/list', {
      params: {
        projectId: route.params.projectId,
        page: pageCurrNum.value,
        pageSize: pageSize.value,
        platform: platform.value,
        branch: branch.value,
      },
    })
    .then((resp) => {
      pageData.value = resp.data;
    });
};

/**
 * 筛选应用包
 * @param {Object} e - 筛选条件
 */
const filter = (e) => {
  platform.value = e.platform[0];
  getPackageList();
};

/**
 * 复制文本到剪贴板
 * @param {string} value - 要复制的文本
 */
const copy = (value) => {
  try {
    toClipboard(value);
    ElMessage.success({
      message: $t('dialog.copy.success'),
    });
  } catch (e) {
    ElMessage.error({
      message: $t('dialog.copy.fail'),
    });
  }
};
const getBuildId = (data) => {
  if (data && data != null && data.length > 0 && data.indexOf('/') >= 2) {
    return data.substring(
      data.substring(0, data.lastIndexOf('/')).lastIndexOf('/') + 1,
      data.length - 1
    );
  }
  return '';
};
onMounted(() => {
  getPackageList();
});
</script>

<template>
  <a
    style="float: right; margin-bottom: 20px"
    href="https://sonic-cloud.cn/sch"
    target="_blank"
  >
    <el-button size="mini" plain type="primary">{{
      $t('packagesTS.accessGuide')
    }}</el-button></a
  >
  <el-table :data="pageData['content']" border @filter-change="filter">
    <el-table-column
      width="80"
      label="Id"
      prop="id"
      align="center"
      show-overflow-tooltip
    />
    <el-table-column
      width="110"
      :label="$t('packagesTS.buildLink')"
      prop="buildUrl"
      align="center"
    >
      <template #default="scope">
        <div
          style="display: flex; align-items: center; justify-content: center"
        >
          <el-image :src="jenkins" style="width: 28px" />
          <el-link :href="scope.row.buildUrl" target="_blank" type="primary">
            <strong>#{{ getBuildId(scope.row.buildUrl) }}</strong>
          </el-link>
        </div>
      </template>
    </el-table-column>
    <el-table-column
      :label="$t('packagesTS.platform')"
      width="120"
      prop="platform"
      align="center"
      :filter-multiple="false"
      column-key="platform"
      :filters="[
        { text: 'Android', value: 'Android' },
        { text: 'iOS', value: 'iOS' },
      ]"
    >
      <template #default="scope">
        <span v-if="scope.row.platform.length === 0">{{
          $t('packagesTS.no')
        }}</span>
        <span v-else>
          <el-tag size="small">{{ scope.row.platform.toUpperCase() }}</el-tag>
        </span>
      </template>
    </el-table-column>
    <el-table-column
      :label="$t('packagesTS.packageName')"
      prop="pkgName"
      header-align="center"
      show-overflow-tooltip
    >
    </el-table-column>
    <el-table-column
      :label="$t('packagesTS.branch')"
      width="280"
      prop="branch"
      align="center"
    >
      <template #header>
        <el-input
          v-model="branch"
          size="mini"
          :placeholder="$t('packagesTS.inputName')"
          @input="getPackageList()"
        />
      </template>
    </el-table-column>
    <el-table-column
      :label="$t('packagesTS.downloadLink')"
      width="180"
      prop="url"
      align="center"
    >
      <template #default="scope">
        <el-button type="primary" size="mini" @click="copy(scope.row.url)"
          >{{ $t('packagesTS.copyUrl') }}
        </el-button>
      </template>
    </el-table-column>
    <el-table-column
      :label="$t('packagesTS.creatTime')"
      width="200"
      prop="createTime"
      align="center"
    >
    </el-table-column>
  </el-table>
  <pageable
    :is-page-set="true"
    :total="pageData['totalElements']"
    :current-page="pageData['number'] + 1"
    :page-size="pageData['size']"
    @change="getPackageList"
  ></pageable>
</template>
