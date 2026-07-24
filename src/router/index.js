/**
 * 路由配置文件
 * 定义应用的所有路由规则，包括登录页、首页、项目管理页和系统设置页
 */

// 引入 Vue Router 核心函数
import { createRouter, createWebHistory } from 'vue-router';

// 引入国际化翻译函数，用于动态设置路由标题
import { $tc } from '@/locales/setupI18n';

/**
 * 获取路由配置数组
 * 使用函数形式返回，确保国际化配置在路由创建前已完成
 * @returns {Array} 路由配置数组
 */
const getRoutes = () => [
  // 登录页路由
  {
    path: '/Login',
    // 使用懒加载方式导入组件，优化首屏加载速度
    component: () => import('../views/Login.vue'),
    // 路由元信息，用于设置页面标题
    meta: { title: $tc('routes.login') },
  },
  // 默认路由重定向到首页
  {
    path: '/',
    redirect: '/Index',
  },
  // Android 远程控制路由（独立页面）
  {
    path: '/AndroidRemote/:deviceId(\\d+)',
    // 参数校验：deviceId 必须为数字
    component: () => import('../views/RemoteEmulator/index.vue'),
    meta: { title: $tc('routes.remoteControl') },
  },
  // iOS 远程控制路由（独立页面）
  {
    path: '/IOSRemote/:deviceId(\\d+)',
    component: () => import('../views/RemoteEmulator/indexIOS.vue'),
    meta: { title: $tc('routes.remoteControl') },
  },
  // 首页路由（项目列表页）
  {
    path: '/Index',
    component: () => import('../views/Index.vue'),
    meta: { title: $tc('routes.home') },
    // 首页子路由
    children: [
      // 设备中心子路由
      {
        path: 'Devices',
        component: () => import('../views/Devices.vue'),
        meta: { title: $tc('routes.deviceCenter') },
      },
      // Android 远程控制子路由
      {
        path: 'AndroidRemote/:deviceId(\\d+)',
        component: () => import('../views/RemoteEmulator/index.vue'),
        meta: { title: $tc('routes.remoteControl') },
      },
      // iOS 远程控制子路由
      {
        path: 'IOSRemote/:deviceId(\\d+)',
        component: () => import('../views/RemoteEmulator/indexIOS.vue'),
        meta: { title: $tc('routes.remoteControl') },
      },
    ],
  },
  // 项目主页路由（带项目ID参数）
  {
    path: '/Home/:projectId(\\d+)',
    component: () => import('../views/Home.vue'),
    // 默认重定向到项目概览页
    redirect: { name: 'ProjectIndex' },
    // 项目管理子路由
    children: [
      {
        path: 'Devices',
        component: () => import('../views/Devices.vue'),
        meta: { title: $tc('routes.deviceCenter') },
      },
      {
        path: 'AndroidRemote/:deviceId(\\d+)',
        component: () => import('../views/RemoteEmulator/index.vue'),
        meta: { title: $tc('routes.remoteControl') },
      },
      {
        path: 'IOSRemote/:deviceId(\\d+)',
        component: () => import('../views/RemoteEmulator/indexIOS.vue'),
        meta: { title: $tc('routes.remoteControl') },
      },
      {
        path: 'AndroidTestCase',
        name: 'AndroidTestCase',
        component: () => import('../views/AndroidTestCase.vue'),
        meta: { title: $tc('routes.androidTestCase') },
      },
      {
        path: 'IOSTestCase',
        name: 'IOSTestCase',
        component: () => import('../views/IOSTestCase.vue'),
        meta: { title: $tc('routes.iosTestCase') },
      },
      {
        path: 'HarmonyOSTestCase',
        name: 'HarmonyOSTestCase',
        component: () => import('../views/HarmonyOSTestCase.vue'),
        meta: { title: $tc('routes.hmtestCase') },
      },
      {
        path: 'StepListView/:caseId(\\d+)',
        name: 'StepListView',
        component: () => import('../views/StepListView.vue'),
        meta: { title: $tc('routes.operateSteps') },
      },
      {
        path: 'TestSuites',
        name: 'TestSuites',
        component: () => import('../views/TestSuites.vue'),
        meta: { title: $tc('routes.testSuite') },
      },
      {
        path: 'Results',
        name: 'Results',
        component: () => import('../views/Results.vue'),
        meta: { title: $tc('routes.testResult') },
      },
      {
        path: 'ResultDetail/:resultId(\\d+)',
        name: 'ResultDetail',
        component: () => import('../views/ResultDetail.vue'),
        meta: { title: $tc('routes.reportDetails') },
      },
      {
        path: 'PublicStep',
        name: 'PublicStep',
        component: () => import('../views/PublicStep.vue'),
        meta: { title: $tc('routes.publicSteps') },
      },
      {
        path: 'Elements',
        name: 'Elements',
        component: () => import('../views/Elements.vue'),
        meta: { title: $tc('routes.controlElement') },
      },
      {
        path: 'Scripts',
        name: 'Scripts',
        component: () => import('../views/Scripts.vue'),
        meta: { title: $tc('routes.scripts') },
      },
      {
        path: 'GlobalParams',
        name: 'GlobalParams',
        component: () => import('../views/GlobalParams.vue'),
        meta: { title: $tc('routes.globalParameter') },
      },
      {
        path: 'Modules',
        name: 'Modules',
        component: () => import('../views/Modules.vue'),
        meta: { title: $tc('routes.moduleManage') },
      },
      {
        path: 'Versions',
        name: 'Versions',
        component: () => import('../views/Versions.vue'),
        meta: { title: $tc('routes.versionIteration') },
      },
      {
        path: 'Jobs',
        name: 'Jobs',
        component: () => import('../views/Jobs.vue'),
        meta: { title: $tc('routes.timedTask') },
      },
      {
        path: 'ProjectOption',
        name: 'ProjectOption',
        component: () => import('../views/ProjectOption.vue'),
        meta: { title: $tc('routes.projectSetting') },
      },
      {
        path: 'ProjectAlertRobots',
        name: 'ProjectAlertRobots',
        component: () => import('../views/ProjectAlertRobots.vue'),
        meta: { title: $tc('routes.ProjectAlertRobots') },
      },
      {
        path: 'ProjectIndex',
        name: 'ProjectIndex',
        component: () => import('../views/ProjectIndex.vue'),
        meta: { title: $tc('routes.projectPage') },
      },
      {
        path: 'Packages',
        name: 'Packages',
        component: () => import('../views/Packages.vue'),
        meta: { title: $tc('routes.projectPage') },
      },
    ],
  },
  {
    path: '/Setting',
    component: () => import('../views/Setting/Index.vue'),
    redirect: { name: 'Resources' },
    children: [
      {
        path: 'Resources',
        name: 'Resources',
        component: () => import('../views/Setting/Resource.vue'),
        meta: { title: $tc('routes.resource') },
      }, // Role
      {
        path: 'Roles',
        name: 'Roles',
        component: () => import('../views/Setting/Role.vue'),
        meta: { title: $tc('routes.role') },
      },
      {
        path: 'Users',
        name: 'Users',
        component: () => import('../views/Setting/Users.vue'),
        meta: { title: $tc('routes.users') },
      },
      {
        path: 'SysJobs',
        name: 'SysJobs',
        component: () => import('../views/Setting/SysJobs.vue'),
        meta: { title: $tc('routes.sysJobs') },
      },
      {
        path: 'RemoteSettings',
        name: 'RemoteSettings',
        component: () => import('../views/Setting/RemoteSettings.vue'),
        meta: { title: $tc('routes.remoteSettings') },
      },
      {
        path: 'SysAlertRobots',
        name: 'SysAlertRobots',
        component: () => import('../views/Setting/SysAlertRobots.vue'),
        meta: { title: $tc('routes.sysAlertRobots') },
      },
    ],
  },
];

// 路由实例，用于在其他模块中访问路由对象
export let router = null;

/**
 * 初始化路由并注册到 Vue 应用
 * @param {Object} app - Vue 应用实例
 */
export function setupRouter(app) {
  // 创建路由实例
  router = createRouter({
    // 使用 HTML5 History 模式（去掉 URL 中的 #）
    history: createWebHistory(),
    // 加载路由配置
    routes: getRoutes(),
  });
  // 将路由注册到 Vue 应用
  app.use(router);
}
