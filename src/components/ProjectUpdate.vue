<script setup>
/**
 * ProjectUpdate.vue - 项目更新组件
 * 用于创建和编辑项目信息，包括项目名称、描述、Logo、告警机器人配置等
 */

// 引入 Vue 生命周期钩子和响应式 API
import { onMounted, ref } from 'vue';

// 引入 Element Plus 消息组件
import { ElMessage } from 'element-plus';

// 引入路由
import { useRoute, useRouter } from 'vue-router';

// 引入 Vuex 状态管理
import { useStore } from 'vuex';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入 axios
import axios from '../http/axios';

// 获取国际化翻译函数
const { t: $t } = useI18n();

/**
 * 定义组件属性
 */
const props = defineProps({
  // 是否为更新模式（true: 编辑项目，false: 创建项目）
  isUpdate: Boolean,
});

// 获取 Vuex Store 实例
const store = useStore();

// 获取当前路由信息
const route = useRoute();

// 获取路由实例
const router = useRouter();

/**
 * 项目数据对象
 */
const project = ref({
  id: null, // 项目 ID
  projectName: '', // 项目名称
  projectDes: '', // 项目描述
  robotType: -1, // 机器人类型
  robotToken: '', // 机器人 Token
  robotSecret: '', // 机器人密钥
  projectImg: '', // 项目图片 URL
  globalRobot: true, // 是否全局告警机器人
  testsuiteAlertRobotIds: null, // 测试套件告警机器人 ID 列表
});

// 项目表单引用
const projectUpdateForm = ref(null);

// 删除确认弹窗状态
const dialogDel = ref(false);

// 加载所有图片资源
const img = import.meta.globEager('./../assets/img/*');

// 告警机器人列表数据
const robotData = ref([]);

/**
 * 获取告警机器人列表
 */
const getAlertRobots = () => {
  axios
    .get('/controller/alertRobots/listAll', {
      params: {
        projectId: route.params.projectId,
        scene: 'testsuite',
      },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        robotData.value = resp.data;
      }
    });
};

/**
 * 上传前校验
 * 只允许上传 jpg 和 png 格式的图片
 * @param {File} file - 上传的文件
 * @returns {boolean} 是否允许上传
 */
const beforeAvatarUpload = (file) => {
  if (file.name.endsWith('.jpg') || file.name.endsWith('.png')) {
    return true;
  }
  ElMessage.error({
    message: $t('dialog.suffixError'),
  });
  return false;
};

/**
 * 超出限制提示
 */
const limitOut = () => {
  ElMessage.error({
    message: $t('androidRemoteTS.addOne'),
  });
};

/**
 * 上传项目图片
 * @param {Object} content - 上传内容对象，包含 file
 */
const upload = (content) => {
  const formData = new FormData();
  formData.append('file', content.file);
  formData.append('type', 'keepFiles');
  axios
    .post('/folder/upload', formData, {
      headers: { 'Content-type': 'multipart/form-data' },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        project.value.projectImg = resp.data;
      }
    });
};

// 定义组件事件
const emit = defineEmits(['flush']);

/**
 * 提交项目表单（创建或更新）
 */
const summit = () => {
  projectUpdateForm.value.validate((valid) => {
    if (valid) {
      axios.put('/controller/projects', project.value).then((resp) => {
        if (resp.code === 2000) {
          ElMessage.success({
            message: resp.message,
          });
          // 如果是更新模式，更新 Vuex 中的项目信息
          if (props.isUpdate) {
            store.commit('saveProject', project.value);
          }
          // 触发刷新事件，通知父组件更新列表
          emit('flush');
        }
      });
    }
  });
};

// 全屏加载状态
const fullscreenLoading = ref(false);

/**
 * 删除项目
 */
const delProject = () => {
  fullscreenLoading.value = true;
  axios
    .delete('/controller/projects', { params: { id: route.params.projectId } })
    .then((resp) => {
      fullscreenLoading.value = false;
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        dialogDel.value = false;
        // 跳转到首页
        router.push('/');
      }
    });
};

/**
 * 组件挂载后执行
 * 如果是更新模式，加载项目信息；加载告警机器人列表
 */
onMounted(() => {
  if (props.isUpdate) {
    project.value = JSON.parse(JSON.stringify(store.state.project));
  }
  getAlertRobots();
});
</script>

<template>
  <el-form
    ref="projectUpdateForm"
    :model="project"
    label-width="100px"
    class="project-table-expand"
  >
    <el-form-item :label="$t('project.logo')" prop="projectImg">
      <el-upload
        action=""
        list-type="picture-card"
        :with-credentials="true"
        :limit="1"
        :before-upload="beforeAvatarUpload"
        :on-exceed="limitOut"
        :http-request="upload"
      >
        <i class="el-icon-plus"></i>
      </el-upload>
    </el-form-item>
    <el-form-item
      :label="$t('project.name')"
      prop="projectName"
      :rules="{
        required: true,
        message: $t('project.nameMessage'),
        trigger: 'blur',
      }"
    >
      <el-input
        v-model="project.projectName"
        :placeholder="$t('project.namePlace')"
      ></el-input>
    </el-form-item>
    <el-form-item :label="$t('project.des')" prop="projectDes">
      <el-input
        v-model="project.projectDes"
        type="textarea"
        :rows="5"
        :placeholder="$t('project.desPlace')"
      ></el-input>
    </el-form-item>
    <el-form-item :label="$t('project.alertConfig')" prop="globalRobot">
      <div style="display: flex; align-items: center">
        <el-switch v-model="project.globalRobot" class="mb-2" />
        <span style="margin-left: 10px">{{
          $t('project.ui.globalRobot')
        }}</span>
      </div>
      <div style="display: flex; align-items: center">
        <el-switch
          v-model="project.testsuiteAlertRobotIds"
          class="mb-2"
          :inactive-value="[]"
          :active-value="null"
        />
        <span style="margin-left: 10px">{{
          $t('project.ui.testsuiteDefaultAlertRobotIds')
        }}</span>
      </div>
      <template v-if="project.testsuiteAlertRobotIds != null">
        <el-select
          v-model="project.testsuiteAlertRobotIds"
          multiple
          clearable
          style="width: 100%"
          :placeholder="$t('robot.ui.botPlaceholder')"
          ><el-option
            v-for="item in robotData"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          ></el-option
        ></el-select>
      </template>
    </el-form-item>
  </el-form>
  <div style="text-align: center">
    <el-button size="medium" type="primary" icon="el-icon-edit" @click="summit"
      >{{ $t('form.save') }}
    </el-button>
    <el-button
      v-if="isUpdate"
      type="danger"
      size="medium"
      icon="el-icon-delete"
      @click="dialogDel = true"
      >{{ $t('project.delete') }}
    </el-button>
  </div>
  <el-dialog v-model="dialogDel" width="25%" center>
    <div style="text-align: center">
      <p>{{ $t('project.deleteConfirmMsg') }}</p>
      <p style="color: red">
        <i class="el-icon-warning">{{ $t('project.deleteConfirmMsgDes') }}</i>
      </p>
    </div>
    <template #footer>
      <el-button size="small" @click="dialogDel = false">{{
        $t('form.cancel')
      }}</el-button>
      <el-button
        v-loading.fullscreen.lock="fullscreenLoading"
        size="small"
        type="danger"
        @click="delProject"
        >{{ $t('form.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>
