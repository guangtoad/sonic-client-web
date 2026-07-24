<script setup>
/**
 * Modules.vue - 模块管理页面
 * 展示模块列表、支持模块创建、编辑、删除操作
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

// 模块列表数据
const pageData = ref([]);

// 更新模块引用
const updateModule = ref(null);

/**
 * 模块表单数据
 */
const modules = ref({
  id: null, // 模块 ID（新增时为 null）
  projectId: route.params.projectId, // 项目 ID
  name: '', // 模块名称
});

/**
 * 编辑模块
 * @param {number} id - 模块 ID
 */
const editModule = async (id) => {
  await open();
  await getModuleInfo(id);
};

/**
 * 打开模块弹窗（新增或编辑）
 */
const open = () => {
  modules.value = {
    id: null,
    projectId: route.params.projectId,
    name: '',
  };
  dialogVisible.value = true;
};

/**
 * 获取模块列表
 */
const getModuleList = () => {
  axios
    .get('/controller/modules/list', {
      params: {
        projectId: route.params.projectId,
      },
    })
    .then((resp) => {
      pageData.value = resp.data;
    });
};

/**
 * 获取模块详情
 * @param {number} id - 模块 ID
 */
const getModuleInfo = (id) => {
  axios
    .get('/controller/modules', {
      params: {
        id,
      },
    })
    .then((resp) => {
      modules.value = resp.data;
    });
};
const deleteModule = (id) => {
  axios
    .delete('/controller/modules', {
      params: {
        id,
      },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        getModuleList();
      }
    });
};
const summit = () => {
  updateModule.value.validate((valid) => {
    if (valid) {
      axios.put('/controller/modules', modules.value).then((resp) => {
        if (resp.code === 2000) {
          ElMessage.success({
            message: resp.message,
          });
          dialogVisible.value = false;
          getModuleList();
        }
      });
    }
  });
};
onMounted(() => {
  getModuleList();
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="$t('modulesTS.info')"
    width="400px"
  >
    <el-form
      ref="updateModule"
      :model="modules"
      size="small"
      class="demo-table-expand"
      label-width="90px"
      label-position="left"
    >
      <el-form-item
        prop="name"
        :label="$t('modulesTS.name')"
        :rules="{
          required: true,
          message: $t('modulesTS.isNotNull'),
          trigger: 'blur',
        }"
      >
        <el-input
          v-model="modules.name"
          :placeholder="$t('modulesTS.inputName')"
        ></el-input>
      </el-form-item>
    </el-form>
    <div style="text-align: center">
      <el-button size="small" type="primary" @click="summit">{{
        $t('modulesTS.sure')
      }}</el-button>
    </div>
  </el-dialog>
  <el-button size="mini" round type="primary" @click="open">{{
    $t('modulesTS.add')
  }}</el-button>
  <el-row :gutter="20">
    <el-col v-for="m in pageData" :span="6" style="margin-top: 20px">
      <el-card>
        <div style="text-align: center; font-size: 14px; color: #606266">
          {{ m.name }}
        </div>
        <el-divider style="margin: 12px 0"></el-divider>
        <div style="text-align: center">
          <el-button type="primary" size="mini" @click="editModule(m.id)"
            >{{ $t('common.edit') }}
          </el-button>
          <el-popconfirm
            style="margin-left: 10px"
            :confirm-button-text="$t('form.confirm')"
            :cancel-button-text="$t('form.cancel')"
            icon="el-icon-warning"
            icon-color="red"
            :title="$t('modulesTS.del')"
            @confirm="deleteModule(m.id)"
          >
            <template #reference>
              <el-button type="danger" size="mini"
                >{{ $t('common.delete') }}
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </el-card>
    </el-col>
  </el-row>
</template>
