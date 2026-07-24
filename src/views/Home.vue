<script setup>
/**
 * Home.vue - 主布局页面
 * 包含左侧导航菜单和顶部导航栏，作为项目内所有页面的统一布局容器
 */

// 引入 Vue 生命周期钩子
import { onMounted } from 'vue';

// 引入 Vuex 状态管理
import { useStore } from 'vuex';

// 引入路由
import { useRoute } from 'vue-router';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 引入顶部导航栏组件
import Header from '../components/Header.vue';

// 引入默认 Logo 图片
import defaultLogo from '../assets/logo.png';

// 获取国际化翻译函数
const { t: $t } = useI18n();

// 获取 Vuex Store 实例
const store = useStore();

// 获取当前路由信息
const route = useRoute();

/**
 * 组件挂载后执行
 * 根据屏幕宽度自动折叠侧边栏（响应式布局）
 */
onMounted(() => {
  const windowWidth = document.body.clientWidth;
  // 如果屏幕宽度小于 1200px，自动折叠侧边栏
  if (windowWidth < 1200) {
    store.commit('autoChangeCollapse');
  }
});
</script>

<template>
  <el-container>
    <el-aside v-if="route.params.projectId" width="auto">
      <el-menu
        style="padding-top: 15px"
        :background-color="store.state.menuBack"
        :text-color="store.state.menuText"
        :active-text-color="store.state.menuActiveText"
        :collapse="store.state.isCollapse"
        :default-active="route.path"
        :unique-opened="true"
        class="el-menu-vertical-demo font"
        router
      >
        <div class="flex-center" style="margin-bottom: 10px">
          <el-avatar
            :size="40"
            :src="
              store.state.project['projectImg'] &&
              store.state.project['projectImg'].length > 0
                ? store.state.project['projectImg']
                : defaultLogo
            "
            shape="square"
          ></el-avatar>
          <span v-if="!store.state.isCollapse" class="project-name">{{
            store.state.project['projectName']
          }}</span>
        </div>
        <el-menu-item
          :index="'/Home/' + route.params.projectId + '/ProjectIndex'"
        >
          <i class="el-icon-data-analysis"></i>
          <template #title>{{ $t('homeTS.projectOverview') }}</template>
        </el-menu-item>

        <el-sub-menu index="2">
          <template #title>
            <i class="el-icon-folder-opened"></i>
            <span>{{ $t('homeTS.testCaseManagement') }}</span>
          </template>
          <el-sub-menu index="1-4">
            <template #title
              ><i class="el-icon-tickets"></i
              >{{ $t('homeTS.testCase.case') }}</template
            >
            <el-menu-item
              :index="'/Home/' + route.params.projectId + '/AndroidTestCase'"
            >
              <i class="el-icon-d-arrow-right"></i
              >{{ $t('homeTS.testCase.adCase') }}
            </el-menu-item>
            <el-menu-item
              :index="'/Home/' + route.params.projectId + '/IOSTestCase'"
            >
              <i class="el-icon-d-arrow-right"></i
              >{{ $t('homeTS.testCase.iosCase') }}
            </el-menu-item>
            <el-menu-item
              :index="'/Home/' + route.params.projectId + '/HarmonyOSTestCase'"
            >
              <i class="el-icon-d-arrow-right"></i
              >{{ $t('homeTS.testCase.hmCase') }}
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/TestSuites'"
          >
            <i class="el-icon-document-copy"></i>{{ $t('homeTS.testSuite') }}
          </el-menu-item>
          <el-menu-item :index="'/Home/' + route.params.projectId + '/Jobs'">
            <i class="el-icon-timer"></i>{{ $t('routes.timedTask') }}
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="5">
          <template #title>
            <i class="el-icon-lock"></i>
            <span>{{ $t('homeTS.testDataManagement') }}</span>
          </template>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/Elements'"
          >
            <i class="el-icon-thumb"></i>{{ $t('routes.controlElement') }}
          </el-menu-item>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/PublicStep'"
          >
            <i class="el-icon-star-off"></i>{{ $t('routes.publicSteps') }}
          </el-menu-item>
          <el-menu-item :index="'/Home/' + route.params.projectId + '/Scripts'">
            <i class="el-icon-document-add"></i>{{ $t('routes.scripts') }}
          </el-menu-item>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/GlobalParams'"
          >
            <i class="el-icon-user"></i>{{ $t('routes.globalParameter') }}
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="4">
          <template #title>
            <i class="el-icon-paperclip"></i>
            <span>{{ $t('homeTS.testResults') }}</span>
          </template>
          <el-menu-item :index="'/Home/' + route.params.projectId + '/Results'">
            <i class="el-icon-s-data"></i>{{ $t('routes.testResult') }}
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="7">
          <template #title>
            <i class="el-icon-connection"></i>
            <span>{{ $t('homeTS.setting') }}</span>
          </template>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/Packages'"
          >
            <i class="el-icon-suitcase"></i>{{ $t('homeTS.package.mange') }}
          </el-menu-item>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/Crash'"
            disabled
          >
            <i class="el-icon-position"></i>{{ $t('homeTS.crashReport') }}
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="6">
          <template #title>
            <i class="el-icon-setting"></i>
            <span>{{ $t('homeTS.projectSetting.setting') }}</span>
          </template>
          <el-menu-item :index="'/Home/' + route.params.projectId + '/Modules'">
            <i class="el-icon-price-tag"></i
            >{{ $t('homeTS.projectSetting.mange') }}
          </el-menu-item>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/Versions'"
          >
            <i class="el-icon-coin"></i>{{ $t('homeTS.projectSetting.update') }}
          </el-menu-item>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/ProjectOption'"
          >
            <i class="el-icon-key"></i>{{ $t('routes.projectSetting') }}
          </el-menu-item>
          <el-menu-item
            :index="'/Home/' + route.params.projectId + '/ProjectAlertRobots'"
          >
            <i class="el-icon-close-notification"></i
            >{{ $t('routes.projectAlertRobots') }}
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>
    <Header></Header>
  </el-container>
</template>
