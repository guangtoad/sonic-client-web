<script setup>
/**
 * Versions.vue - 版本管理页面
 * 展示版本列表、支持版本创建、编辑、删除操作
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

// 版本列表数据
const pageData = ref([]);

// 更新版本引用
const updateVersion = ref(null);

/**
 * 版本表单数据
 */
const versions = ref({
  id: null, // 版本 ID（新增时为 null）
  projectId: route.params.projectId, // 项目 ID
  versionName: '', // 版本名称
  createTime: '', // 创建时间
});

/**
 * 编辑版本
 * @param {number} id - 版本 ID
 */
const editVersion = async (id) => {
  await open();
  await getVersionInfo(id);
};

/**
 * 打开版本弹窗（新增或编辑）
 */
const open = () => {
  versions.value = {
    id: null,
    projectId: route.params.projectId,
    versionName: '',
    createTime: '',
  };
  dialogVisible.value = true;
};

/**
 * 获取版本列表
 */
const getVersionList = () => {
  axios
    .get('/controller/versions/list', {
      params: {
        projectId: route.params.projectId,
      },
    })
    .then((resp) => {
      pageData.value = resp.data;
    });
};

/**
 * 获取版本详情
 * @param {number} id - 版本 ID
 */
const getVersionInfo = (id) => {
  axios
    .get('/controller/versions', {
      params: {
        id,
      },
    })
    .then((resp) => {
      versions.value = resp.data;
    });
};
const deleteVersion = (id) => {
  axios
    .delete('/controller/versions', {
      params: {
        id,
      },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        getVersionList();
      }
    });
};
const summit = () => {
  updateVersion.value.validate((valid) => {
    if (valid) {
      axios.put('/controller/versions', versions.value).then((resp) => {
        if (resp.code === 2000) {
          ElMessage.success({
            message: resp.message,
          });
          dialogVisible.value = false;
          getVersionList();
        }
      });
    }
  });
};
onMounted(() => {
  getVersionList();
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="$t('versionsTS.iteration')"
    width="400px"
  >
    <el-form
      ref="updateVersion"
      :model="versions"
      size="small"
      class="demo-table-expand"
      label-width="90px"
      label-position="left"
    >
      <el-form-item
        prop="versionName"
        :label="$t('versionsTS.name')"
        :rules="{
          required: true,
          message: $t('versionsTS.noNull'),
          trigger: 'blur',
        }"
      >
        <el-input
          v-model="versions.versionName"
          :placeholder="$t('versionsTS.inputName')"
        ></el-input>
      </el-form-item>
      <el-form-item
        :label="$t('versionsTS.time')"
        prop="createTime"
        :rules="{
          required: true,
          message: $t('versionsTS.timeNoNull'),
          trigger: 'change',
        }"
      >
        <el-date-picker
          v-model="versions.createTime"
          value-format="YYYY-MM-DD HH:mm:ss"
          style="width: 100%"
          type="datetime"
          :placeholder="$t('versionsTS.selectTime')"
        ></el-date-picker>
      </el-form-item>
    </el-form>
    <div style="text-align: center">
      <el-button size="small" type="primary" @click="summit">{{
        $t('modulesTS.sure')
      }}</el-button>
    </div>
  </el-dialog>
  <el-button size="mini" round type="primary" @click="open">{{
    $t('versionsTS.addVersions')
  }}</el-button>
  <el-timeline style="margin-top: 20px">
    <el-timeline-item
      v-for="(v, index) in pageData"
      :hollow="true"
      :type="index === 0 ? 'success' : 'info'"
      :timestamp="v.createTime"
      placement="top"
    >
      <el-card>
        <h3 style="margin-top: 5px">{{ v.versionName }}</h3>
        <div>
          <el-button type="primary" size="mini" @click="editVersion(v.id)"
            >{{ $t('common.edit') }}
          </el-button>
          <el-popconfirm
            style="margin-left: 10px"
            :confirm-button-text="$t('form.confirm')"
            :cancel-button-text="$t('form.cancel')"
            icon="el-icon-warning"
            icon-color="red"
            :title="$t('versionsTS.delMessage')"
            @confirm="deleteVersion(v.id)"
          >
            <template #reference>
              <el-button type="danger" size="mini"
                >{{ $t('common.delete') }}
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </el-card>
    </el-timeline-item>
  </el-timeline>
</template>
