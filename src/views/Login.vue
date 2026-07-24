<script setup>
/**
 * Login.vue - 登录页面
 * 提供用户登录和注册功能，支持普通登录和 LDAP 登录
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

// 引入 Logo 图片
import logoT from '../assets/logo.png';
import logo from '../assets/img/logo2.png';
import background from '../assets/img/background.svg';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 获取路由实例
const router = useRouter();

// 获取当前路由信息
const route = useRoute();

// 获取 Vuex Store 实例
const store = useStore();

/**
 * 用户登录表单数据
 */
const user = ref({
  userName: '', // 用户名
  password: '', // 密码
});

/**
 * 用户注册表单数据
 */
const register = ref({
  userName: '', // 用户名
  password: '', // 密码
  role: 2, // 角色（默认测试工程师）
});

// 登录表单引用
const loginForm = ref(null);

// 配置加载状态
const configLoading = ref(true);

/**
 * 登录配置
 * 控制是否启用注册、普通登录、LDAP 登录
 */
const config = ref({
  registerEnable: false, // 是否启用注册
  normalEnable: false, // 是否启用普通登录
  ldapEnable: false, // 是否启用 LDAP 登录
});

/**
 * 获取登录配置
 */
const getLoginConfig = () => {
  axios.get('/controller/users/loginConfig').then((resp) => {
    if (resp.code === 2000) {
      configLoading.value = false;
      config.value = resp.data;
    }
  });
};

/**
 * 提交登录请求
 * @param {Object} u - 用户登录数据
 */
const loginPost = (u) => {
  loading.value = true;
  axios.post('/controller/users/login', u).then((resp) => {
    loading.value = false;
    if (resp.code === 2000) {
      // 登录成功，保存用户信息到 Vuex
      store.commit('changeLogin', resp.data);
      // 重定向到之前的页面或首页
      if (route.query.redirect) {
        const { redirect } = route.query;
        router.replace(redirect);
      } else {
        router.replace({ path: '/' });
      }
    }
  });
};

/**
 * 登录处理
 */
const login = () => {
  loginForm.value.validate(async (valid) => {
    if (valid) {
      // 清除之前的认证信息
      await store.commit('clearAuth');
      // 提交登录请求
      await loginPost(user.value);
    }
  });
};

// 注册表单引用
const registerForm = ref(null);

/**
 * 注册处理
 */
const registerIn = () => {
  registerForm.value.validate(async (valid) => {
    if (valid) {
      // 清除之前的认证信息
      await store.commit('clearAuth');
      loading.value = true;
      await axios
        .post('/controller/users/register', register.value)
        .then((resp) => {
          loading.value = false;
          if (resp.code === 2000) {
            ElMessage.success({
              message: resp.message,
            });
            // 注册成功后自动登录
            loginPost({
              userName: register.value.userName,
              password: register.value.password,
            });
          }
        });
    }
  });
};

// 登录/注册加载状态
const loading = ref(false);

/**
 * 组件挂载后执行
 * 获取登录配置
 */
onMounted(() => {
  getLoginConfig();
});
</script>

<template>
  <img
    class="play1"
    style="position: absolute; right: 40px; top: 20px; z-index: 9999"
    :src="logoT"
    width="120"
  />
  <img
    class="play2"
    style="position: absolute; right: 30px; top: 180px; z-index: 9999"
    :src="logoT"
    width="40"
  />
  <img
    class="play3"
    style="position: absolute; right: 180px; top: 40px; z-index: 9999"
    :src="logoT"
    width="60"
  />
  <img
    class="play4"
    style="position: absolute; right: 120px; top: 140px; z-index: 9999"
    :src="logoT"
    width="50"
  />
  <div
    class="login"
    :style="
      'background:  url(' +
      background +
      ');background-repeat:no-repeat; background-size:60% 60%;background-origin: content-box;background-position: left bottom;'
    "
  >
    <el-card
      style="width: 550px"
      body-style="background-color:#FFFFFF;text-align:center;position:relative"
    >
      <img :src="logo" width="270" />
      <el-divider class="device-card-divider">{{
        $t('loginTS.testPlatform')
      }}</el-divider>
      <el-tabs
        v-loading="configLoading"
        type="border-card"
        stretch
        style="margin-top: 30px"
      >
        <el-tab-pane
          :label="
            config.normalEnable && config.ldapEnable
              ? $t('loginTS.login.message')
              : config.normalEnable
              ? $t('loginTS.login.register')
              : config.ldapEnable
              ? $t('loginTS.login.LDAPLogin')
              : ''
          "
        >
          <el-form
            ref="loginForm"
            style="margin-top: 10px"
            :model="user"
            size="small"
            @keyup.enter.native="login"
          >
            <el-form-item prop="username">
              <el-input
                v-model="user.userName"
                prefix-icon="el-icon-user"
                :placeholder="$t('loginTS.user.inputUserName')"
              ></el-input>
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="user.password"
                prefix-icon="el-icon-lock"
                type="password"
                show-password
                :placeholder="$t('loginTS.user.inputPassword')"
              ></el-input>
            </el-form-item>
            <el-button
              size="small"
              type="primary"
              style="width: 100%"
              :loading="loading"
              @click="login"
              >{{ $t('loginTS.user.longin') }}
            </el-button>
          </el-form>
        </el-tab-pane>
        <el-tab-pane
          v-if="config.registerEnable"
          :label="$t('loginTS.user.register')"
        >
          <el-form
            ref="registerForm"
            style="margin-top: 10px"
            :model="register"
            size="small"
          >
            <el-form-item prop="username">
              <el-input
                v-model="register.userName"
                prefix-icon="el-icon-user"
                :placeholder="$t('loginTS.user.inputUserName')"
              ></el-input>
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="register.password"
                prefix-icon="el-icon-lock"
                type="password"
                show-password
                :placeholder="$t('loginTS.user.inputPassword')"
              ></el-input>
            </el-form-item>
            <!-- <el-form-item prop="password">
              <el-select style="width: 100%;" v-model="register.role">
                <el-option label="测试工程师" :value="2"></el-option>
                <el-option label="开发工程师" :value="3"></el-option>
              </el-select>
            </el-form-item> -->
            <el-button
              size="small"
              type="primary"
              style="width: 100%"
              :loading="loading"
              @click="registerIn"
              >{{ $t('loginTS.user.register') }}
            </el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style>
.play1 {
  animation: bounce-down 1.8s linear infinite;
}

.play2 {
  animation: bounce-down 1.6s linear infinite;
}

.play3 {
  animation: bounce-down 1.3s linear infinite;
}

.play4 {
  animation: bounce-down 1.5s linear infinite;
}

@-webkit-keyframes bounce-down {
  25% {
    -webkit-transform: translateY(-10px);
  }
  50%,
  100% {
    -webkit-transform: translateY(0);
  }
  75% {
    -webkit-transform: translateY(10px);
  }
}
</style>
