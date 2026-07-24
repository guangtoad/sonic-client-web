<script setup>
/**
 * PublicStep.vue - 公共步骤管理页面
 * 展示公共步骤列表、支持步骤创建、编辑、删除操作
 */

// 引入 Vue 生命周期钩子和响应式 API
import { onMounted, ref, watch } from 'vue';

// 引入路由
import { useRoute } from 'vue-router';

// 引入 Element Plus 消息组件
import { ElMessage } from 'element-plus';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入公共步骤更新组件
import PublicStepUpdate from '../components/PublicStepUpdate.vue';

// 引入分页组件
import Pageable from '../components/Pageable.vue';

// 引入 axios
import axios from '../http/axios';

// 引入子步骤列表视图组件
import ChildStepListView from '../components/ChildStepListView.vue';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 获取当前路由信息
const route = useRoute();

// 弹窗显示状态
const dialogVisible = ref(false);

// 分页数据
const pageData = ref({});

// 每页条数
const pageSize = ref(15);

// 当前页码
const pageCurrNum = ref(1);

// 公共步骤 ID
const publicStepId = ref(0);

// 监听弹窗关闭，重置步骤 ID
watch(dialogVisible, (newValue, oldValue) => {
  if (!newValue) {
    publicStepId.value = 0;
  }
});

/**
 * 编辑公共步骤
 * @param {number} id - 步骤 ID
 */
const editPublicStep = async (id) => {
  publicStepId.value = id;
  await open();
};

/**
 * 打开步骤弹窗
 */
const open = () => {
  dialogVisible.value = true;
};

/**
 * 刷新步骤列表
 * @param {boolean} e - 是否关闭弹窗
 */
const flush = (e) => {
  if (e) {
    dialogVisible.value = false;
  }
  getPublicStepList();
};

/**
 * 获取公共步骤列表
 * @param {number} pageNum - 页码
 * @param {number} pSize - 每页条数
 */
const getPublicStepList = (pageNum, pSize) => {
  pageSize.value = pSize || pageSize.value;
  pageCurrNum.value = pageNum || pageCurrNum.value;
  axios
    .get('/controller/publicSteps/list', {
      params: {
        projectId: route.params.projectId,
        page: pageCurrNum.value,
        pageSize: pageSize.value,
      },
    })
    .then((resp) => {
      pageData.value = resp.data;
    });
};
// 复制该公共步骤
// const copyPublicStepId = (id) => {
//   axios.get("/controller/publicSteps/copy", {
//     params: {
//       id
//     }
//   }).then(resp => {
//     if (resp['code'] === 2000) {
//       ElMessage.success({
//         message: resp['message']
//       });
//       getPublicStepList()
//     }
//   })
// }
const deletePublicStep = (id) => {
  axios
    .delete('/controller/publicSteps', {
      params: {
        id,
      },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        getPublicStepList();
      }
    });
};
const curShowPublicStep = ref({
  id: null,
  projectId: route.params.projectId,
  platform: 0,
  name: '',
  steps: [],
});
/**
 * 点击列表上的某个公共元素信息之后，再拉取单个公共步骤的子步骤信息
 * @param id 公共步骤id
 */
const getPublicStepInfo = (id) => {
  curShowPublicStep.value.steps = [];
  axios.get('/controller/publicSteps', { params: { id } }).then((resp) => {
    if (resp.code === 2000) {
      curShowPublicStep.value = resp.data;
    }
  });
};
onMounted(() => {
  getPublicStepList();
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="$t('publicStepTS.info')"
    width="70%"
  >
    <public-step-update
      v-if="dialogVisible"
      :public-step-id="publicStepId"
      :project-id="route.params.projectId"
      @flush="flush"
    />
  </el-dialog>
  <el-button size="mini" round type="primary" @click="open">{{
    $t('publicStepTS.add')
  }}</el-button>
  <el-table :data="pageData['content']" border style="margin-top: 10px">
    <el-table-column width="100" label="id" prop="id" align="center" />
    <el-table-column
      :label="$t('publicStepTS.name')"
      prop="name"
      header-align="center"
    />
    <el-table-column
      :label="$t('publicStepTS.platform')"
      width="110"
      align="center"
    >
      <template #default="scope">
        {{ scope.row.platform === 1 ? $t('publicStepTS.android') : 'iOS' }}
      </template>
    </el-table-column>
    <el-table-column
      :label="$t('publicStepTS.list')"
      width="130"
      align="center"
    >
      <template #default="scope">
        <el-popover
          placement="left"
          popper-class="public-step-popover"
          :fallback-placements="['bottom', 'top', 'right', 'left']"
          :width="700"
          trigger="click"
        >
          <child-step-list-view :steps="curShowPublicStep.steps" />
          <template #reference>
            <el-button size="mini" @click="getPublicStepInfo(scope.row.id)">{{
              $t('publicStepTS.viewSteps')
            }}</el-button>
          </template>
        </el-popover>
      </template>
    </el-table-column>
    <el-table-column :label="$t('common.operate')" width="250" align="center">
      <template #default="scope">
        <!--        <el-button type="primary"-->
        <!--                   size="mini"-->
        <!--                   v-on:click="copyPublicStepId(scope.row.id)"-->
        <!--        >-->
        <!--          复制-->
        <!--        </el-button>-->

        <el-button
          type="primary"
          size="mini"
          @click="editPublicStep(scope.row.id)"
        >
          {{ $t('common.edit') }}
        </el-button>

        <el-popconfirm
          style="margin-left: 10px"
          :confirm-button-text="$t('form.confirm')"
          :cancel-button-text="$t('form.cancel')"
          icon="el-icon-warning"
          icon-color="red"
          :title="$t('publicStepTS.sureDel')"
          @confirm="deletePublicStep(scope.row.id)"
        >
          <template #reference>
            <el-button type="danger" size="mini">
              {{ $t('common.delete') }}
            </el-button>
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
    @change="getPublicStepList"
  ></pageable>
</template>
