<script setup>
/**
 * GlobalParams.vue - 全局参数管理页面
 * 展示全局参数列表、支持参数创建、编辑、删除操作
 */

// 引入 Vue 生命周期钩子和响应式 API
import { onMounted, ref } from 'vue';

// 引入路由
import { useRoute } from 'vue-router';

// 引入 Element Plus 消息组件
import { ElMessage } from 'element-plus';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入 axios
import axios from '../http/axios';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 获取当前路由信息
const route = useRoute();

// 弹窗显示状态
const dialogVisible = ref(false);

// 参数列表数据
const pageData = ref([]);

// 更新参数引用
const updateGlobal = ref(null);

/**
 * 全局参数表单数据
 */
const globalParams = ref({
  id: null, // 参数 ID（新增时为 null）
  projectId: route.params.projectId, // 项目 ID
  paramsKey: '', // 参数键
  paramsValue: '', // 参数值
});

/**
 * 编辑全局参数
 * @param {number} id - 参数 ID
 */
const editGlobalParams = async (id) => {
  await open();
  await getGlobalInfo(id);
};

/**
 * 打开参数弹窗（新增或编辑）
 */
const open = () => {
  globalParams.value = {
    id: null,
    projectId: route.params.projectId,
    paramsKey: '',
    paramsValue: '',
  };
  dialogVisible.value = true;
};

/**
 * 获取全局参数列表
 */
const getGlobalParamsList = () => {
  axios
    .get('/controller/globalParams/list', {
      params: {
        projectId: route.params.projectId,
      },
    })
    .then((resp) => {
      pageData.value = resp.data;
    });
};

/**
 * 获取参数详情
 * @param {number} id - 参数 ID
 */
const getGlobalInfo = (id) => {
  axios
    .get('/controller/globalParams', {
      params: {
        id,
      },
    })
    .then((resp) => {
      globalParams.value = resp.data;
    });
};
const deleteGlobal = (id) => {
  axios
    .delete('/controller/globalParams', {
      params: {
        id,
      },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        getGlobalParamsList();
      }
    });
};
const summit = () => {
  updateGlobal.value.validate((valid) => {
    if (valid) {
      axios.put('/controller/globalParams', globalParams.value).then((resp) => {
        if (resp.code === 2000) {
          ElMessage.success({
            message: resp.message,
          });
          dialogVisible.value = false;
          getGlobalParamsList();
        }
      });
    }
  });
};
onMounted(() => {
  getGlobalParamsList();
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="$t('globalParamsTs.dialogVisible.info')"
    width="600px"
  >
    <el-alert
      style="margin-bottom: 10px"
      :title="$t('globalParamsTs.dialogVisible.specialUse')"
      :description="$t('globalParamsTs.dialogVisible.messageInfo')"
      type="info"
      show-icon
      close-text="Get!"
    />
    <el-form
      ref="updateGlobal"
      :model="globalParams"
      size="small"
      class="demo-table-expand"
      label-width="90px"
      label-position="left"
    >
      <el-form-item
        prop="paramsKey"
        :label="$t('globalParamsTs.dialogVisible.keyName')"
        :rules="{
          required: true,
          message: $t('globalParamsTs.dialogVisible.keyNameMessage'),
          trigger: 'blur',
        }"
      >
        <el-input
          v-model="globalParams.paramsKey"
          :placeholder="$t('globalParamsTs.dialogVisible.inputName')"
        ></el-input>
      </el-form-item>
      <el-form-item
        prop="paramsValue"
        :label="$t('globalParamsTs.dialogVisible.valueName')"
        :rules="{
          required: true,
          message: $t('globalParamsTs.dialogVisible.valueNameMessage'),
          trigger: 'blur',
        }"
      >
        <el-input
          v-model="globalParams.paramsValue"
          :placeholder="$t('globalParamsTs.dialogVisible.inputValue')"
        ></el-input>
      </el-form-item>
    </el-form>
    <div style="text-align: center">
      <el-button size="small" type="primary" @click="summit">{{
        $t('form.confirm')
      }}</el-button>
    </div>
  </el-dialog>
  <el-button size="mini" round type="primary" @click="open">{{
    $t('globalParamsTs.addGlobalParams')
  }}</el-button>
  <el-table :data="pageData" style="width: 100%; margin-top: 20px" border>
    <el-table-column
      label="id"
      width="90"
      align="center"
      prop="id"
    ></el-table-column>
    <el-table-column
      :label="$t('globalParamsTs.paramsList.name')"
      width="240"
      align="center"
      prop="paramsKey"
    ></el-table-column>
    <el-table-column
      :label="$t('globalParamsTs.paramsList.value')"
      header-align="center"
      prop="paramsValue"
    ></el-table-column>
    <el-table-column :label="$t('common.operate')" width="170" align="center">
      <template #default="scope">
        <el-button
          type="primary"
          size="mini"
          @click="editGlobalParams(scope.row.id)"
          >{{ $t('common.edit') }}
        </el-button>
        <el-popconfirm
          style="margin-left: 10px"
          :confirm-button-text="$t('form.confirm')"
          :cancel-button-text="$t('form.cancel')"
          icon="el-icon-warning"
          icon-color="red"
          :title="$t('globalParamsTs.delMessage')"
          @confirm="deleteGlobal(scope.row.id)"
        >
          <template #reference>
            <el-button type="danger" size="mini"
              >{{ $t('common.delete') }}
            </el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-table-column>
  </el-table>
</template>
