<script setup>
/**
 * Header.vue - 顶部导航栏组件
 * 包含项目切换、主题切换、语言切换、用户信息、密码修改、Token生成等功能
 */

// 引入 Vuex 状态管理
import { useStore } from 'vuex';

// 引入路由
import { useRoute, useRouter } from 'vue-router';

// 引入 Vue 生命周期钩子和响应式 API
import { onBeforeMount, onMounted, ref, watch } from 'vue';

// 引入 Element Plus 图标
import {
  Fold,
  Expand,
  Cellphone,
  HomeFilled,
  Setting,
} from '@element-plus/icons';

// 引入 Element Plus 消息组件
import { ElMessage } from 'element-plus';

// 引入语言配置列表
import { localeList } from '@/config/locale';

// 引入语言切换 hook
import useLocale from '@/locales/useLocale';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入剪贴板插件
import useClipboard from 'vue-clipboard3';

// 引入默认 Logo
import defaultLogo from '../assets/logo.png';

// 引入项目更新组件
import ProjectUpdate from './ProjectUpdate.vue';

// 引入 Logo
import logo from '../assets/logo.png';

// 引入 axios
import axios from '../http/axios';

// 初始化剪贴板
const { toClipboard } = useClipboard();

/**
 * 响应式状态定义
 */

// 修改密码表单引用
const changePwdForm = ref(null);

// 修改密码表单数据
const changePwd = ref({
  oldPwd: '', // 旧密码
  newPwd: '', // 新密码
  newPwdSec: '', // 确认新密码
});

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

/**
 * 密码确认校验规则
 * 确保两次输入的新密码一致
 * @param {Object} rule - 校验规则
 * @param {string} value - 校验值
 * @param {Function} callback - 回调函数
 */
const validatePass = (rule, value, callback) => {
  if (value === '') {
    callback(new Error($t('form.notEmpty')));
  } else {
    if (changePwd.value.newPwd !== changePwd.value.newPwdSec) {
      callback(new Error($t('form.differentInput')));
    }
    callback();
  }
};

// 修改密码弹窗状态
const dialogChangePwd = ref(false);

// 新生成的 Token
const tokenNew = ref('');

/**
 * 监听修改密码弹窗关闭事件
 * 关闭时清空表单数据
 */
watch(dialogChangePwd, (newValue, oldValue) => {
  if (!newValue) {
    changePwd.value = {
      oldPwd: '',
      newPwd: '',
      newPwdSec: '',
    };
  }
});

/**
 * 生成新的 Token
 */
const generateToken = () => {
  axios
    .get('/controller/users/generateToken', {
      params: { day: day.value },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        tokenNew.value = resp.data;
      }
    });
};

/**
 * 提交密码修改
 */
const changePwdSummit = () => {
  changePwdForm.value.validate((valid) => {
    if (valid) {
      axios
        .put('/controller/users', {
          oldPwd: changePwd.value.oldPwd,
          newPwd: changePwd.value.newPwd,
        })
        .then((resp) => {
          if (resp.code === 2000) {
            ElMessage.success({
              message: resp.message,
            });
            dialogChangePwd.value = false;
          }
        });
    }
  });
};

// 用户信息弹窗状态
const dialogUserInfo = ref(false);

// 项目选择弹窗状态
const dialogVisible = ref(false);

// Token 弹窗状态
const dialogToken = ref(false);

// Token 有效期天数
const day = ref(14);

// 获取 Vuex Store 实例
const store = useStore();

// 获取路由实例
const router = useRouter();

// 获取当前路由信息
const route = useRoute();

// 项目列表数据
const projectData = ref([]);

// 当前主题
const theme = ref('');

/**
 * 刷新项目列表
 */
const flush = () => {
  dialogVisible.value = false;
  getProjectList();
};

/**
 * 获取项目列表
 */
const getProjectList = () => {
  axios.get('/controller/projects/list').then((resp) => {
    projectData.value = resp.data;
    store.commit('saveProjectList', projectData.value);
  });
};

/**
 * 跳转到指定项目
 * @param {Object} project - 项目对象
 */
const jump = (project) => {
  store.commit('saveProject', project);
  router.push({
    path: `/Home/${project.id}/ProjectIndex`,
  });
};

/**
 * 跳转到指定路径
 * @param {string} path - 路由路径
 */
const pushIndex = (path) => {
  router.push({
    path,
  });
};

/**
 * 退出登录
 */
const logout = () => {
  store.commit('clearAuth');
  router.replace({ path: '/Login' });
};

/**
 * 在新窗口打开 URL
 * @param {string} url - 要打开的 URL
 */
const goToUrl = (url) => {
  window.open(url, '_blank');
};

/**
 * 切换主题样式
 * @param {string} t - 主题名称（'light' 或 'dark'）
 */
const toggleClass = (t) => {
  localStorage.setItem('SonicTheme', t);
  store.commit('saveTheme', theme.value);
  document.body.className = `sonic-${t}`;
};

/**
 * 组件挂载前执行
 * 初始化主题设置
 */
onBeforeMount(() => {
  theme.value = localStorage.getItem('SonicTheme')
    ? localStorage.getItem('SonicTheme')
    : 'light';
});

/**
 * 组件挂载后执行
 * 应用主题样式并加载项目列表
 */
onMounted(() => {
  toggleClass(theme.value);
  getProjectList();
});

// 国际化设置
const { t: $t } = useI18n();

/**
 * 语言切换处理函数
 * @param {Object} val - 选择的语言选项
 */
const changeLocaleHandler = function (val) {
  const { changeLocale } = useLocale(store);
  changeLocale(val.index);
};
</script>

<template>
  <el-container direction="vertical">
    <el-header>
      <div class="flex-center demo">
        <div
          v-if="
            route.params.projectId || route.fullPath.indexOf('/Setting') != -1
          "
          style="margin: 0 20px; cursor: pointer"
          @click="store.commit('changeCollapse')"
        >
          <el-icon
            v-if="store.state.isCollapse === false"
            :size="20"
            style="vertical-align: middle"
          >
            <Fold />
          </el-icon>
          <el-icon v-else :size="20" style="vertical-align: middle">
            <Expand />
          </el-icon>
        </div>
        <el-tooltip
          :content="$t('layout.theme') + theme.toUpperCase()"
          placement="bottom"
        >
          <el-switch
            v-model="theme"
            style="margin-left: 15px"
            :width="33"
            active-value="light"
            inactive-value="dark"
            active-color="#C0C4CC"
            inactive-color="#ffffff"
            active-icon-class="el-icon-sunny"
            inactive-icon-class="el-icon-moon"
            @change="toggleClass"
          ></el-switch>
        </el-tooltip>
        <el-menu
          :ellipsis="false"
          :background-color="store.state.menuBack"
          :text-color="store.state.menuText"
          :active-text-color="store.state.menuActiveText"
          mode="horizontal"
          class="el-menu-horizontal-demo font"
        >
          <el-sub-menu index="Language">
            <template #title>{{ $t('layout.languages') }}</template>
            <el-menu-item
              v-for="item in localeList"
              :key="item.event"
              :index="item.event"
              @click="changeLocaleHandler"
              >{{ item.text }}
              <el-badge
                v-if="item.building"
                type="primary"
                value="building"
                style="margin: 0 0 5px 5px"
              ></el-badge>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </div>
      <div class="flex-center">
        <el-menu
          :ellipsis="false"
          :background-color="store.state.menuBack"
          :text-color="store.state.menuText"
          :active-text-color="store.state.menuActiveText"
          mode="horizontal"
          class="el-menu-horizontal-demo font"
          :default-active="route.path"
        >
          <el-menu-item
            index="/Index/Devices"
            @click="pushIndex('/Index/Devices')"
          >
            <el-icon
              :size="18"
              style="vertical-align: middle; margin-right: 5px"
            >
              <Cellphone />
            </el-icon>
            {{ $t('layout.deviceCenter') }}
          </el-menu-item>
          <el-menu-item
            v-if="
              route.params.projectId ||
              route.fullPath === '/Index/Devices' ||
              route.fullPath.indexOf('/Setting') != -1
            "
            index="/Index"
            @click="pushIndex('/Index')"
          >
            <el-icon
              :size="18"
              style="vertical-align: middle; margin-right: 5px"
            >
              <HomeFilled />
            </el-icon>
            {{ $t('layout.backHome') }}
          </el-menu-item>
          <el-sub-menu index="1">
            <template #title>
              <el-avatar
                size="medium"
                style="background: #409eff !important; margin-right: 5px"
              >
                {{
                  store.state.userInfo.userName &&
                  store.state.userInfo.userName.length > 1
                    ? store.state.userInfo.userName.substring(
                        store.state.userInfo.userName.length - 2
                      )
                    : store.state.userInfo.userName
                }}
              </el-avatar>
              {{ store.state.userInfo.userName }}
            </template>
            <el-menu-item index="1-0" @click="pushIndex('/Setting')">
              {{ $t('setting.title') }}
            </el-menu-item>
            <el-menu-item index="1-1" @click="dialogUserInfo = true">{{
              $t('layout.myInfo')
            }}</el-menu-item>
            <el-menu-item index="1-2" @click="dialogChangePwd = true">{{
              $t('layout.changePassword')
            }}</el-menu-item>
            <el-menu-item index="1-4" @click="dialogToken = true"
              >Access Token</el-menu-item
            >
            <el-sub-menu index="2">
              <template #title
                ><span class="flex-center font title"
                  ><img style="margin-right: 5px" width="20" :src="logo" />{{
                    $t('layout.aboutSonic')
                  }}</span
                >
              </template>
              <el-menu-item
                index="2-1"
                @click="goToUrl('https://sonic-cloud.cn/home')"
                >{{ $t('layout.officialWebSite') }}
              </el-menu-item>
              <el-menu-item
                index="2-0"
                @click="goToUrl('https://sonic-cloud.cn/document')"
                >{{ $t('layout.document') }}
              </el-menu-item>
              <el-menu-item
                index="2-2"
                @click="goToUrl('https://sonic-cloud.cn/version')"
                >{{ $t('layout.versionUpdateRecord') }}
                <el-badge value="New" style="margin: 0 0 5px 5px"></el-badge>
              </el-menu-item>
              <el-menu-item
                index="2-3"
                @click="
                  goToUrl(
                    axios.defaults.baseURL.substring(
                      0,
                      axios.defaults.baseURL.length - 4
                    ) + '/doc.html'
                  )
                "
              >
                REST API
              </el-menu-item>
            </el-sub-menu>
            <el-menu-item index="1-3" @click="logout">{{
              $t('layout.signOut')
            }}</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </div>
    </el-header>
    <el-backtop
      :right="20"
      :bottom="20"
      target=".demo-tree-scrollbar .el-scrollbar__wrap"
    ></el-backtop>
    <el-dialog
      v-model="dialogVisible"
      :title="$t('dialog.projectInfo')"
      width="600px"
    >
      <project-update v-if="dialogVisible" :is-update="false" @flush="flush" />
    </el-dialog>
    <el-dialog
      v-model="dialogUserInfo"
      :title="$t('dialog.myInfo')"
      width="420px"
      center
    >
      <el-form
        label-position="left"
        class="demo-table-expand"
        label-width="90px"
        style="margin-left: 10px; word-break: break-all"
      >
        <el-form-item :label="$t('form.username')">
          <span>{{ store.state.userInfo.userName }}</span>
        </el-form-item>
        <el-form-item :label="$t('form.role')">
          <el-tag size="small">
            {{
              store.state.userInfo.roleName
                ? store.state.userInfo.roleName
                : '无'
            }}
          </el-tag>
        </el-form-item>
      </el-form>
    </el-dialog>
    <el-dialog
      v-model="dialogChangePwd"
      :title="$t('dialog.changePassword')"
      width="520px"
    >
      <el-form
        v-if="dialogChangePwd"
        ref="changePwdForm"
        label-position="left"
        class="demo-table-expand"
        label-width="70px"
        size="small"
        :model="changePwd"
      >
        <el-form-item
          :rules="{
            required: true,
            message: $t('form.oldPasswordNotEmpty'),
            trigger: 'blur',
          }"
          prop="oldPwd"
          :label="$t('form.oldPassword')"
        >
          <el-input
            v-model="changePwd.oldPwd"
            prefix-icon="el-icon-lock"
            type="password"
            show-password
            :placeholder="$t('form.inputOldPassword')"
          ></el-input>
        </el-form-item>
        <el-form-item
          :rules="{
            required: true,
            message: $t('form.newPasswordNotEmpty'),
            trigger: 'blur',
          }"
          prop="newPwd"
          :label="$t('form.newPassword')"
        >
          <el-input
            v-model="changePwd.newPwd"
            prefix-icon="el-icon-lock"
            type="password"
            show-password
            :placeholder="$t('form.inputNewPassword')"
          ></el-input>
        </el-form-item>
        <el-form-item
          prop="newPwdSec"
          :rules="{
            validator: validatePass,
            trigger: 'blur',
          }"
        >
          <el-input
            v-model="changePwd.newPwdSec"
            prefix-icon="el-icon-lock"
            type="password"
            show-password
            :placeholder="$t('form.inputNewPasswordAgain')"
          ></el-input>
        </el-form-item>
      </el-form>
      <div style="text-align: center">
        <el-button size="small" type="primary" @click="changePwdSummit">{{
          $t('form.confirm')
        }}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="dialogToken" title="AccessToken" width="520px">
      <el-form
        v-if="dialogToken"
        label-position="left"
        class="demo-table-expand"
        label-width="90px"
        size="small"
      >
        <el-form-item :label="$t('token.day')">
          <el-input-number
            v-model="day"
            size="small"
            :min="1"
            :max="999"
          ></el-input-number>
        </el-form-item>
        <el-form-item :label="$t('token.result')">
          <div
            v-if="tokenNew !== ''"
            style="cursor: pointer"
            @click="copy(tokenNew)"
          >
            {{ tokenNew.substring(0, 15) + '*******' + $t('token.click') }}
          </div>
          <div v-else>{{ $t('token.copy') }}</div>
        </el-form-item>
      </el-form>
      <div style="text-align: center">
        <el-button size="small" type="primary" @click="generateToken">{{
          $t('form.confirm')
        }}</el-button>
      </div>
    </el-dialog>
    <el-scrollbar class="demo-tree-scrollbar" style="height: 100%">
      <el-main
        v-if="
          route.params.projectId ||
          route.params.deviceId ||
          route.fullPath === '/Index/Devices' ||
          route.fullPath.indexOf('/Setting') != -1
        "
      >
        <router-view />
      </el-main>
      <el-main v-else>
        <el-alert
          :title="$t('layout.welcomeSpeech')"
          type="info"
          center
          :closable="false"
        >
        </el-alert>
        <div style="text-align: center">
          <el-button
            type="primary"
            size="small"
            style="margin-top: 15px"
            @click="dialogVisible = true"
          >
            {{ $t('layout.addProject') }}
          </el-button>
        </div>
        <el-row
          v-if="projectData && projectData.length > 0"
          style="margin-top: 10px"
          justify="center"
          type="flex"
        >
          <el-col
            v-for="project in projectData"
            :key="project"
            :xs="12"
            :sm="8"
            :md="8"
            :lg="4"
            :xl="3"
          >
            <div @click="jump(project)">
              <el-card
                style="margin: 10px 10px; cursor: pointer"
                shadow="hover"
              >
                <div style="text-align: center">
                  <el-avatar
                    :src="
                      project['projectImg'].length > 0
                        ? project['projectImg']
                        : defaultLogo
                    "
                    :size="150"
                    shape="square"
                  ></el-avatar>
                </div>
                <el-form
                  label-position="left"
                  class="demo-table-expand"
                  style="margin-top: 10px"
                >
                  <el-form-item style="text-align: center">
                    <strong style="font-size: 17px">{{
                      project['projectName']
                    }}</strong>
                  </el-form-item>
                  <el-form-item>
                    <p
                      style="
                        text-indent: 2em;
                        line-height: 30px;
                        margin-top: 0px;
                      "
                    >
                      {{
                        project['projectDes'].length > 30
                          ? project['projectDes'].substring(0, 30) + '...'
                          : project['projectDes']
                      }}
                    </p>
                  </el-form-item>
                </el-form>
              </el-card>
            </div>
          </el-col>
        </el-row>
        <el-empty v-else :image-size="200"></el-empty>
      </el-main>
    </el-scrollbar>
  </el-container>
</template>
