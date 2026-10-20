<script setup>
/**
 * Scripts.vue - 脚本管理页面
 * 展示脚本列表、支持脚本创建、编辑、删除操作
 */

// 引入 Vue 生命周期钩子和响应式 API
import { onMounted, ref, watch } from 'vue';

// 引入路由
import { useRoute } from 'vue-router';

// 引入 Element Plus 消息组件
import { ElMessage } from 'element-plus';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入分页组件
import Pageable from '../components/Pageable.vue';

// 引入脚本更新组件
import ScriptUpdate from '../components/ScriptUpdate.vue';

// 引入 axios
import axios from '../http/axios';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 获取当前路由信息
const route = useRoute();

// 脚本 ID
const id = ref(0);

// 分页数据
const pageData = ref({});

// 每页条数
const pageSize = ref(15);

// 当前页码
const pageCurrNum = ref(1);

// 搜索关键词
const name = ref('');

// 弹窗显示状态
const dialogVisible = ref(false);

/**
 * 打开脚本弹窗
 */
const open = () => {
  dialogVisible.value = true;
};

// 监听弹窗关闭，重置脚本 ID
watch(dialogVisible, (newValue, oldValue) => {
  if (!newValue) {
    id.value = 0;
  }
});

/**
 * 编辑脚本
 * @param {number} i - 脚本 ID
 */
const editScript = async (i) => {
  id.value = i;
  await open();
};

/**
 * 刷新脚本列表
 */
const flush = () => {
  dialogVisible.value = false;
  getScriptList();
};

// 表格加载状态
const tableLoading = ref(false);

/**
 * 获取脚本列表
 * @param {number} pageNum - 页码
 * @param {number} pSize - 每页条数
 */
const getScriptList = (pageNum, pSize) => {
  tableLoading.value = true;
  pageSize.value = pSize || pageSize.value;
  pageCurrNum.value = pageNum || pageCurrNum.value;
  axios
    .get('/controller/scripts/list', {
      params: {
        projectId: route.params.projectId,
        name: name.value,
        page: pageCurrNum.value,
        pageSize: pageSize.value,
      },
    })
    .then((resp) => {
      pageData.value = resp.data;
      tableLoading.value = false;
    });
};
const deleteScript = (id) => {
  axios
    .delete('/controller/scripts', {
      params: {
        id,
      },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        getScriptList();
      }
    });
};
onMounted(() => {
  getScriptList();
});
</script>

<template>
  <el-dialog v-model="dialogVisible" :title="$t('script.info')" width="1200px">
    <script-update
      v-if="dialogVisible"
      :id="id"
      :project-id="route.params.projectId"
      @flush="flush"
    />
  </el-dialog>
  <el-button size="mini" round type="primary" @click="open()">{{
    $t('script.add')
  }}</el-button>

  <el-table style="margin-top: 20px" border :data="pageData.content">
    <el-table-column align="center" width="80" property="id" label="id" />
    <el-table-column header-align="center" property="name">
      <template #header>
        <el-input
          v-model="name"
          size="mini"
          :placeholder="$t('script.typeSearch')"
          @input="getScriptList()"
        />
      </template>
    </el-table-column>
    <el-table-column
      align="center"
      width="100"
      property="scriptLanguage"
      :label="$t('script.lang')"
    />
    <el-table-column align="center" width="170" :label="$t('common.operate')">
      <template #default="scope">
        <el-button
          type="primary"
          size="mini"
          @click="editScript(scope.row.id)"
          >{{ $t('common.edit') }}</el-button
        >
        <el-popconfirm
          style="margin-left: 10px"
          :confirm-button-text="$t('form.confirm')"
          :cancel-button-text="$t('form.cancel')"
          icon="el-icon-warning"
          icon-color="red"
          :title="$t('script.deleteMsg')"
          @confirm="deleteScript(scope.row.id)"
        >
          <template #reference>
            <el-button type="danger" size="mini">{{
              $t('common.delete')
            }}</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-table-column>
  </el-table>
  <pageable
    :is-page-set="true"
    :total="pageData['totalElements']"
    :current-page="pageData['number'] + 1"
    :page-size="pageData['size']"
    @change="getScriptList"
  ></pageable>
</template>
