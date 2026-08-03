<script setup>
/*
 *   sonic-client-web  Front end of Sonic cloud real machine platform.
 *   Copyright (C) 2022 SonicCloudOrg
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published
 *   by the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
/**
 * AndroidRemote.vue — Android 设备远程控制页面组件
 *
 * 【组件职责】
 *   作为 Sonic 云真机平台的 Android 远程调试主界面，提供以下能力：
 *   1. 屏幕投射：通过 Scrcpy（推荐）或 Minicap 两种模式实时投射设备屏幕。
 *   2. 远程触控：将鼠标事件转换为设备的 touch / tap / swipe / longPress 指令。
 *   3. 元素检查：拉取当前页面的 UI 控件树（含 WebView），支持 XPath 定位、元素截图、保存为测试元素。
 *   4. 应用管理：展示应用列表，支持安装（上传 apk）、卸载、启动、强制停止。
 *   5. 终端 & Logcat：通过 WebSocket 执行 shell 命令、实时获取 logcat 日志并支持下载。
 *   6. 代理抓包：启动 HTTP 代理并安装证书，用于抓取设备网络请求。
 *   7. 文件管理：向设备推送文件 / 从设备拉取文件。
 *   8. 性能监控：采集 CPU、内存、FPS 等性能指标。
 *   9. Poco 框架：对接 Poco 游戏自动化引擎，获取游戏 UI 树。
 *  10. WebView 调试：转发 WebView 调试端口，在 iframe 中打开 Chrome DevTools Inspector。
 *  11. 实时音频：通过 AudioProcessor 推流设备音频。
 *  12. 测试用例：关联用例并在设备上远程执行，实时回传步骤日志。
 *  13. 空闲检测：超过阈值无操作时自动断开连接，释放设备。
 *
 * 【通信架构】
 *   组件维护 3 条 WebSocket + 1 条音频 WebSocket，全部由 Agent 转发到目标设备：
 *   - websocket           主控制通道：元素树、应用管理、代理、文件操作、驱动、测试步骤等。
 *   - screenWebsocket     屏幕画面通道：由 Scrcpy 实例管理，推送 H.264 / JPEG 帧。
 *   - terminalWebsocket   终端通道：shell 命令、logcat、WiFi 列表。
 *   - audioPlayer.ws      音频通道：通过 AudioProcessor 独立连接。
 *
 * 【执行流程】
 *   onMounted
 *     ├─ 获取项目信息（store 或接口）
 *     ├─ getDeviceById(deviceId)  → 获取设备 → 获取 Agent → openSocket(...)
 *     │     ├─ 创建 websocket            （主控制）
 *     │     ├─ new Scrcpy(...)          （屏幕画面，内部创建 screenWebsocket）
 *     │     └─ 创建 terminalWebsocket    （终端）
 *     ├─ getRemoteTimeout / getIdleTimeout  → 读取超时配置
 *     └─ checkAlive()  → 定时器：空闲超时则 close()
 *   onBeforeUnmount → close()  关闭所有连接并释放资源
 */
import { useRoute, useRouter } from 'vue-router';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useStore } from 'vuex';
import axios from '@/http/axios';
import { ElMessage } from 'element-plus';
import useClipboard from 'vue-clipboard3';
import ColorImg from '@/components/ColorImg.vue';
import StepList from '@/components/StepList.vue';
import TestCaseList from '@/components/TestCaseList.vue';
import StepLog from '@/components/StepLog.vue';
import ElementUpdate from '@/components/ElementUpdate.vue';
import Pageable from '@/components/Pageable.vue';
import PackageList from '@/components/PackageList.vue';
import defaultLogo from '@/assets/logo.png';
// Element Plus 图标集合：用于工具栏按钮、Tab 标签等处的图标渲染
import {
  VideoPause,
  Refresh,
  Connection,
  Delete,
  Place,
  Download,
  Search,
  SwitchButton,
  Position,
  Pointer,
  Camera,
  Sunny,
  Phone,
  PhoneFilled,
  Minus,
  MuteNotification,
  Plus,
  CaretRight,
  CaretLeft,
  Operation,
  Cellphone,
  Menu,
  CopyDocument,
  House,
  Back,
  View,
  InfoFilled,
  Bell,
  Service,
  VideoCamera,
  Postcard,
  Location,
} from '@element-plus/icons';

import { useI18n } from 'vue-i18n';

import AudioProcessor from '@/lib/audio-processor';
import wifiLogo from '@/assets/img/wifi.png';
import RenderDeviceName from '../../components/RenderDeviceName.vue';
import Scrcpy from './Scrcpy';
import PocoPane from '../../components/PocoPane.vue';
import AndroidPerf from '../../components/AndroidPerf.vue';
import RemotePageHeader from '../../components/RemotePageHeader.vue';

// ======================== 组合式 API 实例与子组件引用 ========================
const pocoPaneRef = ref(null);       // Poco 面板子组件引用，用于调用 setSize / setPocoData
const androidPerfRef = ref(null);    // 性能监控面板子组件引用，用于调用 setData
const { t: $t } = useI18n();         // 国际化翻译函数

const { toClipboard } = useClipboard(); // 剪贴板复制
const route = useRoute();               // 当前路由（取 deviceId 参数）
const store = useStore();               // Vuex 状态（取项目信息）
const router = useRouter();             // 路由跳转（错误时回退）

// ======================== 代理抓包 / WiFi 相关 ========================
const wifiList = ref([]);            // 扫描到的 WiFi 列表
const currentWifi = ref('');         // 当前连接的 WiFi SSID
const isConnectWifi = ref(false);    // 设备是否已连接 WiFi
const pocoLoading = ref(false);      // Poco 树获取中
const proxyWebPort = ref(0);         // 代理 Web 端口（iframe 调试用）
const proxyConnPort = ref(0);        // 代理连接端口

// ======================== 应用列表 / 终端 ========================
const filterAppText = ref('');       // 应用列表搜索关键字
const iFrameHeight = ref(0);         // WebView 调试 iframe 高度
const terminalHeight = ref(0);       // 终端面板高度
const caseList = ref(null);          // 测试用例列表组件引用
const loading = ref(false);          // 全局加载态（切画质/旋转等）
const driverLoading = ref(false);    // Appium 驱动启动中
const remoteAdbLoading = ref(true);  // 远程 ADB 信息加载中
const appList = ref([]);             // 设备上已安装的应用列表

// ======================== 设备与 Agent 信息 ========================
const device = ref({});              // 当前设备信息（udId、model、password 等）
const agent = ref({});               // 设备所属 Agent 信息（host、port、secretKey）

// ======================== 截图 / 上传 ========================
const screenUrls = ref([]);          // 快照截图列表（页面右侧展示）
const uploadUrl = ref('');           // 上传后返回的 URL
const text = ref({ content: '' });   // 预留文本

// ======================== 元素树过滤选项 ========================
const isMultiWindows = ref(false);   // 获取元素树时是否包含多窗口
const isIgnore = ref(true);          // 是否忽略不可见元素
const isVisible = ref(false);        // 是否仅获取可见元素

// ======================== 触控 / 屏幕尺寸（非响应式，频繁读取无需触发渲染） ========================
let imgWidth = 0;                    // 设备屏幕逻辑宽度（px）
let imgHeight = 0;                   // 设备屏幕逻辑高度（px）
// 旋转状态 // 0 90 180 270；-1 表示初始未知
const directionStatus = {
  value: -1,
};
let moveX = 0;                       // 鼠标按下时的起始 x（用于判断 tap / swipe）
let moveY = 0;                       // 鼠标按下时的起始 y
let isFixTouch = false;              // 是否使用 ADB 触控模式（修复触摸）
let isPress = false;                 // 当前是否处于按下状态（Minicap 触控）
let loop = null;                     // 长按检测定时器
let time = 0;                        // 按下累计时长（ms）
let isLongPress = false;             // 是否已触发长按
let mouseMoveTime = 0;               // 鼠标移动节流计数
let touchWrapper = null;             // 触控事件目标 DOM（canvas 或 video 元素）

// ======================== 屏幕投射模式 ========================
const pic = ref('高');               // 当前画质（高/中/低/固定）
const _screenMode = window.localStorage.getItem('screenMode');
const screenMode = ref(_screenMode || 'Scrcpy'); // Scrcpy,Minicap

// ======================== 元素检查 ========================
const elementLoading = ref(false);   // 元素树获取中
const isShowImg = ref(false);        // 是否显示元素调试大图
const isDriverFinish = ref(false);   // Appium 驱动是否已启动
const imgUrl = ref('');              // 元素调试大图 URL
const activity = ref('');            // 当前 Activity 名称
const webViewData = ref([]);         // WebView 列表
const isShowTree = ref(false);       // 是否展示元素树
const elementData = ref([]);         // 元素树数据
const elementDetail = ref(null);     // 当前选中元素详情
const elementScreenLoading = ref(false); // 元素截图获取中
const tree = ref(null);              // el-tree 组件引用
const currentId = ref([]);           // 当前选中的节点 id
const filterText = ref('');          // 元素树过滤关键字

// ======================== 测试用例 / 步骤调试 ========================
const project = ref(null);           // 当前项目
const testCase = ref({});            // 关联的测试用例
const activeTab = ref('main');       // 右侧主 Tab
const activeTab2 = ref('step');      // 调试子 Tab（step / log）
const stepLog = ref([]);             // 步骤执行日志
const debugLoading = ref(false);     // 步骤执行中
const checkElementLoading = ref(false); // 元素定位校验中

// ======================== 元素保存对话框 ========================
const dialogElement = ref(false);    // 添加元素对话框
const dialogImgElement = ref(false); // 元素截图保存对话框
const imgElementUrl = ref(null);     // 元素截图 URL
const updateImgEle = ref(null);      // 表单引用

// ======================== WebView 调试 ========================
const webViewListDetail = ref([]);   // WebView 调试端口列表
const isWebView = ref(true);         // true=显示 WebView 列表；false=显示 iframe
const iframeUrl = ref('');           // Chrome DevTools iframe 地址
const title = ref('');               // iframe 标题
const webViewLoading = ref(false);   // WebView 列表获取中

// ======================== 终端命令 ========================
const cmdInput = ref('');            // 命令输入框
const cmdOutPut = ref([]);           // 命令输出（含 HTML 着色）
const cmdUser = ref('');             // shell 提示符中的用户名
const logcatOutPut = ref([]);        // logcat 输出
const terScroll = ref(null);         // 终端滚动容器引用
const logcatScroll = ref(null);      // logcat 滚动容器引用
const cmdIsDone = ref(true);         // 上一条命令是否执行完毕
const uploadLoading = ref(false);    // 上传中
const remoteAdbUrl = ref('');        // 远程 ADB 连接地址
const logcatFilter = ref({
  level: 'E',                        // 日志级别过滤
  filter: '',                        // 关键字过滤
});
let oldBlob;                         // 上一帧屏幕 Blob（Minicap 模式快速截图复用）
// 待保存的元素对象（新增元素对话框使用）
const element = ref({
  id: null,
  moduleId: 0,
  eleName: '',
  eleType: 'image',  // 默认图片元素
  eleValue: '',
  projectId: 0,
});
/**
 * 计算两个坐标点（"x1,y1" / "x2,y2"）的中心点
 * @param {string} b1 - 起点 "x,y"
 * @param {string} b2 - 终点 "x,y"
 * @returns {string} 中心点 "x,y"
 */
const computedCenter = (b1, b2) => {
  const x1 = b1.substring(0, b1.indexOf(','));
  const y1 = b1.substring(b1.indexOf(',') + 1);
  const x2 = b2.substring(0, b2.indexOf(','));
  const y2 = b2.substring(b2.indexOf(',') + 1);
  const x = parseInt((parseInt(x2) + parseInt(x1)) / 2);
  const y = parseInt((parseInt(y1) + parseInt(y2)) / 2);
  return `${x},${y}`;
};
/**
 * 顶部 Tab 切换时的懒加载处理
 * - proxy：首次进入代理 Tab 时刷新 WiFi 列表
 * - apps / perfmon：首次进入时刷新应用列表
 * - terminal：计算终端面板高度
 * - webview：首次进入时获取 WebView 转发列表
 * @param {Object} e - el-tabs 的 TabPane 上下文
 */
const switchTabs = (e) => {
  if (e.props.name === 'proxy') {
    getWifiList();
  }
  if (e.props.name === 'apps' || e.props.name === 'perfmon') {
    if (appList.value.length === 0) {
      refreshAppList();
    }
  }
  if (e.props.name === 'terminal') {
    terminalHeight.value = document.getElementById('pressKey').offsetTop - 150;
  }
  if (e.props.name === 'webview') {
    if (webViewListDetail.value.length === 0) {
      getWebViewForward();
    }
  }
};
/** 性能监控：开始采集指定应用的性能数据（通过主控制通道下发） */
const startPerfmon = (bundleId) => {
  websocket.send(
    JSON.stringify({
      type: 'startPerfmon',
      bundleId,
    })
  );
};
/** 性能监控：停止采集性能数据 */
const stopPerfmon = () => {
  websocket.send(
    JSON.stringify({
      type: 'stopPerfmon',
    })
  );
};
// 预加载所有设备品牌图片（用于应用图标/设备图等）
const img = import.meta.globEager('../../assets/img/*');
// ======================== WebSocket 连接（组件级全局，非响应式） ========================
let websocket = null;            // 主控制通道
let screenWebsocket = null;      // 屏幕画面通道（由 Scrcpy 实例创建并持有）
let __Scrcpy = null; // 实例     // Scrcpy 实例，负责解码 H.264 / 渲染 JPEG 帧
let terminalWebsocket = null;    // 终端通道（shell 命令、logcat、WiFi）

// 由父级布局组件传入的属性：用于支持左右分栏拖拽与画布信息
defineProps({
  tabPosition: String,
  canvasRectInfo: Object,
  layoutSplitInfo: Object,
  isSplitPressing: Boolean,
  lineMouseup: Function,
  lineMousemove: Function,
  lineMousedown: Function,
  lineMouseleave: Function,
});

/**
 * 打开 WebView 调试 iframe
 * 切换 isWebView 为 false，构造 Chrome DevTools Inspector 的 ws 地址
 * @param {number} port - WebView 调试转发端口
 * @param {string} id - WebView 目标 id
 * @param {string} transTitle - iframe 标题
 */
const tabWebView = (port, id, transTitle) => {
  title.value = transTitle;
  isWebView.value = false;
  iframeUrl.value = `/chrome/devtools/inspector.html?ws=${agent.value.host}:${agent.value.port}/websockets/webView/${agent.value.secretKey}/${port}/${id}`;
  nextTick(() => {
    iFrameHeight.value = document.body.clientHeight - 150;
  });
};
/**
 * 保存元素截图为图片类型元素
 * 校验表单后调用 PUT /controller/elements 接口
 */
const saveEle = () => {
  updateImgEle.value.validate((valid) => {
    if (valid) {
      element.value.eleType = 'image';
      element.value.eleValue = imgElementUrl.value;
      element.value.projectId = project.value.id;
      axios.put('/controller/elements', element.value).then((resp) => {
        if (resp.code === 2000) {
          ElMessage.success({
            message: resp.message,
          });
          dialogImgElement.value = false;
        }
      });
    }
  });
};
/**
 * app列表处理
 * 由于设备返回的 app 列表可能很大，前端自行做分页（每页 7 条）
 */
const appListPageData = ref([]);          // 分页后的二维数组
const currAppListPageIndex = ref(0);      // 当前页索引
const currAppListPageData = ref([]);      // 当前页数据
// 将一维数组切分为每页 7 条的二维数组，并更新当前页
const transformPageable = (data) => {
  const pageSize = 7;
  const len = data.length;
  let start = 0;
  let end = pageSize;
  // 重置分页数组
  appListPageData.value = [];
  while (end <= len) {
    appListPageData.value.push(data.slice(start, end));
    start = end;
    end += pageSize;
  }
  if (len % pageSize) {
    appListPageData.value.push(data.slice(start, len));
  }
  currAppListPageData.value = appListPageData.value[currAppListPageIndex.value];
};
/** 切换应用列表分页 */
const changeAppListPage = (pageNum) => {
  currAppListPageIndex.value = pageNum - 1;
  currAppListPageData.value = appListPageData.value[currAppListPageIndex.value];
};
/** 计算属性：按搜索关键字过滤应用列表并重新分页 */
const filterTableData = computed(() => {
  const list = appList.value.filter(
    (data) =>
      !filterAppText.value ||
      data.appName.toLowerCase().includes(filterAppText.value.toLowerCase()) ||
      data.packageName.toLowerCase().includes(filterAppText.value.toLowerCase())
  );
  transformPageable(list);
  return list;
});
/** 切换触控模式：Minicap 原生触摸 ↔ ADB 修复触摸（isFixTouch） */
const fixTouch = () => {
  ElMessage.success({
    message: $t('androidRemoteTS.repairedSuccess'),
  });
  isFixTouch = !isFixTouch;
};
/** 修复旋转方向：在横竖屏之间切换 directionStatus */
const fixOri = () => {
  ElMessage.success({
    message: $t('androidRemoteTS.repairedSuccess'),
  });
  if (directionStatus.value === 0 || directionStatus.value === 180) {
    directionStatus.value = 90;
  } else {
    directionStatus.value = 0;
  }
};
/** 从 WebView iframe 返回 WebView 列表视图 */
const switchIsWebView = () => {
  isWebView.value = true;
};
/** 关联测试用例到当前调试会话 */
const selectCase = (val) => {
  ElMessage.success({
    message: $t('androidRemoteTS.associationSuccess'),
  });
  testCase.value = val;
};
/** 取消关联的测试用例 */
const removeCase = () => {
  testCase.value = {};
};
/**
 * 根据品牌名获取对应的品牌图片
 * 兼容 meizu/LENOVO 大小写，找不到时回退到 unName.jpg
 * @param {string} name - 品牌名
 * @returns {string} 图片 URL
 */
const getImg = (name) => {
  let result;
  if (name === 'meizu') {
    name = 'Meizu';
  }
  if (name === 'LENOVO') {
    name = 'Lenovo';
  }
  try {
    result = img[`../../assets/img/${name}.jpg`].default;
  } catch {
    result = img['../../assets/img/unName.jpg'].default;
  }
  return result;
};
/** 选中安装包列表中的 item 后触发安装 */
const selectPackage = (val) => {
  ElMessage.success({
    message: $t('androidRemoteTS.startInstall'),
  });
  install(val);
};
// 三种安装包方式tab选中态（pushInstallPane / uploadInstallPane / scanInstallPane）
const activeIntallTab = ref('pushInstallPane');
// 监听元素树过滤关键字，实时调用 el-tree 的 filter
watch(filterText, (newValue, oldValue) => {
  tree.value.filter(newValue);
});
/**
 * el-tree 过滤节点方法：匹配 label 或 resource-id
 * @param {string} value - 过滤关键字
 * @param {Object} data - 节点数据
 * @returns {boolean} 是否保留该节点
 */
const filterNode = (value, data) => {
  if (!value) return true;
  return (
    data.label.indexOf(value) !== -1 ||
    (data.detail['resource-id']
      ? data.detail['resource-id'].indexOf(value) !== -1
      : false)
  );
};
/**
 * 根据元素详情生成候选 XPath 列表
 * 优先级：resource-id > text（精确+包含）> content-desc（精确+包含）
 * @param {Object} elementDetail - 元素详情对象
 * @returns {string[]} XPath 候选数组
 */
const findBestXpath = (elementDetail) => {
  const result = [];
  if (elementDetail['resource-id']) {
    result.push(
      `//${elementDetail.class}[@resource-id='${elementDetail['resource-id']}']`
    );
  }
  if (elementDetail.text) {
    result.push(`//${elementDetail.class}[@text='${elementDetail.text}']`);
    result.push(
      `//${elementDetail.class}[contains(@text,'${elementDetail.text}')]`
    );
  }
  if (elementDetail['content-desc']) {
    result.push(
      `//${elementDetail.class}[@content-desc='${elementDetail['content-desc']}']`
    );
    result.push(
      `//${elementDetail.class}[contains(@content-desc,'${elementDetail['content-desc']}')]`
    );
  }
  return result;
};
/** 下载图片：fetch 转 blob 后通过 <a> 触发下载 */
const downloadImg = (url) => {
  const time = new Date().getTime();
  const link = document.createElement('a');
  fetch(url)
    .then((res) => res.blob())
    .then((blob) => {
      link.href = URL.createObjectURL(blob);
      link.download = `${time}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
};
/** 复制文本到剪贴板并提示结果 */
const copy = (value) => {
  try {
    toClipboard(value);
    ElMessage.success({
      message: $t('androidRemoteTS.copySuccess'),
    });
  } catch (e) {
    ElMessage.error({
      message: $t('androidRemoteTS.copyFail'),
    });
  }
};
/** 打开"添加元素"对话框，预填元素类型和值 */
const toAddElement = (eleType, eleValue) => {
  if (project.value) {
    element.value.eleType = eleType;
    element.value.eleValue = eleValue;
    dialogElement.value = true;
  }
};
/** 清空所有快照截图 */
const removeScreen = () => {
  screenUrls.value = [];
};
/**
 * 从 Scrcpy video 元素截图（Minicap 模式无 oldBlob 时使用）
 * 根据旋转方向计算输出宽高，drawImage 后输出 dataURL
 * @returns {string} 图片的 dataURL（PNG）
 */
const getVideoScreenshot = () => {
  const canvas = document.createElement('canvas');
  const canvasCtx = canvas.getContext('2d');
  const video = document.getElementById('scrcpy-video');
  // 默认生成图片大小
  let w;
  let h;
  if (directionStatus.value === 0 || directionStatus.value === 180) {
    if (screenMode.value == 'Scrcpy') {
      w = imgWidth;
      h = imgHeight;
    } else {
      w = 369;
      h = 800;
    }
  } else if (screenMode.value == 'Scrcpy') {
    w = imgHeight;
    h = imgWidth;
  } else {
    w = 800;
    h = 369;
  }
  canvas.width = w;
  canvas.height = h;
  canvasCtx.drawImage(
    video,
    0,
    0,
    video.videoWidth,
    video.videoHeight,
    0,
    0,
    w,
    h
  );
  return canvas.toDataURL('image/png', 1);
};
/** 快速截图：优先复用上一帧 oldBlob，否则从 video 截图，加入快照列表 */
const quickCap = () => {
  let imageUrl;
  if (oldBlob) {
    const blob = new Blob([oldBlob], { type: 'image/jpeg' });
    const URL = window.URL || window.webkitURL;
    imageUrl = URL.createObjectURL(blob);
  } else {
    imageUrl = getVideoScreenshot();
  }
  const img = new Image();
  screenUrls.value.push(imageUrl);
  img.src = imageUrl;
};
/** 获取当前画面图片 URL（优先 oldBlob，否则 video 截图） */
const getImgUrl = () => {
  let imageUrl;
  if (oldBlob) {
    const blob = new Blob([oldBlob], { type: 'image/jpeg' });
    const URL = window.URL || window.webkitURL;
    imageUrl = URL.createObjectURL(blob);
  } else {
    imageUrl = getVideoScreenshot();
  }
  return imageUrl;
};
/** 设置元素调试大图：获取截图后写入 imgUrl，并按图片尺寸调整 canvas */
const setImgData = () => {
  const imageUrl = getImgUrl();
  const img = new Image();
  img.src = imageUrl;
  imgUrl.value = imageUrl;
  const canvas = document.getElementById('debugPic');
  img.onload = function () {
    canvas.width = img.width;
    canvas.height = img.height;
  };
  isShowImg.value = true;
};
/**
 * 建立全部 WebSocket 连接
 * 1. websocket          — 主控制通道（元素树、应用、代理、文件、驱动、步骤）
 * 2. __Scrcpy 实例      — 屏幕画面通道（内部创建 screenWebsocket）
 * 3. terminalWebsocket  — 终端通道（shell、logcat、WiFi）
 * 建立后绑定 onmessage 回调，并标记 driverLoading
 * @param {string} host  - Agent 主机
 * @param {number} port  - Agent 端口
 * @param {string} key   - Agent secretKey
 * @param {string} udId  - 设备 udId
 */
const openSocket = (host, port, key, udId) => {
  if ('WebSocket' in window) {
    //
    websocket = new WebSocket(
      `ws://${host}:${port}/websockets/android/${key}/${udId}/${localStorage.getItem(
        'SonicToken'
      )}`
    );
    console.log(`WebSocket connect .. ${host}:${port}`);
    //
    __Scrcpy = new Scrcpy({
      socketURL: `ws://${host}:${port}/websockets/android/screen/${key}/${udId}/${localStorage.getItem(
        'SonicToken'
      )}`,
      node: 'scrcpy-video',
      onmessage: screenWebsocketOnmessage,
      excuteMode: screenMode.value,
    });
    screenWebsocket = __Scrcpy.websocket;
    changeScreenMode(screenMode.value, 1);
    //
    terminalWebsocket = new WebSocket(
      `ws://${host}:${port}/websockets/android/terminal/${key}/${udId}/${localStorage.getItem(
        'SonicToken'
      )}`
    );
  } else {
    console.error($t('androidRemoteTS.noWebSocket'));
  }
  websocket.onmessage = websocketOnmessage;
  websocket.onclose = (e) => {};
  terminalWebsocket.onmessage = terminalWebsocketOnmessage;
  terminalWebsocket.onclose = (e) => {};
  driverLoading.value = true;
};
/** 通过终端通道发送 logcat 采集请求（带级别和关键字过滤） */
const sendLogcat = () => {
  terminalWebsocket.send(
    JSON.stringify({
      type: 'logcat',
      level: logcatFilter.value.level,
      filter: logcatFilter.value.filter,
    })
  );
};
/** 通过终端通道请求 WiFi 列表 */
const getWifiList = () => {
  terminalWebsocket.send(
    JSON.stringify({
      type: 'wifiList',
    })
  );
};
/** 清空 logcat 输出 */
const clearLogcat = () => {
  logcatOutPut.value = [];
};
/** 停止 logcat 采集 */
const stopLogcat = () => {
  terminalWebsocket.send(
    JSON.stringify({
      type: 'stopLogcat',
    })
  );
};
/** 保存 logcat：将日志数组拼接为文本并下载为 .log 文件（文件名含机型和时间） */
const saveLogcat = () => {
  if (logcatOutPut.value && Array.isArray(logcatOutPut.value)) {
    const logContent = logcatOutPut.value.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const formattedDate = now.toISOString().replace(/:/g, '-').split('.')[0];
    const modelName = device.value.model;
    const fileName = `${modelName}_${formattedDate}.log`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    console.error('logcatOutPut or logcatOutPut.value not expect');
  }
};

/** 发送 shell 命令：校验非空且上一条已完成后，写入提示符并发送到终端通道 */
const sendCmd = () => {
  if (cmdInput.value.length > 0 && cmdIsDone.value === true) {
    cmdIsDone.value = false;
    cmdOutPut.value.push(
      JSON.parse(
        JSON.stringify(
          `<span style='color: #409EFF'>${cmdUser.value}</span>:/ $ ${cmdInput.value}`
        )
      )
    );
    terminalWebsocket.send(
      JSON.stringify({
        type: 'command',
        detail: cmdInput.value,
      })
    );
    cmdInput.value = '';
  }
};
/** 清空命令输出 */
const clearCmd = () => {
  cmdOutPut.value = [];
};
/** 强制停止当前命令执行 */
const stopCmd = () => {
  cmdIsDone.value = true;
  terminalWebsocket.send(
    JSON.stringify({
      type: 'stopCmd',
    })
  );
};
/**
 * 终端通道消息分发器
 * 处理 WiFi 列表、应用列表增量、logcat（含着色）、shell 命令输出、错误等
 * @param {MessageEvent} message - WebSocket 消息
 */
const terminalWebsocketOnmessage = (message) => {
  switch (JSON.parse(message.data).msg) {
    case 'wifiListDetail': {
      isConnectWifi.value = JSON.parse(message.data).detail.isConnectWifi;
      currentWifi.value = JSON.parse(message.data).detail.connectedWifi.SSID;
      break;
    }
    case 'appListDetail': {
      appList.value.push(JSON.parse(message.data).detail);
      break;
    }
    case 'logcat':
      logcatOutPut.value.push($t('androidRemoteTS.connection'));
      break;
    case 'logcatResp':
      logcatOutPut.value.push(
        JSON.parse(message.data)
          .detail.replace(/ I /g, "<span style='color: #0d84ff'> I </span>")
          .replace(/ V /g, "<span style='color: #0d84ff'> I </span>")
          .replace(/ D /g, "<span style='color: #0d84ff'> D </span>")
          .replace(/ W /g, "<span style='color: #E6A23C'> W </span>")
          .replace(/ E /g, "<span style='color: #F56C6C'> E </span>")
          .replace(/ F /g, "<span style='color: #F56C6C'> F </span>")
      );
      nextTick(() => {
        logcatScroll.value.wrap.scrollTop =
          logcatScroll.value.wrap.scrollHeight;
      });
      break;
    case 'terminal':
      cmdUser.value = JSON.parse(message.data).user;
      cmdOutPut.value.push($t('androidRemoteTS.connection'));
      break;
    case 'terResp':
      cmdOutPut.value.push(JSON.parse(message.data).detail);
      nextTick(() => {
        terScroll.value.wrap.scrollTop = terScroll.value.wrap.scrollHeight;
      });
      break;
    case 'terDone':
      cmdIsDone.value = true;
      break;
    case 'error':
      ElMessage.error({
        message: $t('androidRemoteTS.systemException'),
      });
      close();
      break;
  }
};
/**
 * 屏幕画面通道消息分发器
 * - Blob（二进制）：Minicap 模式的 JPEG 帧，绘制到 canvas
 * - JSON 文本：旋转、支持性错误、尺寸、截图完成、错误等控制消息
 * @param {MessageEvent} message - WebSocket 消息
 */
const screenWebsocketOnmessage = (message) => {
  // console.log('screenWebsocketOnmessage', message.data);
  if (typeof message.data === 'object') {
    oldBlob = message.data;
    const blob = new Blob([message.data], { type: 'image/jpeg' });
    const URL = window.URL || window.webkitURL;
    const img = new Image();
    const canvas = document.getElementById('canvas');
    const g = canvas.getContext('2d');
    img.onload = function () {
      // 不根据按钮组，使用数据源的分辨率点对点
      const { width } = img;
      const { height } = img;
      canvas.width = width;
      canvas.height = height;
      g.drawImage(img, 0, 0, width, height);
    };
    const u = URL.createObjectURL(blob);
    img.src = u;
  } else {
    switch (JSON.parse(message.data).msg) {
      case 'rotation': {
        if (directionStatus.value !== -1) {
          loading.value = true;
          ElMessage.success({
            message: $t('androidRemoteTS.messageOne'),
          });
        }
        directionStatus.value = JSON.parse(message.data).value; // TODO
        // 旋转需要重置一下jmuxer
        if (screenMode.value == 'Scrcpy') {
          // 重置播放器
          __Scrcpy.jmuxer && __Scrcpy.jmuxer.reset();
        }
        break;
      }
      case 'support': {
        ElMessage.error({
          message: JSON.parse(message.data).text,
        });
        loading.value = false;
        break;
      }
      case 'size': {
        imgWidth = JSON.parse(message.data).width;
        imgHeight = JSON.parse(message.data).height;
        loading.value = false;
        pocoPaneRef.value.setSize(
          JSON.parse(message.data).width,
          JSON.parse(message.data).height
        );
        break;
      }
      case 'picFinish': {
        loading.value = false;
        break;
      }
      case 'error':
        ElMessage.error({
          message: $t('androidRemoteTS.systemException'),
        });
        close();
        break;
    }
  }
};
/**
 * 主控制通道消息分发器（核心）
 * 处理：性能数据、Poco 树、代理结果、文件拉取/推送、剪贴板、远程 ADB、
 *       元素树、安装/卸载结果、驱动状态、步骤日志、定位校验、WebView 转发、
 *       元素截图、错误等
 * @param {MessageEvent} message - WebSocket 消息
 */
const websocketOnmessage = (message) => {
  switch (JSON.parse(message.data).msg) {
    case 'perfDetail':
      androidPerfRef.value.setData(JSON.parse(message.data).detail);
      break;
    case 'poco': {
      pocoLoading.value = false;
      const { result } = JSON.parse(message.data);
      if (result) {
        ElMessage.success({
          message: $t('androidRemoteTS.getPocoSuccess'),
        });
        pocoPaneRef.value.setPocoData(JSON.parse(result).result);
      } else {
        ElMessage.error({
          message: $t('androidRemoteTS.getPocoFail'),
        });
      }
      break;
    }
    case 'proxyResult': {
      proxyWebPort.value = JSON.parse(message.data).webPort;
      proxyConnPort.value = JSON.parse(message.data).port;
      nextTick(() => {
        iFrameHeight.value = document.body.clientHeight - 150;
      });
      break;
    }
    case 'pullResult': {
      pullLoading.value = false;
      if (JSON.parse(message.data).status === 'success') {
        ElMessage.success({
          message: $t('androidRemoteTS.pullFile.success'),
        });
        pullResult.value = JSON.parse(message.data).url;
      } else {
        ElMessage.error({
          message: $t('androidRemoteTS.pullFile.fail'),
        });
      }
      break;
    }
    case 'paste': {
      paste.value = JSON.parse(message.data).detail;
      ElMessage.success({
        message: $t('IOSRemote.clipboard.text'),
      });
      break;
    }
    case 'pushResult': {
      pushLoading.value = false;
      if (JSON.parse(message.data).status === 'success') {
        ElMessage.success({
          message: $t('androidRemoteTS.pushFile.success'),
        });
      } else {
        ElMessage.error({
          message: $t('androidRemoteTS.pushFile.fail'),
        });
      }
      break;
    }
    case 'sas': {
      remoteAdbLoading.value = false;
      if (
        JSON.parse(message.data).isEnable &&
        JSON.parse(message.data).port > 0
      ) {
        remoteAdbUrl.value = `${agent.value.host}:${
          JSON.parse(message.data).port
        }`;
      }
      break;
    }
    case 'tree': {
      ElMessage.success({
        message: $t('androidRemoteTS.getEle.success'),
      });
      const result = JSON.parse(message.data);
      currentId.value = [1];
      elementData.value = result.detail;
      isShowTree.value = true;
      elementLoading.value = false;
      webViewData.value = result.webView;
      activity.value = result.activity;
      break;
    }
    case 'treeFail': {
      ElMessage.error({
        message: $t('androidRemoteTS.getEle.fail'),
      });
      elementLoading.value = false;
      break;
    }
    case 'installFinish': {
      if (JSON.parse(message.data).status === 'success') {
        ElMessage.success({
          message: $t('androidRemoteTS.install.success'),
        });
      } else {
        ElMessage.error({
          message: $t('androidRemoteTS.install.fail'),
        });
      }
      break;
    }
    case 'uninstallFinish': {
      if (JSON.parse(message.data).detail === 'success') {
        ElMessage.success({
          message: $t('androidRemoteTS.uninstall.success'),
        });
      } else {
        ElMessage.error({
          message: $t('androidRemoteTS.uninstall.fail'),
        });
      }
      break;
    }
    case 'openDriver': {
      let msg = $t('androidRemoteTS.driverStatus.fail');
      driverLoading.value = false;
      if (JSON.parse(message.data).status === 'success') {
        isDriverFinish.value = true;
        msg = $t('androidRemoteTS.driverStatus.success');
      }
      ElMessage({
        type: JSON.parse(message.data).status,
        message: msg,
      });
      break;
    }
    case 'step': {
      setStepLog(JSON.parse(message.data));
      break;
    }
    case 'status': {
      debugLoading.value = false;
      checkElementLoading.value = false;
      ElMessage.info({
        message: $t('androidRemoteTS.runOver'),
      });
      break;
    }
    case 'forwardView': {
      webViewLoading.value = false;
      ElMessage.success({
        message: $t('androidRemoteTS.getSuccess'),
      });
      webViewListDetail.value = JSON.parse(message.data).detail;
      break;
    }
    case 'eleScreen': {
      if (JSON.parse(message.data).img) {
        ElMessage.success({
          message: $t('androidRemoteTS.getPsSuccess'),
        });
        imgElementUrl.value = JSON.parse(message.data).img;
        dialogImgElement.value = true;
      } else {
        ElMessage.error($t('IOSRemote.eleScreen.err'));
      }
      elementScreenLoading.value = false;
      break;
    }
    case 'error': {
      ElMessage.error({
        message: $t('androidRemoteTS.systemException'),
      });
      close();
      router.go(-1);
      break;
    }
  }
};
// ======================== 文本输入 / 剪贴板 ========================
const inputValue = ref('');        // 远程输入框文本
const inputBox = ref(null);        // 输入框 DOM 引用（用于自动聚焦）
const inputBoxStyle = ref({});     // 输入框浮动定位样式
const paste = ref('');             // 设备剪贴板内容
/** 输入框内容变化时发送文本到设备 */
const changeInputHandle = () => {
  if (inputValue.value) {
    websocket.send(
      JSON.stringify({
        type: 'text',
        detail: inputValue.value,
      })
    );
    inputValue.value = '';
  }
};
/** 发送退格键（CODE_AC_BACK）到设备 */
const deleteInputHandle = () => {
  websocket.send(
    JSON.stringify({
      type: 'text',
      detail: 'CODE_AC_BACK',
    })
  );
};
/** 设置设备剪贴板内容 */
const setPasteboard = (text) => {
  websocket.send(
    JSON.stringify({
      type: 'setPasteboard',
      detail: text,
    })
  );
  ElMessage.success({
    message: $t('IOSRemote.clipboard.SentSuccessfully'),
  });
};
/** 获取设备剪贴板内容（结果通过 paste 消息回传） */
const getPasteboard = () => {
  websocket.send(
    JSON.stringify({
      type: 'getPasteboard',
    })
  );
};
/** 发送回车键（CODE_AC_ENTER）到设备 */
const enterInputHandle = () => {
  websocket.send(
    JSON.stringify({
      type: 'text',
      detail: 'CODE_AC_ENTER',
    })
  );
};
/** 启动 Appium 驱动（下发 openDriver，结果由 openDriver 消息回传） */
const openDriver = () => {
  driverLoading.value = true;
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'openDriver',
    })
  );
};
/** 关闭 Appium 驱动 */
const closeDriver = () => {
  isDriverFinish.value = false;
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'closeDriver',
    })
  );
  ElMessage.success({
    message: $t('androidRemoteTS.code.closeDriverMessage'),
  });
};
/**
 * 计算鼠标事件对应的设备坐标（Minicap 触控模式）
 * 根据旋转方向（0/90/180/270）做坐标轴变换，并设置输入框浮动位置
 * @returns {{x:number, y:number}} 设备坐标系下的 x, y
 */
const getCurLocation = () => {
  let x;
  let y;
  let _x;
  let _y;
  const canvas = touchWrapper;
  const rect = canvas.getBoundingClientRect();
  if (directionStatus.value != 0 && directionStatus.value != 180) {
    // 左右旋转
    _x = parseInt(
      (event.clientY - rect.top) * (imgWidth / canvas.clientHeight)
    );
    //
    _y = parseInt(
      (event.clientX - rect.left) * (imgHeight / canvas.clientWidth)
    );
    x = directionStatus.value == 90 ? imgWidth - _x : _x - imgWidth * 3;
    y = directionStatus.value == 90 ? _y : -_y;
  } else {
    _x = parseInt(
      (event.clientX - rect.left) * (imgWidth / canvas.clientWidth)
    );
    x = directionStatus.value == 180 ? imgWidth - _x : _x;
    //
    _y = parseInt(
      (event.clientY - rect.top) * (imgHeight / canvas.clientHeight)
    );
    y = directionStatus.value == 180 ? imgHeight - _y : _y;
  }
  inputBoxStyle.value = {
    left: `${event.clientX - rect.left}px`,
    top: `${event.clientY - rect.top}px`,
  };
  return {
    x,
    y,
  };
};
/**
 * 计算鼠标事件对应的设备坐标（ADB 修复触控模式）
 * 与 getCurLocation 类似，但旋转 90/270 时直接交换 x/y（不做翻转）
 * @returns {{x:number, y:number}} 设备坐标系下的 x, y
 */
const getCurLocationForAdb = () => {
  let x;
  let y;
  let _x;
  let _y;
  const canvas = touchWrapper;
  const rect = canvas.getBoundingClientRect();
  if (directionStatus.value != 0 && directionStatus.value != 180) {
    // 左右旋转
    _x = parseInt(
      (event.clientY - rect.top) * (imgWidth / canvas.clientHeight)
    );
    _y = parseInt(
      (event.clientX - rect.left) * (imgHeight / canvas.clientWidth)
    );
    x = _y;
    y = _x;
  } else {
    _x = parseInt(
      (event.clientX - rect.left) * (imgWidth / canvas.clientWidth)
    );
    x = directionStatus.value == 180 ? imgWidth - _x : _x;
    //
    _y = parseInt(
      (event.clientY - rect.top) * (imgHeight / canvas.clientHeight)
    );
    y = directionStatus.value == 180 ? imgHeight - _y : _y;
  }
  inputBoxStyle.value = {
    left: `${event.clientX - rect.left}px`,
    top: `${event.clientY - rect.top}px`,
  };
  return {
    x,
    y,
  };
};
/**
 * 鼠标抬起事件
 * - Minicap 模式：发送 touch up，并聚焦输入框
 * - ADB 模式：根据是否移动判断 tap / swipe，长按则跳过 tap
 */
const mouseup = (event) => {
  if (!isFixTouch) {
    if (isPress) {
      isPress = false;
      websocket.send(
        JSON.stringify({
          type: 'touch',
          detail: 'up\n',
        })
      );
      inputBox.value.focus();
    }
  } else {
    clearInterval(loop);
    time = 0;
    const { x, y } = getCurLocationForAdb();
    if (moveX === x && moveY === y) {
      if (!isLongPress) {
        websocket.send(
          JSON.stringify({
            type: 'debug',
            detail: 'tap',
            point: `${x},${y}`,
          })
        );
        inputBox.value.focus();
      }
    } else {
      websocket.send(
        JSON.stringify({
          type: 'debug',
          detail: 'swipe',
          pointA: `${moveX},${moveY}`,
          pointB: `${x},${y}`,
        })
      );
      inputBox.value.focus();
    }
    isLongPress = false;
  }
};
/** 鼠标离开屏幕区域：清除长按定时器 / 发送 touch up */
const mouseleave = () => {
  if (isFixTouch) {
    clearInterval(loop);
    isLongPress = false;
  } else if (isPress) {
    isPress = false;
    websocket.send(
      JSON.stringify({
        type: 'touch',
        detail: 'up\n',
      })
    );
  }
};
/**
 * 鼠标按下事件
 * - Minicap 模式：发送 touch down + 坐标
 * - ADB 模式：记录起点并启动 500ms 定时器，超过 1s 触发 longPress
 */
const mousedown = (event) => {
  if (!isFixTouch) {
    // 安卓高版本
    const { x, y } = getCurLocation();
    isPress = true;
    websocket.send(
      JSON.stringify({
        type: 'touch',
        detail: `down ${x} ${y}\n`,
      })
    );
  } else {
    const { x, y } = getCurLocationForAdb();
    moveX = x;
    moveY = y;
    clearInterval(loop);
    loop = setInterval(() => {
      time += 500;
      if (time >= 1000 && isLongPress === false) {
        websocket.send(
          JSON.stringify({
            type: 'debug',
            detail: 'longPress',
            point: `${moveX},${moveY}`,
          })
        );
        isLongPress = true;
      }
    }, 500);
  }
};
/** 鼠标移动事件（Minicap 模式）：节流后发送 touch move + 坐标 */
const mousemove = (event) => {
  if (!isFixTouch) {
    if (isPress) {
      if (mouseMoveTime < 1) {
        mouseMoveTime++;
      } else {
        const { x, y } = getCurLocation();
        websocket.send(
          JSON.stringify({
            type: 'touch',
            detail: `move ${x} ${y}\n`,
          })
        );
        mouseMoveTime = 0;
      }
    }
  }
};
/**
 * 元素调试大图上的触摸事件：根据点击坐标查找命中的元素节点
 * 并在元素树中选中该节点（最小面积优先，相同面积优先选有 text 的）
 */
const touchstart = async (event) => {
  const debugPic = document.getElementById('debugPic');
  const rect = debugPic.getBoundingClientRect();
  let x;
  let y;
  if (directionStatus.value === 0 || directionStatus.value === 180) {
    x = parseInt(
      (event.clientX - rect.left) * (imgWidth / debugPic.clientWidth)
    );
    y = parseInt(
      (event.clientY - rect.top) * (imgHeight / debugPic.clientHeight)
    );
  } else {
    x = parseInt(
      (event.clientX - rect.left) * (imgHeight / debugPic.clientWidth)
    );
    y = parseInt(
      (event.clientY - rect.top) * (imgWidth / debugPic.clientHeight)
    );
  }
  await nextTick(() => {
    tree.value.setCurrentKey(
      findMinSize(findElementByPoint(elementData.value, x, y))
    );
  });
  await handleNodeClick(tree.value.getCurrentNode());
};
/**
 * 从命中的元素列表中找出面积最小的节点（最精确的命中）
 * 面积相同时优先选择有 text 属性的节点
 * @param {Array} data - findElementByPoint 返回的命中列表
 * @returns {number|null} 选中节点的 id
 */
const findMinSize = (data) => {
  if (data.length === 0) {
    return null;
  }
  let result = data[0];
  for (const i in data) {
    if (data[i].size === result.size) {
      if (data[i].ele.detail.text.length !== 0) {
        result = data[i];
      }
    }
    if (data[i].size < result.size) {
      result = data[i];
    }
  }
  currentId.value = [result.ele.id];
  return result.ele.id;
};
/**
 * 递归查找坐标 (x,y) 命中的所有元素节点
 * 通过 bStart/bEnd 边界框判断命中，递归遍历 children
 * @param {Array} ele - 元素树（子树）
 * @param {number} x - 设备坐标 x
 * @param {number} y - 设备坐标 y
 * @returns {Array} 命中元素列表（含 ele 和 size）
 */
const findElementByPoint = (ele, x, y) => {
  const result = [];
  for (const i in ele) {
    const eleStartX = ele[i].detail.bStart.substring(
      0,
      ele[i].detail.bStart.indexOf(',')
    );
    const eleStartY = ele[i].detail.bStart.substring(
      ele[i].detail.bStart.indexOf(',') + 1
    );
    const eleEndX = ele[i].detail.bEnd.substring(
      0,
      ele[i].detail.bEnd.indexOf(',')
    );
    const eleEndY = ele[i].detail.bEnd.substring(
      ele[i].detail.bEnd.indexOf(',') + 1
    );
    if (x >= eleStartX && x <= eleEndX && y >= eleStartY && y <= eleEndY) {
      result.push({
        ele: ele[i],
        size: (eleEndY - eleStartY) * (eleEndX - eleStartX),
      });
    }
    if (ele[i].children) {
      const childrenResult = findElementByPoint(ele[i].children, x, y);
      if (childrenResult.length > 0) {
        result.push.apply(result, childrenResult);
      }
    }
  }
  return result;
};
/** 元素树节点点击：更新 elementDetail 并在画布上高亮绘制 */
const handleNodeClick = (data) => {
  if (data !== null) {
    elementDetail.value = data.detail;
    print(data);
  }
};
/**
 * 在元素调试画布上绘制元素高亮框
 * 使用随机颜色半透明填充，根据旋转方向调整坐标映射
 * @param {Object} data - 选中的元素节点
 */
const print = (data) => {
  const canvas = document.getElementById('debugPic');
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const eleStartX = data.detail.bStart.substring(
    0,
    data.detail.bStart.indexOf(',')
  );
  const eleStartY = data.detail.bStart.substring(
    data.detail.bStart.indexOf(',') + 1
  );
  const eleEndX = data.detail.bEnd.substring(0, data.detail.bEnd.indexOf(','));
  const eleEndY = data.detail.bEnd.substring(data.detail.bEnd.indexOf(',') + 1);
  const a = Math.round(Math.random() * 255);
  const b = Math.round(Math.random() * 255);
  const c = Math.round(Math.random() * 255);
  g.fillStyle = `rgba(${a}, ${b}, ${c}, 0.6)`;
  if (directionStatus.value === 0 || directionStatus.value === 180) {
    g.fillRect(
      eleStartX * (canvas.width / imgWidth),
      eleStartY * (canvas.height / imgHeight),
      (eleEndX - eleStartX) * (canvas.width / imgWidth),
      (eleEndY - eleStartY) * (canvas.height / imgHeight)
    );
  } else {
    g.fillRect(
      eleStartX * (canvas.width / imgHeight),
      eleStartY * (canvas.height / imgWidth),
      (eleEndX - eleStartX) * (canvas.width / imgHeight),
      (eleEndY - eleStartY) * (canvas.height / imgWidth)
    );
  }
};
// ======================== 设备控制指令（通过主控制通道下发） ========================
/** 查找设备（点亮/唤醒屏幕） */
const searchDevice = () => {
  websocket.send(
    JSON.stringify({
      type: 'find',
    })
  );
};
/** 启动 HTTP 代理抓包 */
const startProxy = () => {
  websocket.send(
    JSON.stringify({
      type: 'proxy',
    })
  );
};
/** 向设备安装代理证书 */
const installCert = () => {
  websocket.send(
    JSON.stringify({
      type: 'installCert',
    })
  );
};
/** 通过包名打开应用 */
const openApp = (pkg) => {
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'openApp',
      pkg,
    })
  );
};
/** 通过包名强制停止应用 */
const killApp = (pkg) => {
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'killApp',
      pkg,
    })
  );
  ElMessage.success({
    message: $t('androidRemoteTS.code.killMsg'),
  });
};
/** 刷新应用列表：清空后通过终端通道请求 appList（增量回传） */
const refreshAppList = () => {
  appList.value = [];
  ElMessage.success({
    message: $t('androidRemoteTS.loadIng'),
  });
  terminalWebsocket.send(
    JSON.stringify({
      type: 'appList',
    })
  );
};
/** 清除代理设置 */
const clearProxy = () => {
  ElMessage.success({
    message: $t('androidRemoteTS.messageTwo'),
  });
  websocket.send(
    JSON.stringify({
      type: 'clearProxy',
    })
  );
};
/** 卸载应用 */
const uninstallApp = (pkg) => {
  ElMessage.success({
    message: $t('androidRemoteTS.startUninstall'),
  });
  websocket.send(
    JSON.stringify({
      type: 'uninstallApp',
      detail: pkg,
    })
  );
};
/** 获取指定 XPath 元素的截图（结果由 eleScreen 消息回传） */
const getEleScreen = (xpath) => {
  elementScreenLoading.value = true;
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'eleScreen',
      xpath,
    })
  );
};
/** 清空步骤日志 */
const clearLog = () => {
  stepLog.value = [];
};
/** 追加一条步骤日志 */
const setStepLog = (data) => {
  stepLog.value.push(data);
};
/** 远程运行关联的测试用例（切换到 log Tab 并下发 runStep） */
const runStep = () => {
  debugLoading.value = true;
  activeTab2.value = 'log';
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'runStep',
      caseId: testCase.value.id,
      pwd: device.value.password,
    })
  );
};
/** 校验元素定位（下发 checkLocation，结果由 status 消息回传） */
const checkLocation = (data) => {
  checkElementLoading.value = true;
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'checkLocation',
      element: data.eleValue,
      eleType: data.eleType,
      pwd: device.value.password,
    })
  );
};
/** 停止正在运行的测试用例 */
const stopStep = () => {
  debugLoading.value = false;
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'stopStep',
      udId: device.value.udId,
      caseId: testCase.value.id,
      pf: device.value.platform,
    })
  );
};
/** 发送按键事件（如 HOME、BACK、电源等） */
const pressKey = (keyNum) => {
  websocket.send(
    JSON.stringify({
      type: 'keyEvent',
      detail: keyNum,
    })
  );
};
/** 模拟断开电池（断电测试） */
const batteryDisconnect = () => {
  websocket.send(
    JSON.stringify({
      type: 'battery',
      detail: 0,
    })
  );
};
/** 恢复电池连接 */
const batteryReset = () => {
  websocket.send(
    JSON.stringify({
      type: 'battery',
      detail: 1,
    })
  );
};
/**
 * 切换屏幕画质（高/中/低/固定），通过屏幕通道下发 pic 指令
 * @param {string} type - 画质名称（i18n key 或 'fixed'）
 */
const changePic = (type) => {
  loading.value = true;
  let pic;
  switch (type) {
    case $t('androidRemoteTS.low'):
      pic = 'low';
      break;
    case $t('androidRemoteTS.middle'):
      pic = 'middle';
      break;
    case $t('androidRemoteTS.high'):
      pic = 'high';
      break;
    case 'fixed':
      pic = 'fixed';
      break;
  }
  screenWebsocket.send(
    JSON.stringify({
      type: 'pic',
      detail: pic,
    })
  );
};
/**
 * 切换屏幕投射模式（Scrcpy ↔ Minicap）
 * 调用 Scrcpy 实例的 switchMode，更新 touchWrapper 目标 DOM，并持久化到 localStorage
 * @param {string} type - 'Scrcpy' 或 'Minicap'
 * @param {number} [isInit] - 1 表示初始化调用（不切换模式）
 */
const changeScreenMode = (type, isInit) => {
  if (isInit !== 1) {
    loading.value = true;
    __Scrcpy.switchMode(type);
    screenMode.value = type;
    oldBlob = undefined;
  }
  if (type === 'Minicap') {
    touchWrapper = document.getElementById('canvas');
  } else {
    oldBlob = undefined; // 清除记录
    touchWrapper = document.getElementById('scrcpy-video');
  }
  // 储存最后模式
  window.localStorage.setItem('screenMode', type);
};
// ======================== 文件推送 / 拉取 ========================
const pullPath = ref('');           // 要拉取的设备端路径
const pullLoading = ref(false);     // 拉取中
const pullResult = ref('');         // 拉取结果 URL
/** 从设备拉取文件到服务器（结果由 pullResult 消息回传） */
const pullFile = () => {
  pullResult.value = '';
  pullLoading.value = true;
  websocket.send(
    JSON.stringify({
      type: 'pullFile',
      path: pullPath.value,
    })
  );
};
const fileLoading = ref(false);      // 文件上传中
const upLoadFilePath = ref('');     // 已上传文件的服务器路径
const pushPath = ref('');           // 要推送到的设备端路径
const pushLoading = ref(false);     // 推送中
/** 将已上传的文件推送到设备指定路径 */
const pushFile = () => {
  pushLoading.value = true;
  websocket.send(
    JSON.stringify({
      type: 'pushFile',
      file: upLoadFilePath.value,
      path: pushPath.value,
    })
  );
};
/** 上传文件到服务器（用于推送文件的准备步骤） */
const uploadFile = (content) => {
  fileLoading.value = true;
  const formData = new FormData();
  formData.append('file', content.file);
  formData.append('type', 'packageFiles');
  axios
    .post('/folder/upload', formData, {
      headers: { 'Content-type': 'multipart/form-data' },
    })
    .then((resp) => {
      fileLoading.value = false;
      if (resp.code === 2000) {
        upLoadFilePath.value = resp.data;
      }
    });
};
/** 上传前校验：仅允许 jpg/png 图片 */
const beforeAvatarUpload = (file) => {
  if (file.name.endsWith('.jpg') || file.name.endsWith('.png')) {
    return true;
  }
  ElMessage.error({
    message: $t('androidRemoteTS.failErr'),
  });
  return false;
};
/** 上传前校验：仅允许 apk 安装包 */
const beforeAvatarUpload2 = (file) => {
  if (file.name.endsWith('.apk')) {
    return true;
  }
  ElMessage.error({
    message: $t('androidRemoteTS.failErr'),
  });
  return false;
};
/** 超出上传数量限制时的提示 */
const limitOut = () => {
  ElMessage.error({
    message: $t('androidRemoteTS.addOne'),
  });
};
/** 上传 apk 安装包并自动安装 */
const uploadPackage = (content) => {
  uploadLoading.value = true;
  const formData = new FormData();
  formData.append('file', content.file);
  formData.append('type', 'packageFiles');
  axios
    .post('/folder/upload', formData, {
      headers: { 'Content-type': 'multipart/form-data' },
    })
    .then((resp) => {
      uploadLoading.value = false;
      if (resp.code === 2000) {
        install(resp.data);
      }
    });
};
/** 上传图片用于扫码识别 */
const uploadScan = (content) => {
  const formData = new FormData();
  formData.append('file', content.file);
  formData.append('type', 'imageFiles');
  axios
    .post('/folder/upload', formData, {
      headers: { 'Content-type': 'multipart/form-data' },
    })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
        scan(resp.data);
      }
    });
};
/** 发送扫码指令（设备端识别图片中的二维码） */
const scan = (url) => {
  websocket.send(
    JSON.stringify({
      type: 'scan',
      url,
    })
  );
};
/** 发送清除文本指令（CODE_AC_CLEAN） */
const sendText = () => {
  websocket.send(
    JSON.stringify({
      type: 'text',
      detail: 'CODE_AC_CLEAN',
    })
  );
};
/** 启动虚拟键盘 */
const startKeyboard = () => {
  websocket.send(
    JSON.stringify({
      type: 'startKeyboard',
    })
  );
};
/** 停止虚拟键盘 */
const stopKeyboard = () => {
  websocket.send(
    JSON.stringify({
      type: 'stopKeyboard',
    })
  );
};
/** 安装 apk（通过 debug 通道下发 install 指令） */
const install = (apk) => {
  if (apk.length > 0) {
    websocket.send(
      JSON.stringify({
        type: 'debug',
        detail: 'install',
        apk,
      })
    );
    ElMessage.success({
      message: $t('androidRemoteTS.startInstall'),
    });
  }
};
/** 获取元素树：先截图设置调试大图，再下发 tree 指令（含多窗口/忽略/可见选项） */
const getElement = () => {
  elementLoading.value = true;
  setImgData();
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'tree',
      isMulti: isMultiWindows.value,
      isIgnore: isIgnore.value,
      isVisible: isVisible.value,
    })
  );
};
/** 获取 Poco 游戏 UI 树（指定引擎和端口） */
const getPoco = (engine, port) => {
  pocoLoading.value = true;
  websocket.send(
    JSON.stringify({
      type: 'debug',
      detail: 'poco',
      engine,
      port,
    })
  );
};
/** 获取 WebView 调试端口转发列表 */
const getWebViewForward = () => {
  webViewLoading.value = true;
  websocket.send(
    JSON.stringify({
      type: 'forwardView',
    })
  );
};
/**
 * 关闭所有 WebSocket 连接并释放资源
 * 依次关闭：主控制、屏幕（含 Scrcpy 实例）、终端、音频，最后关闭窗口
 */
const close = () => {
  if (websocket !== null) {
    websocket.close();
    websocket = null;
  }
  if (screenWebsocket !== null) {
    screenWebsocket.close();
    screenWebsocket = null;
    __Scrcpy && __Scrcpy.destroy();
    __Scrcpy = null;
  }
  if (terminalWebsocket !== null) {
    terminalWebsocket.close();
    terminalWebsocket = null;
  }
  if (audioPlayer !== null) {
    destroyAudio();
  }
  window.close();
};
/** 组件卸载前：关闭所有连接 */
onBeforeUnmount(() => {
  close();
});
/**
 * 根据 id 获取设备信息，校验在线后获取 Agent 并建立 WebSocket 连接
 * 执行流程：GET /controller/devices → 校验 ONLINE → GET /controller/agents → openSocket
 * @param {number} id - 设备 id
 */
const getDeviceById = (id) => {
  loading.value = true;
  console.log(`getDeviceById ${id}`);
  axios.get('/controller/devices', { params: { id } }).then((resp) => {
    if (resp.code === 2000) {
      device.value = resp.data;
      if (device.value.status !== 'ONLINE') {
        ElMessage.error({
          message: $t('androidRemoteTS.deviceFail'),
        });
        router.replace('/Index/Devices');
        return;
      }
      axios
        .get('/controller/agents', { params: { id: device.value.agentId } })
        .then((resp) => {
          if (resp.code === 2000) {
            agent.value = resp.data;
            openSocket(
              agent.value.host,
              agent.value.port,
              agent.value.secretKey,
              device.value.udId
            );
          }
        });
    }
  });
};
/**
 * 实时音频模块
 * 通过 AudioProcessor 建立独立的音频 WebSocket，将设备音频流解码播放
 */
let audioPlayer = null;                 // AudioProcessor 实例
const isConnectAudio = ref(false);      // 音频是否已连接
/** 初始化音频播放器并绑定错误回调 */
const initAudioPlayer = () => {
  audioPlayer = new AudioProcessor({
    node: 'audio-player',
    wsUrl: `ws://${agent.value.host}:${agent.value.port}/websockets/audio/${agent.value.secretKey}/${device.value.udId}`,
    onReady() {
      isConnectAudio.value = true;
    },
  });
  audioPlayer.ws.onError(function () {
    destroyAudio();
  });
};
/** 播放音频：若已存在实例则提示，否则初始化并开始播放 */
const playAudio = () => {
  if (audioPlayer) {
    ElMessage.warning({
      message: $t('androidRemoteTS.remoteAudio'),
    });
    return;
  }
  initAudioPlayer();
  audioPlayer.onPlay();
  ElMessage.success({
    message: $t('androidRemoteTS.audio'),
  });
};
/** 销毁音频播放器并提示断开 */
const destroyAudio = () => {
  audioPlayer.onDestroy();
  audioPlayer = null;
  isConnectAudio.value = false;
  ElMessage.info({
    message: $t('androidRemoteTS.audioFail'),
  });
};
/** 重置音频播放器（重置 jmuxer 后重新播放） */
const resetAudioPlayer = () => {
  audioPlayer.jmuxer.reset();
  audioPlayer.onPlay();
  ElMessage.success({
    message: $t('androidRemoteTS.audioSuccess'),
  });
};
/** 获取项目列表并写入 Vuex */
const getProjectList = () => {
  axios.get('/controller/projects/list').then((resp) => {
    store.commit('saveProjectList', resp.data);
  });
};
// ======================== 空闲检测 / 超时管理 ========================
let activeTime = 0;                  // 最近一次活动时间戳
const idleCount = ref(0);            // 空闲计数（每秒 +1，有操作时归零）
/**
 * 组件挂载：初始化入口
 * 1. 获取项目信息（store 或接口）
 * 2. 根据 deviceId 获取设备 → Agent → 建立 WebSocket
 * 3. 折叠侧边栏
 * 4. 读取远程/空闲超时配置
 * 5. 绑定全局 mouse 事件更新活动时间
 * 6. 启动 checkAlive 定时器
 */
onMounted(() => {
  console.log('mounted');
  if (store.state.project.id) {
    project.value = store.state.project;
  } else {
    getProjectList();
  }
  getDeviceById(route.params.deviceId);
  store.commit('autoChangeCollapse');
  getRemoteTimeout();
  getIdleTimeout();
  activeTime = new Date().getTime();
  window.document.onmousedown = (event) => {
    idleCount.value = 0;
    activeTime = new Date().getTime();
  };
  window.document.onmousemove = (event) => {
    idleCount.value = 0;
    activeTime = new Date().getTime();
  };
  checkAlive();
});
// 远程连接最大时长（秒），到时自动断开
const remoteTimeout = ref(0);
// 计时器：每秒 +1，用于驱动顶部倒计时显示
const ticker = ref(0);
/** 获取远程超时配置并启动每秒计时器 */
const getRemoteTimeout = () => {
  axios.get('/controller/confList/getRemoteTimeout').then((resp) => {
    remoteTimeout.value = resp.data;
    setInterval(() => {
      ticker.value += 1;
    }, 1000);
  });
};
// 空闲超时（分钟），无操作超过此时长则自动断开
const idleTimeout = ref(0);
/** 获取空闲超时配置 */
const getIdleTimeout = () => {
  axios.get('/controller/confList/getIdleTimeout').then((resp) => {
    idleTimeout.value = resp.data;
  });
};

/** 空闲检测定时器：每秒累加空闲计数，超过阈值则调用 close() 断开 */
const checkAlive = () => {
  setInterval(() => {
    idleCount.value++;
    const nowTime = new Date().getTime();
    if (nowTime - activeTime > idleTimeout.value * 60 * 1000) {
      close();
    }
  }, 1000);
};
</script>

<template>
  <!--
    模板整体结构：
    1. 元素截图保存对话框（dialogImgElement）
    2. 添加元素对话框（dialogElement）
    3. 远程页面头部（RemotePageHeader：超时倒计时、关闭按钮）
    4. 左侧：设备屏幕投射区（el-card）
         - 设备信息、屏幕画面（Scrcpy video / Minicap canvas）
         - 工具栏：电源/音量/主页/返回等按键、画质切换、截图、触控修复
    5. 右侧：功能 Tab 面板（el-tabs）
         - main    远程 ADB / 文件推送拉取
         - apps    应用管理（推送安装 / URL 安装 / 关联安装）
         - proxy   代理抓包（WiFi 列表 / 证书安装 / iframe 调试）
         - terminal 终端（Shell 命令 / Logcat 日志）
         - debug   测试用例调试（步骤列表 / 步骤日志）
         - ele     元素检查（原生控件树 / Poco 树）
         - webview WebView 调试（列表 / iframe）
         - perfmon 性能监控
  -->
  <el-dialog
    v-model="dialogImgElement"
    :title="$t('androidRemoteTS.code.elementsSnapshot')"
    width="28%"
  >
    <el-card>
      <el-image
        z-index="5000"
        fit="contain"
        style="width: 100%; height: 100px"
        :src="imgElementUrl"
        :preview-src-list="[imgElementUrl]"
      ></el-image>
    </el-card>
    <el-form
      ref="updateImgEle"
      :model="element"
      size="small"
      style="margin-top: 20px"
    >
      <el-form-item
        prop="eleName"
        :label="$t('androidRemoteTS.code.eleName')"
        :rules="{
          required: true,
          message: $t('androidRemoteTS.code.eleNullName'),
          trigger: 'blur',
        }"
      >
        <el-input
          v-model="element.eleName"
          :placeholder="$t('androidRemoteTS.code.inputName')"
        ></el-input>
      </el-form-item>
      <div style="text-align: center">
        <el-button size="small" type="primary" @click="saveEle"
          >{{ $t('androidRemoteTS.code.saveEle') }}
        </el-button>
      </div>
    </el-form>
  </el-dialog>
  <el-dialog
    v-model="dialogElement"
    :title="$t('elements.eleInfo')"
    width="600px"
  >
    <element-update
      v-if="dialogElement"
      :project-id="project['id']"
      :element-id="0"
      :element-obj="element"
      :is-remote-page="true"
      :check-loading="checkElementLoading"
      @flush="dialogElement = false"
      @check-location="checkLocation"
    />
  </el-dialog>
  <remote-page-header
    :ticker="ticker"
    :idle-count="idleCount"
    :remote-timeout="remoteTimeout"
    :idle-timeout="idleTimeout"
    @close="close"
  />
  <div style="padding: 20px">
    <!-- 主布局行：支持左右分栏拖拽（lineMouse* 事件由父级传入） -->
    <el-row
      :gutter="24"
      @mouseup="lineMouseup"
      @mouseleave="lineMouseleave"
      @mousemove="lineMousemove"
    >
      <!-- ============ 左侧：设备屏幕投射区 ============ -->
      <el-col
        :span="tabPosition == 'left' ? 12 : 24"
        :style="{
          flexBasis: tabPosition == 'left' ? layoutSplitInfo.left + '%' : '',
          maxWidth: tabPosition == 'left' ? layoutSplitInfo.left + '%' : '',
          transition: !isSplitPressing ? 'flex-basis 0.3s,max-width 0.3s' : '',
        }"
      >
        <el-card
          v-loading="loading"
          :element-loading-text="$t('androidRemoteTS.code.preparingImager')"
          element-loading-background="rgba(255, 255, 255, 1)"
          style="font-size: 14px"
          :body-style="{
            padding: '10px',
            background: '#ccc',
            position: 'relative',
            minHeight: '340px',
          }"
        >
          <template #header>
            <div style="position: relative; display: flex; align-items: center">
              <el-icon :size="14" style="vertical-align: middle">
                <Cellphone />
              </el-icon>
              <RenderDeviceName
                style="color: #e6a23c; margin-left: 5px"
                :device="device"
              />
              <el-popover placement="bottom-end" width="270" trigger="hover">
                <el-form
                  label-position="left"
                  class="demo-table-expand"
                  label-width="90px"
                  style="margin-left: 10px; word-break: break-all"
                >
                  <el-form-item :label="$t('devices.detail.name')">
                    <span>{{ device.name }}</span>
                  </el-form-item>
                  <el-form-item :label="$t('devices.detail.model')">
                    <span>{{ device['model'] }}</span>
                  </el-form-item>
                  <el-form-item :label="$t('devices.detail.udId')">
                    <span>{{ device['udId'] }}</span>
                  </el-form-item>
                  <el-form-item :label="$t('devices.form.system')">
                    <img
                      height="25"
                      style="
                        position: absolute;
                        top: 7px;
                        bottom: 7px;
                        left: 7px;
                      "
                      :src="
                        getImg(device['isHm'] === 1 ? 'HarmonyOs' : 'ANDROID')
                      "
                    />
                  </el-form-item>
                  <el-form-item
                    :label="$t('androidRemoteTS.code.systemVersion')"
                  >
                    <span>{{ device['version'] }}</span>
                  </el-form-item>
                  <el-form-item :label="$t('devices.detail.size')">
                    <span>{{ device['size'] }}</span>
                  </el-form-item>
                  <el-form-item :label="$t('devices.detail.cpu')">
                    <span>{{ device['cpu'] }}</span>
                  </el-form-item>
                  <el-form-item :label="$t('devices.filter.manufacturer')">
                    <img
                      height="25"
                      style="
                        position: absolute;
                        top: 7px;
                        bottom: 7px;
                        left: 7px;
                      "
                      :src="getImg(device['manufacturer'])"
                    />
                  </el-form-item>
                </el-form>
                <template #reference>
                  <div style="position: absolute; right: 0px; color: #909399">
                    <el-icon :size="15" style="vertical-align: middle">
                      <InfoFilled />
                    </el-icon>
                  </div>
                </template>
              </el-popover>
            </div>
          </template>
          <div style="margin-right: 40px; text-align: center">
            <div>
              <!-- 远程文本输入框：浮动定位在触摸点，input/delete/enter 事件转发到设备 -->
              <input
                ref="inputBox"
                v-model="inputValue"
                class="input-box"
                type="text"
                :style="inputBoxStyle"
                @input="changeInputHandle"
                @keyup.delete="deleteInputHandle"
                @keyup.enter="enterInputHandle"
              />
              <!-- Scrcpy 模式：H.264 视频流渲染（由 Scrcpy 实例解码） -->
              <video
                v-show="screenMode == 'Scrcpy'"
                id="scrcpy-video"
                style="display: inline-block; min-height: 100%"
                :style="canvasRectInfo"
                autoplay
                muted
                @mouseup="mouseup"
                @mousemove="mousemove"
                @mousedown="mousedown"
                @mouseleave="mouseleave"
              />
              <!-- Minicap 模式：JPEG 帧逐帧绘制到 canvas -->
              <canvas
                v-show="screenMode != 'Scrcpy'"
                id="canvas"
                style="display: inline-block"
                :style="canvasRectInfo"
                @mouseup="mouseup"
                @mousemove="mousemove"
                @mousedown="mousedown"
                @mouseleave="mouseleave"
              />
              <audio id="audio-player" hidden></audio>
            </div>
            <!-- 按键工具栏：菜单(82) / 最近任务(187) / Home(3) / 返回(4) 等系统按键 -->
            <el-button-group id="pressKey">
              <el-button
                size="small"
                style="width: 25%"
                type="info"
                @click="pressKey(82)"
              >
                <el-icon :size="13" style="vertical-align: middle">
                  <Menu />
                </el-icon>
              </el-button>
              <el-button
                size="small"
                style="width: 25%"
                type="info"
                @click="pressKey(187)"
              >
                <el-icon :size="13" style="vertical-align: middle">
                  <CopyDocument />
                </el-icon>
              </el-button>
              <el-button
                size="small"
                style="width: 25%"
                type="info"
                @click="pressKey(3)"
              >
                <el-icon :size="13" style="vertical-align: middle">
                  <House />
                </el-icon>
              </el-button>
              <el-button
                size="small"
                style="width: 25%"
                type="info"
                @click="pressKey(4)"
              >
                <el-icon :size="13" style="vertical-align: middle">
                  <Back />
                </el-icon>
              </el-button>
            </el-button-group>
          </div>
          <div style="position: absolute; right: 5px; top: 10px">
            <el-tooltip
              :enterable="false"
              effect="dark"
              :content="$t('androidRemoteTS.code.projectionMode')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
              :offset="15"
            >
              <div>
                <el-dropdown
                  :hide-on-click="false"
                  trigger="click"
                  placement="right"
                  style="margin-top: 4px"
                >
                  <el-button size="small" type="info" circle>
                    <el-icon :size="12" style="vertical-align: middle">
                      <VideoCamera />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu class="divider">
                      <el-radio-group
                        v-model="screenMode"
                        v-loading="loading"
                        size="mini"
                        @change="changeScreenMode"
                      >
                        <el-radio-button label="Scrcpy"></el-radio-button>
                        <el-radio-button label="Minicap"></el-radio-button>
                      </el-radio-group>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-tooltip>
            <el-tooltip
              :enterable="false"
              effect="dark"
              :content="$t('androidRemoteTS.code.frameNumber')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
              :offset="15"
            >
              <div>
                <el-dropdown
                  :hide-on-click="false"
                  trigger="click"
                  placement="right"
                  style="margin-top: 4px"
                >
                  <el-button size="small" type="info" circle>
                    <el-icon :size="12" style="vertical-align: middle">
                      <View />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu class="divider">
                      <el-radio-group
                        v-model="pic"
                        v-loading="loading"
                        size="mini"
                        @change="changePic"
                      >
                        <el-radio-button
                          :label="$t('androidRemoteTS.low')"
                        ></el-radio-button>
                        <el-radio-button
                          :label="$t('androidRemoteTS.middle')"
                        ></el-radio-button>
                        <el-radio-button
                          :label="$t('androidRemoteTS.high')"
                        ></el-radio-button>
                      </el-radio-group>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-tooltip>
            <el-tooltip
              :enterable="false"
              effect="dark"
              :content="$t('androidRemoteTS.code.manualRepair')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
              :offset="15"
            >
              <div>
                <el-dropdown
                  :hide-on-click="false"
                  trigger="click"
                  placement="right"
                  style="margin-top: 4px"
                >
                  <el-button size="small" type="info" circle>
                    <el-icon :size="12" style="vertical-align: middle">
                      <Place />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu
                      v-loading="loading"
                      class="divider"
                      element-loading-background="rgba(255, 255, 255, 1)"
                    >
                      <el-button-group>
                        <el-tooltip
                          effect="dark"
                          :content="$t('androidRemoteTS.code.fixBlackScreen')"
                          placement="top"
                        >
                          <el-button
                            size="small"
                            type="info"
                            circle
                            :disabled="screenMode !== 'Minicap'"
                            @click="changePic('fixed')"
                          >
                            <el-icon :size="14" style="vertical-align: middle">
                              <Cellphone />
                            </el-icon>
                          </el-button>
                        </el-tooltip>
                        <el-tooltip
                          effect="dark"
                          :content="$t('androidRemoteTS.code.fixTouch')"
                          placement="top"
                        >
                          <el-button
                            size="small"
                            type="info"
                            circle
                            @click="fixTouch"
                          >
                            <el-icon :size="14" style="vertical-align: middle">
                              <Pointer />
                            </el-icon>
                          </el-button>
                        </el-tooltip>
                        <el-tooltip
                          effect="dark"
                          :content="$t('androidRemoteTS.code.fixScreen')"
                          placement="top"
                        >
                          <el-button
                            size="small"
                            type="info"
                            circle
                            @click="fixOri"
                          >
                            <el-icon :size="14" style="vertical-align: middle">
                              <Postcard />
                            </el-icon>
                          </el-button>
                        </el-tooltip>
                      </el-button-group>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-tooltip>
            <el-tooltip
              :enterable="false"
              effect="dark"
              :content="$t('androidRemoteTS.code.remoteAudioTran')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
              :offset="15"
            >
              <div>
                <el-dropdown
                  :hide-on-click="false"
                  trigger="click"
                  placement="right"
                  style="margin-top: 4px"
                >
                  <el-button size="small" type="info" circle>
                    <el-icon :size="12" style="vertical-align: middle">
                      <Service />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu class="divider">
                      <el-button-group>
                        <el-button
                          size="small"
                          type="success"
                          circle
                          :disabled="isConnectAudio"
                          @click="playAudio"
                        >
                          <el-icon :size="14" style="vertical-align: middle">
                            <Bell />
                          </el-icon>
                        </el-button>
                        <el-button
                          size="small"
                          type="danger"
                          circle
                          :disabled="!isConnectAudio"
                          @click="destroyAudio"
                        >
                          <el-icon :size="14" style="vertical-align: middle">
                            <MuteNotification />
                          </el-icon>
                        </el-button>
                        <!-- <el-button
                            size="small"
                            type="info"
                            @click="resetAudioPlayer"
                        >
                          <el-icon :size="12" style="vertical-align: middle;">
                            <Refresh/>
                          </el-icon>
                        </el-button> -->
                      </el-button-group>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-tooltip>
            <el-tooltip
              :enterable="false"
              effect="dark"
              :content="$t('androidRemoteTS.code.batterySimulation')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
              :offset="15"
            >
              <div>
                <el-dropdown
                  :hide-on-click="false"
                  trigger="click"
                  placement="right"
                  style="margin-top: 4px"
                >
                  <el-button size="small" type="info" circle>
                    <el-icon :size="12" style="vertical-align: middle">
                      <Connection />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu class="divider">
                      <el-button-group>
                        <el-tooltip
                          effect="dark"
                          :content="
                            $t('androidRemoteTS.code.simulatePowerOutage')
                          "
                          placement="top"
                        >
                          <el-button
                            size="small"
                            type="info"
                            circle
                            @click="batteryDisconnect"
                          >
                            <el-icon :size="14" style="vertical-align: middle">
                              <VideoPause />
                            </el-icon>
                          </el-button>
                        </el-tooltip>
                        <el-tooltip
                          effect="dark"
                          :content="$t('androidRemoteTS.code.reset')"
                          placement="top"
                        >
                          <el-button
                            size="small"
                            type="info"
                            circle
                            @click="batteryReset"
                          >
                            <el-icon :size="14" style="vertical-align: middle">
                              <Refresh />
                            </el-icon>
                          </el-button>
                        </el-tooltip>
                      </el-button-group>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-tooltip>
            <el-tooltip
              effect="dark"
              :content="$t('androidRemoteTS.code.physicalLookup')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
            >
              <div style="margin-top: 4px">
                <el-button
                  size="small"
                  type="info"
                  circle
                  @click="searchDevice"
                >
                  <el-icon :size="12" style="vertical-align: middle">
                    <Search />
                  </el-icon>
                </el-button>
              </div>
            </el-tooltip>
            <el-tooltip
              :enterable="false"
              effect="dark"
              :content="$t('androidRemoteTS.code.BV')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
              :offset="15"
            >
              <div>
                <el-dropdown
                  :hide-on-click="false"
                  trigger="click"
                  placement="right"
                  style="margin-top: 4px"
                >
                  <el-button size="small" type="primary" circle>
                    <el-icon :size="12" style="vertical-align: middle">
                      <Operation />
                    </el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu class="divider">
                      <div style="text-align: center">
                        <el-icon
                          :size="14"
                          style="color: #909399; vertical-align: middle"
                        >
                          <Sunny />
                        </el-icon>
                        <el-divider direction="vertical"></el-divider>
                        <el-button-group>
                          <el-button
                            size="small"
                            type="info"
                            circle
                            @click="pressKey(220)"
                          >
                            <el-icon :size="12" style="vertical-align: middle">
                              <CaretLeft />
                            </el-icon>
                          </el-button>
                          <el-button
                            size="small"
                            type="info"
                            circle
                            @click="pressKey(221)"
                          >
                            <el-icon :size="12" style="vertical-align: middle">
                              <CaretRight />
                            </el-icon>
                          </el-button>
                        </el-button-group>
                      </div>
                      <el-divider></el-divider>
                      <el-icon
                        :size="14"
                        style="color: #909399; vertical-align: middle"
                      >
                        <Phone />
                      </el-icon>
                      <el-divider direction="vertical"></el-divider>
                      <el-button-group>
                        <el-button
                          size="small"
                          type="info"
                          circle
                          @click="pressKey(24)"
                        >
                          <el-icon :size="12" style="vertical-align: middle">
                            <Plus />
                          </el-icon>
                        </el-button>
                        <el-button
                          size="small"
                          type="info"
                          circle
                          @click="pressKey(164)"
                        >
                          <el-icon :size="12" style="vertical-align: middle">
                            <MuteNotification />
                          </el-icon>
                        </el-button>
                        <el-button
                          size="small"
                          type="info"
                          circle
                          @click="pressKey(25)"
                        >
                          <el-icon :size="12" style="vertical-align: middle">
                            <Minus />
                          </el-icon>
                        </el-button>
                      </el-button-group>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </el-tooltip>
            <el-tooltip
              effect="dark"
              :content="$t('androidRemoteTS.code.dial')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
            >
              <div style="margin-top: 4px">
                <el-button
                  size="small"
                  type="primary"
                  circle
                  @click="pressKey(5)"
                >
                  <el-icon :size="12" style="vertical-align: middle">
                    <PhoneFilled />
                  </el-icon>
                </el-button>
              </div>
            </el-tooltip>
            <el-tooltip
              effect="dark"
              :content="$t('androidRemoteTS.code.photograph')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
            >
              <div style="margin-top: 4px">
                <el-button
                  size="small"
                  type="primary"
                  circle
                  @click="pressKey(27)"
                >
                  <el-icon :size="12" style="vertical-align: middle">
                    <Camera />
                  </el-icon>
                </el-button>
              </div>
            </el-tooltip>
            <el-tooltip
              effect="dark"
              :content="$t('androidRemoteTS.code.browser')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
            >
              <div style="margin-top: 4px">
                <el-button
                  size="small"
                  type="primary"
                  circle
                  @click="pressKey(64)"
                >
                  <el-icon :size="12" style="vertical-align: middle">
                    <Position />
                  </el-icon>
                </el-button>
              </div>
            </el-tooltip>
            <el-tooltip
              effect="dark"
              :content="$t('androidRemoteTS.code.LUS')"
              :placement="tabPosition == 'left' ? 'right' : 'left'"
            >
              <div style="margin-top: 4px">
                <el-button
                  size="small"
                  type="primary"
                  circle
                  @click="pressKey(26)"
                >
                  <el-icon :size="12" style="vertical-align: middle">
                    <SwitchButton />
                  </el-icon>
                </el-button>
              </div>
            </el-tooltip>
          </div>
        </el-card>
      </el-col>

      <div
        :class="{
          line: tabPosition == 'left',
          lineVertical: tabPosition == 'top',
        }"
        @mousedown="lineMousedown"
      />

      <el-col
        :span="tabPosition == 'left' ? 12 : 24"
        :style="{
          flexBasis:
            tabPosition == 'left'
              ? 100 - Number(layoutSplitInfo.left) + '%'
              : '',
          maxWidth:
            tabPosition == 'left'
              ? 100 - Number(layoutSplitInfo.left) + '%'
              : '',
        }"
      >
        <!-- ============ 右侧：功能 Tab 面板 ============ -->
        <el-tabs
          v-model="activeTab"
          stretch
          class="remote-tab"
          :tab-position="tabPosition"
          @tab-click="switchTabs"
        >
          <!-- ====== 主控面板 Tab：远程 ADB / 文件推送拉取 ====== -->
          <el-tab-pane
            :label="$t('androidRemoteTS.code.remoteControlPanel')"
            name="main"
          >
            <el-row :gutter="20">
              <el-col :span="8">
                <el-card>
                  <template #header>
                    <strong>{{ $t('androidRemoteTS.code.inputText') }}</strong>
                  </template>
                  <el-alert
                    :title="$t('androidRemoteTS.code.keyboard')"
                    type="info"
                    show-icon
                    :closable="false"
                  >
                  </el-alert>
                  <div style="text-align: center; margin-top: 12px">
                    <el-button size="mini" type="primary" @click="sendText"
                      >{{ $t('androidRemoteTS.code.clear') }}
                    </el-button>
                    <el-button size="mini" type="primary" @click="startKeyboard"
                      >{{ $t('androidRemoteTS.code.startKeyboard') }}
                    </el-button>
                    <el-button size="mini" type="primary" @click="stopKeyboard"
                      >{{ $t('androidRemoteTS.code.stopKeyboard') }}
                    </el-button>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="8">
                <el-tabs type="border-card" stretch>
                  <el-tab-pane :label="$t('androidRemoteTS.code.remoteADB')">
                    <div
                      v-loading="remoteAdbLoading"
                      style="margin-top: 18px; margin-bottom: 18px"
                    >
                      <div
                        v-if="remoteAdbUrl.length > 0"
                        style="margin-top: 20px; margin-bottom: 20px"
                      >
                        <el-card
                          :body-style="{
                            backgroundColor: '#303133',
                            cursor: 'pointer',
                          }"
                          @click="copy('adb connect ' + remoteAdbUrl)"
                        >
                          <strong style="color: #f2f6fc"
                            >adb connect {{ remoteAdbUrl }}</strong
                          >
                        </el-card>
                      </div>
                      <div v-else>
                        <el-card>
                          <strong>{{
                            $t('androidRemoteTS.code.noAgent')
                          }}</strong>
                        </el-card>
                      </div>
                    </div>
                  </el-tab-pane>
                </el-tabs>
              </el-col>
              <el-col :span="8">
                <el-card>
                  <template #header>
                    <strong>{{ $t('projectIndexTS.code.other') }}</strong>
                  </template>
                  <div style="text-align: center">
                    <div style="margin: 10px 0px">
                      <el-button
                        size="mini"
                        type="primary"
                        :disabled="isDriverFinish"
                        :loading="driverLoading"
                        @click="openDriver"
                        >{{ $t('androidRemoteTS.code.UIAutomator2ServerInit') }}
                      </el-button>
                      <el-button
                        size="mini"
                        type="danger"
                        :disabled="!isDriverFinish"
                        @click="closeDriver"
                        >{{ $t('androidRemoteTS.code.closeDriver') }}
                      </el-button>
                      <div style="margin-top: 8px">
                        Status:
                        <span
                          :style="
                            isDriverFinish ? 'color:#67C23A' : 'color:#606266'
                          "
                        >
                          {{ isDriverFinish ? 'Connected' : 'Diconnected' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="12" style="margin-top: 15px">
                <el-card>
                  <template #header>
                    <strong>{{ $t('IOSRemote.clipboard.operate') }}</strong>
                  </template>
                  <el-input
                    v-model="paste"
                    :rows="10"
                    show-word-limit
                    clearable
                    type="textarea"
                    :placeholder="$t('IOSRemote.clipboard.inputText')"
                  ></el-input>
                  <div style="text-align: center; margin-top: 15px">
                    <el-button
                      size="mini"
                      type="primary"
                      @click="setPasteboard(paste)"
                    >
                      {{ $t('IOSRemote.clipboard.send') }}
                    </el-button>
                    <el-button size="mini" type="primary" @click="getPasteboard"
                      >{{ $t('IOSRemote.clipboard.getText') }}
                    </el-button>
                  </div>
                </el-card>
              </el-col>
              <el-col :span="12" style="margin-top: 15px">
                <el-card>
                  <template #header>
                    <strong>{{
                      $t('androidRemoteTS.code.fileTransfer')
                    }}</strong>
                  </template>
                  <div style="text-align: center">
                    <el-tabs type="border-card" stretch>
                      <el-tab-pane :label="$t('androidRemoteTS.code.upFile')">
                        <el-upload
                          v-loading="fileLoading"
                          drag
                          action=""
                          :with-credentials="true"
                          :limit="1"
                          :on-exceed="limitOut"
                          :http-request="uploadFile"
                        >
                          <i class="el-icon-upload"></i>
                          <div class="el-upload__text">
                            {{ $t('androidRemoteTS.code.messageFive') }}
                            <em>{{ $t('devices.detail.uploadImg') }}</em>
                          </div>
                        </el-upload>
                        <div style="display: flex; margin-top: 5px">
                          <el-input
                            v-model="pushPath"
                            size="mini"
                            :placeholder="
                              $t('androidRemoteTS.code.pleaseFilePath')
                            "
                          ></el-input>
                          <el-button
                            style="margin-left: 5px"
                            size="mini"
                            type="primary"
                            :loading="pushLoading"
                            :disabled="
                              pushPath.length === 0 ||
                              upLoadFilePath.length === 0
                            "
                            @click="pushFile"
                            >Push
                          </el-button>
                        </div>
                      </el-tab-pane>
                      <el-tab-pane :label="$t('androidRemoteTS.code.filePath')">
                        <el-input
                          v-model="pullPath"
                          size="mini"
                          :placeholder="$t('androidRemoteTS.code.pullFilePath')"
                        ></el-input>
                        <el-button
                          style="margin-top: 5px"
                          size="mini"
                          type="primary"
                          :loading="pullLoading"
                          :disabled="pullPath.length === 0"
                          @click="pullFile"
                          >Pull
                        </el-button>
                        <a
                          v-if="pullResult.length !== 0"
                          :href="pullResult"
                          download
                          target="_blank"
                        >
                          <el-button
                            style="margin-top: 5px; margin-left: 10px"
                            size="mini"
                            type="success"
                          >
                            {{ $t('androidRemoteTS.code.installFile') }}
                          </el-button>
                        </a>
                      </el-tab-pane>
                      <el-tab-pane
                        :label="$t('androidRemoteTS.code.scanQRCode')"
                      >
                        <el-alert
                          :title="$t('androidRemoteTS.code.errTitle')"
                          type="info"
                          show-icon
                          :closable="false"
                        >
                        </el-alert>
                        <div style="text-align: center; margin-top: 10px">
                          <el-upload
                            drag
                            action=""
                            :with-credentials="true"
                            :limit="1"
                            :before-upload="beforeAvatarUpload"
                            :on-exceed="limitOut"
                            :http-request="uploadScan"
                            list-type="picture"
                          >
                            <i class="el-icon-upload"></i>
                            <div class="el-upload__text">
                              {{ $t('androidRemoteTS.code.messageThree') }}
                              <em>{{ $t('devices.detail.uploadImg') }}</em>
                            </div>
                            <template #tip>
                              <div class="el-upload__tip">
                                {{ $t('androidRemoteTS.code.messageFour') }}
                              </div>
                            </template>
                          </el-upload>
                        </div>
                      </el-tab-pane>
                    </el-tabs>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>
          <!-- ====== 应用管理 Tab：推送安装 / URL 安装 / 关联安装 ====== -->
          <el-tab-pane :label="$t('androidRemoteTS.code.app')" name="apps">
            <el-tabs v-model="activeIntallTab" type="border-card" stretch>
              <el-tab-pane name="pushInstallPane">
                <template #label>
                  <strong>{{ $t('androidRemoteTS.code.pushInstall') }}</strong>
                </template>
                <div style="text-align: center">
                  <el-upload
                    v-loading="uploadLoading"
                    drag
                    action=""
                    :with-credentials="true"
                    :limit="1"
                    :before-upload="beforeAvatarUpload2"
                    :on-exceed="limitOut"
                    :http-request="uploadPackage"
                  >
                    <i class="el-icon-upload"></i>
                    <div class="el-upload__text">
                      {{ $t('androidRemoteTS.code.apkFile') }}
                      <em>{{ $t('devices.detail.uploadImg') }}</em>
                    </div>
                    <template #tip>
                      <div class="el-upload__tip">
                        {{ $t('androidRemoteTS.code.onlyAPKFile') }}
                      </div>
                    </template>
                  </el-upload>
                </div>
              </el-tab-pane>
              <el-tab-pane name="urlInstallPane">
                <template #label>
                  <strong>{{ $t('androidRemoteTS.code.URLInstall') }}</strong>
                </template>
                <el-input
                  v-model="uploadUrl"
                  clearable
                  size="small"
                  :placeholder="$t('androidRemoteTS.code.hint')"
                ></el-input>
                <div style="text-align: center; margin-top: 20px">
                  <el-button
                    size="mini"
                    type="primary"
                    :disabled="uploadUrl.length === 0"
                    @click="install(uploadUrl)"
                    >{{ $t('androidRemoteTS.code.send') }}
                  </el-button>
                </div>
              </el-tab-pane>
              <el-tab-pane name="linkInstallPane">
                <template #label>
                  <strong>{{ $t('androidRemoteTS.code.linkInstall') }}</strong>
                </template>
                <span style="color: #909399; margin-right: 10px">{{
                  $t('androidRemoteTS.code.associatedProject')
                }}</span>
                <el-select
                  v-model="project"
                  size="mini"
                  value-key="id"
                  :placeholder="$t('androidRemoteTS.code.chooseProject')"
                >
                  <el-option
                    v-for="item in store.state.projectList"
                    :key="item.id"
                    :value="item"
                    :label="item['projectName']"
                  >
                    <div style="display: flex; align-items: center">
                      <el-avatar
                        style="margin-right: 10px"
                        :size="32"
                        :src="
                          item['projectImg'].length > 0
                            ? item['projectImg']
                            : defaultLogo
                        "
                        shape="square"
                      ></el-avatar>
                      {{ item['projectName'] }}
                    </div>
                  </el-option>
                </el-select>

                <div v-if="project !== null">
                  <package-list
                    v-if="project !== null"
                    :project-id="project['id']"
                    platform-type="Android"
                    @select-package="selectPackage"
                  ></package-list>
                </div>
                <div v-else>
                  <el-card style="height: 100%; margin-top: 20px">
                    <el-result
                      icon="info"
                      :title="$t('androidRemoteTS.code.hintText')"
                      :sub-title="
                        $t('androidRemoteTS.code.hintAssociatedProject')
                      "
                    >
                    </el-result>
                  </el-card>
                </div>
              </el-tab-pane>
            </el-tabs>
            <el-card shadow="hover" style="margin-top: 15px">
              <el-table :data="currAppListPageData" border>
                <el-table-column width="100" header-align="center">
                  <template #header>
                    <el-button size="mini" @click="refreshAppList"
                      >{{ $t('androidRemoteTS.code.refresh') }}
                    </el-button>
                  </template>
                  <template #default="scope">
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                      "
                    >
                      <el-avatar
                        shape="square"
                        :size="40"
                        :src="'data:image/png;base64,' + scope.row.appIcon"
                      ></el-avatar>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column
                  width="150"
                  show-overflow-tooltip
                  header-align="center"
                  prop="appName"
                  :label="$t('androidRemoteTS.code.appName')"
                >
                </el-table-column>
                <el-table-column
                  header-align="center"
                  show-overflow-tooltip
                  prop="packageName"
                  :label="$t('androidRemoteTS.code.packagesName')"
                >
                  <template #default="scope">
                    <div
                      style="cursor: pointer"
                      @click="copy(scope.row.packageName)"
                    >
                      {{ scope.row.packageName }}
                    </div>
                  </template>
                </el-table-column>
                <el-table-column
                  header-align="center"
                  show-overflow-tooltip
                  prop="versionName"
                  :label="$t('androidRemoteTS.code.version')"
                  width="120"
                ></el-table-column>
                <el-table-column
                  header-align="center"
                  show-overflow-tooltip
                  prop="versionCode"
                  :label="$t('androidRemoteTS.code.subversion')"
                  width="120"
                ></el-table-column>
                <el-table-column align="center" width="260">
                  <template #header>
                    <el-input
                      v-model="filterAppText"
                      size="mini"
                      :placeholder="$t('androidRemoteTS.code.nameSearch')"
                    />
                  </template>
                  <template #default="scope">
                    <el-button
                      size="mini"
                      type="primary"
                      @click="openApp(scope.row.packageName)"
                    >
                      {{ $t('androidRemoteTS.code.open') }}
                    </el-button>
                    <el-button
                      size="mini"
                      type="warning"
                      @click="killApp(scope.row.packageName)"
                    >
                      {{ $t('androidRemoteTS.code.kill') }}
                    </el-button>
                    <el-button
                      size="mini"
                      type="danger"
                      @click="uninstallApp(scope.row.packageName)"
                    >
                      {{ $t('androidRemoteTS.code.unInstall') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              <Pageable
                :is-page-set="false"
                :total="filterTableData.length"
                :current-page="currAppListPageIndex + 1"
                :page-size="7"
                @change="changeAppListPage"
              ></Pageable>
            </el-card>
          </el-tab-pane>
          <!-- ====== 代理抓包 Tab：WiFi 列表 / 证书安装 / iframe 调试 ====== -->
          <el-tab-pane :label="$t('androidRemoteTS.code.packet')" name="proxy">
            <el-button size="small" type="success" @click="startProxy"
              >{{ $t('androidRemoteTS.code.startPacket') }}
            </el-button>
            <el-button size="small" @click="installCert"
              >{{ $t('androidRemoteTS.code.downloadCertificate') }}
            </el-button>
            <el-button size="small" @click="clearProxy"
              >{{ $t('androidRemoteTS.code.cancelGlobalProxy') }}
            </el-button>
            <strong
              v-if="proxyConnPort !== 0"
              style="color: #67c23a; float: right; margin-top: 5px"
              >{{ $t('androidRemoteTS.code.proxyConnection') }}：{{
                agent['host'] + ':' + proxyConnPort
              }}</strong
            >
            <span style="float: right; display: flex; align-items: center">
              <el-button
                size="mini"
                style="margin-right: 6px"
                @click="getWifiList"
                >{{ $t('androidRemoteTS.code.refresh') }}</el-button
              >
              <ColorImg
                :src="wifiLogo"
                :width="18"
                :height="18"
                :color="isConnectWifi ? '#67C23A' : '#F56C6C'"
              />
              <span style="margin-left: 6px; color: #67c23a; font-size: 16px">{{
                currentWifi.length > 0 && isConnectWifi
                  ? currentWifi.replaceAll('"', '')
                  : ' '
              }}</span>
            </span>
            <iframe
              v-if="proxyWebPort !== 0"
              allow="clipboard-read;clipboard-write"
              :style="
                'border:1px solid #C0C4CC;width: 100%;height: ' +
                iFrameHeight +
                'px;margin-top:15px'
              "
              :src="'http://' + agent['host'] + ':' + proxyWebPort"
            ></iframe>
            <el-card v-else style="margin-top: 20px">
              <template #header
                ><strong>{{
                  $t('androidRemoteTS.code.useTeaching')
                }}</strong></template
              >
              <div style="height: 300px">
                <el-steps direction="vertical" :active="3">
                  <el-step
                    :title="$t('androidRemoteTS.code.connectWifi')"
                    status="process"
                    :description="$t('androidRemoteTS.code.connectWifiText')"
                  />
                  <el-step
                    :title="$t('androidRemoteTS.code.installCertificate')"
                    status="process"
                    :description="
                      $t('androidRemoteTS.code.installCertificateText')
                    "
                  />
                  <el-step
                    :title="$t('androidRemoteTS.code.startCapturing')"
                    status="process"
                    :description="$t('androidRemoteTS.code.startCapturingText')"
                  />
                </el-steps>
              </div>
            </el-card>
          </el-tab-pane>
          <el-tab-pane
            :label="$t('androidRemoteTS.code.screenshotQuick')"
            name="screenCap"
          >
            <el-button type="primary" size="small" @click="quickCap">
              <el-icon :size="12" style="vertical-align: middle">
                <Camera />
              </el-icon>
              {{ $t('androidRemoteTS.code.screenshot') }}
            </el-button>
            <el-button type="danger" size="small" @click="removeScreen">
              <el-icon :size="12" style="vertical-align: middle">
                <Delete />
              </el-icon>
              {{ $t('androidRemoteTS.code.clean') }}
            </el-button>
            <el-card
              v-if="screenUrls.length === 0"
              style="height: 100%; margin-top: 10px"
            >
              <el-empty
                :description="$t('androidRemoteTS.code.noScreenshots')"
              ></el-empty>
            </el-card>
            <el-row v-else :gutter="20">
              <el-col
                v-for="u in screenUrls"
                :xs="8"
                :sm="8"
                :md="8"
                :lg="4"
                :xl="4"
                style="margin-top: 10px"
              >
                <el-card shadow="hover" :body-style="{ padding: '10px' }">
                  <el-image
                    :src="u"
                    :preview-src-list="screenUrls"
                    hide-on-click-modal
                  ></el-image>
                  <div style="text-align: center; margin-top: 5px">
                    <el-button
                      type="primary"
                      plain
                      size="mini"
                      @click="downloadImg(u)"
                    >
                      <el-icon :size="12" style="vertical-align: middle">
                        <Download />
                      </el-icon>
                      {{ $t('androidRemoteTS.code.savePicture') }}
                    </el-button>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>
          <!-- ====== 终端 Tab：Shell 命令执行 + Logcat 日志采集 ====== -->
          <el-tab-pane label="Terminal" name="terminal">
            <el-alert
              :title="$t('androidRemoteTS.code.precautions')"
              type="warning"
              :description="$t('androidRemoteTS.code.precautionsText')"
              show-icon
              :closable="false"
              style="margin-bottom: 10px"
            />
            <el-tabs stretch type="border-card">
              <el-tab-pane label="Shell">
                <el-card
                  style="border: 0px"
                  :body-style="{
                    color: '#FFFFFF',
                    backgroundColor: '#303133',
                    lineHeight: '1.5',
                  }"
                >
                  <el-scrollbar
                    ref="terScroll"
                    noresize
                    :style="'height:' + terminalHeight + 'px;min-height:450px'"
                  >
                    <div
                      v-for="c in cmdOutPut"
                      style="white-space: pre-wrap"
                      v-html="c"
                    ></div>
                  </el-scrollbar>
                  <div style="display: flex; margin-top: 10px">
                    <el-input
                      v-model="cmdInput"
                      size="mini"
                      :placeholder="$t('androidRemoteTS.code.inputSend')"
                      @keyup.enter="sendCmd"
                    >
                      <template #prepend>{{ cmdUser + ':/ $' }}</template>
                    </el-input>
                    <el-button
                      size="mini"
                      :disabled="cmdInput.length === 0 || !cmdIsDone"
                      style="margin-left: 5px"
                      type="primary"
                      @click="sendCmd"
                      >Send
                    </el-button>
                    <el-button
                      size="mini"
                      :disabled="cmdIsDone"
                      style="margin-left: 5px"
                      type="danger"
                      @click="stopCmd"
                      >Stop
                    </el-button>
                    <el-button
                      size="mini"
                      style="margin-left: 5px"
                      type="warning"
                      @click="clearCmd"
                      >Clear
                    </el-button>
                  </div>
                </el-card>
              </el-tab-pane>
              <el-tab-pane label="Logcat">
                <el-card
                  style="border: 0px"
                  :body-style="{
                    color: '#FFFFFF',
                    backgroundColor: '#303133',
                    lineHeight: '1.5',
                  }"
                >
                  <div style="display: flex; margin-bottom: 10px">
                    <el-select v-model="logcatFilter.level" size="mini">
                      <el-option label="VERBOSE" value="V"></el-option>
                      <el-option label="DEBUG" value="D"></el-option>
                      <el-option label="INFO" value="I"></el-option>
                      <el-option label="WARN" value="W"></el-option>
                      <el-option label="ERROR" value="E"></el-option>
                      <el-option label="FATAL" value="F"></el-option>
                      <el-option label="SILENT" value="S"></el-option>
                    </el-select>
                    <el-input
                      v-model="logcatFilter.filter"
                      style="margin-left: 5px"
                      size="mini"
                      :placeholder="$t('androidRemoteTS.code.enterInput')"
                    >
                      <template #prepend>| grep</template>
                    </el-input>
                    <el-button
                      size="mini"
                      style="margin-left: 5px"
                      type="primary"
                      @click="sendLogcat"
                      >Start
                    </el-button>
                    <el-button
                      size="mini"
                      style="margin-left: 5px"
                      type="warning"
                      @click="stopLogcat"
                      >Stop
                    </el-button>
                    <el-button
                      size="mini"
                      style="margin-left: 5px"
                      type="success"
                      @click="saveLogcat"
                      >Save
                    </el-button>
                    <el-button
                      size="mini"
                      style="margin-left: 5px"
                      type="danger"
                      @click="clearLogcat"
                      >Clear
                    </el-button>
                  </div>
                  <el-scrollbar
                    ref="logcatScroll"
                    noresize
                    :style="'height:' + terminalHeight + 'px;min-height:450px'"
                  >
                    <div
                      v-for="l in logcatOutPut"
                      style="white-space: pre-wrap"
                      v-html="l"
                    ></div>
                  </el-scrollbar>
                </el-card>
              </el-tab-pane>
            </el-tabs>
          </el-tab-pane>
          <!-- ====== UI 自动化调试 Tab：关联用例 / 步骤列表 / 步骤日志 ====== -->
          <el-tab-pane
            :label="$t('androidRemoteTS.code.UIAutomation.UIAutomationName')"
            name="auto"
          >
            <div v-if="testCase['id']">
              <el-collapse accordion style="margin-bottom: 20px">
                <el-collapse-item>
                  <template #title>
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        width: 100%;
                        justify-content: space-between;
                      "
                    >
                      <strong
                        style="
                          font-size: 15px;
                          color: #909399;
                          margin-left: 10px;
                        "
                        >{{
                          $t('androidRemoteTS.code.UIAutomation.testInfo')
                        }}</strong
                      >
                      <el-button
                        style="margin-right: 10px"
                        type="danger"
                        size="mini"
                        @click="removeCase"
                      >
                        {{ $t('androidRemoteTS.code.UIAutomation.clean') }}
                      </el-button>
                    </div>
                  </template>
                  <el-descriptions :column="2" size="medium" border>
                    <el-descriptions-item
                      width="100px"
                      :label="$t('projectIndexTS.page.caseId')"
                      >{{ testCase['id'] }}
                    </el-descriptions-item>
                    <el-descriptions-item
                      width="100px"
                      :label="$t('projectIndexTS.page.caseName')"
                      >{{ testCase.name }}
                    </el-descriptions-item>
                    <el-descriptions-item
                      :label="
                        $t('androidRemoteTS.code.UIAutomation.fatherPlayed')
                      "
                    >
                      <div style="display: flex; align-items: center">
                        <el-avatar
                          style="margin-right: 10px"
                          :size="27"
                          :src="
                            project['projectImg'].length > 0
                              ? project['projectImg']
                              : defaultLogo
                          "
                          shape="square"
                        ></el-avatar>
                        {{ project['projectName'] }}
                      </div>
                    </el-descriptions-item>
                    <el-descriptions-item
                      :label="$t('stepListViewTS.platformToBe')"
                    >
                      <div style="display: flex; align-items: center">
                        <el-avatar
                          style="margin-right: 10px"
                          :size="27"
                          :src="
                            getImg(
                              testCase['platform'] === 1 ? 'ANDROID' : 'IOS'
                            )
                          "
                          shape="square"
                        ></el-avatar>
                        {{
                          testCase['platform'] === 1
                            ? $t('publicStepTS.android')
                            : 'iOS'
                        }}
                      </div>
                    </el-descriptions-item>
                    <el-descriptions-item :label="$t('stepListViewTS.module')">
                      {{
                        testCase['modulesDTO'] !== null
                          ? testCase['modulesDTO'].name
                          : ''
                      }}
                    </el-descriptions-item>
                    <el-descriptions-item
                      :label="$t('stepListViewTS.versionName')"
                      >{{ testCase['version'] }}
                    </el-descriptions-item>
                    <el-descriptions-item :label="$t('stepListViewTS.designer')"
                      >{{ testCase['designer'] }}
                    </el-descriptions-item>
                    <el-descriptions-item :label="$t('stepListViewTS.last')"
                      >{{ testCase['editTime'] }}
                    </el-descriptions-item>
                    <el-descriptions-item
                      :label="$t('stepListViewTS.testMessage')"
                      >{{ testCase['des'] }}
                    </el-descriptions-item>
                  </el-descriptions>
                </el-collapse-item>
              </el-collapse>
              <el-tabs v-model="activeTab2" type="border-card" stretch>
                <el-tab-pane :label="$t('publicStepTS.list')" name="step">
                  <step-list
                    :is-show-run="true"
                    :platform="1"
                    :is-driver-finish="isDriverFinish"
                    :case-id="testCase['id']"
                    :project-id="project['id']"
                    :debug-loading="debugLoading"
                    @run-step="runStep"
                  />
                </el-tab-pane>
                <el-tab-pane
                  :label="$t('resultDetailTS.page.runLog')"
                  name="log"
                >
                  <step-log
                    :is-read-only="false"
                    :debug-loading="debugLoading"
                    :step-log="stepLog"
                    @clear-log="clearLog"
                    @stop-step="stopStep"
                  />
                </el-tab-pane>
              </el-tabs>
            </div>
            <div v-else>
              <span style="color: #909399; margin-right: 10px">{{
                $t('androidRemoteTS.code.associatedProject')
              }}</span>
              <el-select
                v-model="project"
                size="mini"
                value-key="id"
                :placeholder="$t('androidRemoteTS.code.chooseProject')"
              >
                <el-option
                  v-for="item in store.state.projectList"
                  :key="item.id"
                  :value="item"
                  :label="item['projectName']"
                >
                  <div style="display: flex; align-items: center">
                    <el-avatar
                      style="margin-right: 10px"
                      :size="32"
                      :src="
                        item['projectImg'].length > 0
                          ? item['projectImg']
                          : defaultLogo
                      "
                      shape="square"
                    ></el-avatar>
                    {{ item['projectName'] }}
                  </div>
                </el-option>
              </el-select>
              <el-button
                v-if="project !== null"
                size="mini"
                type="primary"
                round
                style="position: absolute; right: 20px"
                @click="caseList.open()"
              >
                {{ $t('androidRemoteTS.code.addCase') }}
              </el-button>
              <test-case-list
                v-if="project !== null"
                ref="caseList"
                :project-id="project['id']"
                :platform="1"
                :is-read-only="true"
                @select-case="selectCase"
              ></test-case-list>
              <el-card style="height: 100%; margin-top: 20px">
                <el-result
                  icon="info"
                  :title="$t('androidRemoteTS.code.hintText')"
                  :sub-title="$t('androidRemoteTS.code.hintMessage')"
                >
                </el-result>
              </el-card>
            </div>
          </el-tab-pane>
          <!-- ====== 元素检查 Tab：原生控件树 + Poco 游戏控件树 ====== -->
          <el-tab-pane :label="$t('routes.controlElement')" name="ele">
            <el-tabs stretch type="border-card">
              <el-tab-pane :label="$t('androidRemoteTS.code.nativeControls')">
                <div v-show="isShowImg">
                  <div
                    style="
                      margin-bottom: 15px;
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                    "
                  >
                    <div>
                      <el-select v-model="isMultiWindows" size="mini">
                        <el-option
                          :label="$t('androidRemoteTS.element.windows.single')"
                          :value="false"
                        />
                        <el-option
                          :label="$t('androidRemoteTS.element.windows.multi')"
                          :value="true"
                        />
                      </el-select>
                      <el-select
                        v-model="isVisible"
                        style="margin-left: 10px"
                        size="mini"
                      >
                        <el-option
                          :label="$t('androidRemoteTS.element.visible.hid')"
                          :value="false"
                        />
                        <el-option
                          :label="$t('androidRemoteTS.element.visible.show')"
                          :value="true"
                        />
                      </el-select>
                      <el-select
                        v-model="isIgnore"
                        style="margin-left: 10px"
                        size="mini"
                      >
                        <el-option
                          :label="
                            $t('androidRemoteTS.element.unimportant.ignore')
                          "
                          :value="true"
                        />
                        <el-option
                          :label="
                            $t('androidRemoteTS.element.unimportant.show')
                          "
                          :value="false"
                        />
                      </el-select>
                      <el-button
                        style="margin-left: 10px"
                        type="primary"
                        size="mini"
                        :loading="elementLoading"
                        :disabled="isDriverFinish === false"
                        @click="getElement"
                      >
                        <el-icon :size="12" style="vertical-align: middle">
                          <Search />
                        </el-icon>
                        {{ $t('androidRemoteTS.code.retrieveControlEle') }}
                      </el-button>
                    </div>
                    <span
                      v-if="activity.length > 0"
                      style="
                        margin-right: 10px;
                        color: #909399;
                        font-size: 14px;
                        cursor: pointer;
                      "
                      @click="copy(activity)"
                      >{{ $t('androidRemoteTS.code.activity') }}：
                      {{ activity }}</span
                    >
                  </div>
                  <el-row :gutter="10">
                    <el-col :span="7">
                      <el-card shadow="hover">
                        <div
                          :style="
                            'width: 100%;background-image: url(' +
                            imgUrl +
                            ');background-size: 100% 100%;'
                          "
                        >
                          <canvas
                            id="debugPic"
                            @mousedown="touchstart"
                          ></canvas>
                        </div>
                      </el-card>
                      <el-card
                        v-if="webViewData.length > 0"
                        :body-style="{ padding: '12px' }"
                        shadow="hover"
                        style="margin-top: 10px"
                      >
                        <el-table :data="webViewData" border>
                          <el-table-column
                            :label="$t('androidRemoteTS.code.webViewList')"
                            align="center"
                            :show-overflow-tooltip="true"
                          >
                            <template #default="scope">
                              <span
                                style="cursor: pointer"
                                @click="copy(scope.row)"
                              >
                                {{ scope.row }}</span
                              >
                            </template>
                          </el-table-column>
                        </el-table>
                      </el-card>
                    </el-col>
                    <el-col :span="9">
                      <el-card v-if="isShowTree" shadow="hover">
                        <el-input
                          v-model="filterText"
                          style="margin-bottom: 10px"
                          size="mini"
                          :placeholder="$t('androidRemoteTS.code.classFilter')"
                        ></el-input>
                        <div style="height: 660px">
                          <el-scrollbar
                            class="element-tree-scrollbar"
                            style="height: 100%"
                          >
                            <el-tree
                              ref="tree"
                              :indent="13"
                              :filter-node-method="filterNode"
                              :default-expanded-keys="currentId"
                              node-key="id"
                              style="margin-top: 10px; margin-bottom: 20px"
                              :highlight-current="true"
                              :accordion="true"
                              :data="elementData"
                              @node-click="handleNodeClick"
                            >
                              <template #default="{ node, data }">
                                <span
                                  v-if="data.detail['resource-id']"
                                  style="font-size: 14px"
                                >
                                  {{
                                    node.label.substring(
                                      0,
                                      node.label.indexOf('>')
                                    ) + ' '
                                  }}
                                  <span style="color: #f55781">resource-id</span
                                  >={{
                                    '"' + data.detail['resource-id'] + '">'
                                  }}
                                </span>
                                <span v-else style="font-size: 14px">{{
                                  node.label
                                }}</span>
                              </template>
                            </el-tree>
                          </el-scrollbar>
                        </div>
                      </el-card>
                    </el-col>
                    <el-col :span="8">
                      <el-card v-if="isShowTree" shadow="hover">
                        <div style="height: 695px; padding-bottom: 60px">
                          <div
                            v-if="project && project['id']"
                            style="text-align: center; margin-bottom: 10px"
                          >
                            <el-button
                              :disabled="elementDetail === null"
                              plain
                              size="small"
                              type="primary"
                              round
                              @click="toAddElement('', '')"
                              >{{ $t('androidRemoteTS.code.addControls') }}
                            </el-button>
                            <el-button
                              v-if="
                                elementDetail &&
                                elementDetail['xpath'] &&
                                isDriverFinish
                              "
                              :loading="elementScreenLoading"
                              style="margin-left: 5px"
                              plain
                              size="small"
                              round
                              @click="getEleScreen(elementDetail['xpath'])"
                              >{{ $t('androidRemoteTS.code.controlSnapshot') }}
                            </el-button>
                          </div>
                          <div v-else>
                            <el-alert
                              style="margin-bottom: 10px"
                              :title="$t('androidRemoteTS.code.titleMessage')"
                              type="info"
                              show-icon
                              close-text="Get!"
                            />
                            <el-select
                              v-model="project"
                              style="width: 100%"
                              size="mini"
                              value-key="id"
                              :placeholder="
                                $t('androidRemoteTS.code.chooseProject')
                              "
                            >
                              <el-option
                                v-for="item in store.state.projectList"
                                :key="item.id"
                                :value="item"
                                :label="item['projectName']"
                              >
                                <div style="display: flex; align-items: center">
                                  <el-avatar
                                    style="margin-right: 10px"
                                    :size="32"
                                    :src="
                                      item['projectImg'].length > 0
                                        ? item['projectImg']
                                        : defaultLogo
                                    "
                                    shape="square"
                                  ></el-avatar>
                                  {{ item['projectName'] }}
                                </div>
                              </el-option>
                            </el-select>
                          </div>
                          <el-scrollbar
                            style="height: 100%"
                            class="element-tree-scrollbar"
                          >
                            <el-form
                              v-if="elementDetail !== null"
                              label-position="left"
                              class="element-table"
                              label-width="100px"
                            >
                              <el-form-item
                                label="class"
                                style="cursor: pointer"
                                @click="copy(elementDetail['class'])"
                              >
                                <span>{{ elementDetail['class'] }}</span>
                              </el-form-item>
                              <el-form-item
                                v-if="elementDetail['resource-id']"
                                label="resource-id"
                                style="cursor: pointer"
                              >
                                <span
                                  @click="copy(elementDetail['resource-id'])"
                                  >{{ elementDetail['resource-id'] }}</span
                                >
                                <el-icon
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    checkLocation({
                                      eleType: 'id',
                                      eleValue: elementDetail['resource-id'],
                                    })
                                  "
                                >
                                  <Location />
                                </el-icon>
                                <el-icon
                                  v-if="project && project['id']"
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    toAddElement(
                                      'id',
                                      elementDetail['resource-id']
                                    )
                                  "
                                >
                                  <Pointer />
                                </el-icon>
                              </el-form-item>
                              <el-form-item
                                :label="$t('androidRemoteTS.code.xpath')"
                              >
                                <el-table
                                  stripe
                                  :empty-text="
                                    $t('androidRemoteTS.code.xpathNull')
                                  "
                                  border
                                  :data="findBestXpath(elementDetail)"
                                  :show-header="false"
                                >
                                  <el-table-column>
                                    <template #default="scope">
                                      <span
                                        style="cursor: pointer"
                                        @click="copy(scope.row)"
                                        >{{ scope.row }}</span
                                      >
                                      <el-icon
                                        color="green"
                                        size="16"
                                        style="
                                          vertical-align: middle;
                                          margin-left: 10px;
                                          cursor: pointer;
                                        "
                                        @click="
                                          checkLocation({
                                            eleType: 'xpath',
                                            eleValue: scope.row,
                                          })
                                        "
                                      >
                                        <Location />
                                      </el-icon>
                                      <el-icon
                                        v-if="project && project['id']"
                                        color="green"
                                        size="16"
                                        style="
                                          vertical-align: middle;
                                          margin-left: 10px;
                                          cursor: pointer;
                                        "
                                        @click="
                                          toAddElement('xpath', scope.row)
                                        "
                                      >
                                        <Pointer />
                                      </el-icon>
                                    </template>
                                  </el-table-column>
                                </el-table>
                              </el-form-item>
                              <el-form-item
                                :label="$t('androidRemoteTS.code.absolutePath')"
                                style="cursor: pointer"
                              >
                                <span @click="copy(elementDetail['xpath'])">{{
                                  elementDetail['xpath']
                                }}</span>
                                <el-icon
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    checkLocation({
                                      eleType: 'xpath',
                                      eleValue: elementDetail['xpath'],
                                    })
                                  "
                                >
                                  <Location />
                                </el-icon>
                                <el-icon
                                  v-if="project && project['id']"
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    toAddElement(
                                      'xpath',
                                      elementDetail['xpath']
                                    )
                                  "
                                >
                                  <Pointer />
                                </el-icon>
                              </el-form-item>
                              <el-form-item
                                label="text"
                                style="cursor: pointer"
                                @click="copy(elementDetail['text'])"
                              >
                                <span>{{ elementDetail['text'] }}</span>
                              </el-form-item>
                              <el-form-item
                                v-if="elementDetail['content-desc']"
                                label="content-desc"
                                style="cursor: pointer"
                              >
                                <span
                                  @click="copy(elementDetail['content-desc'])"
                                  >{{ elementDetail['content-desc'] }}</span
                                >
                                <el-icon
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    checkLocation({
                                      eleType: 'accessibilityId',
                                      eleValue: elementDetail['content-desc'],
                                    })
                                  "
                                >
                                  <Location />
                                </el-icon>
                                <el-icon
                                  v-if="project && project['id']"
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    toAddElement(
                                      'accessibilityId',
                                      elementDetail['content-desc']
                                    )
                                  "
                                >
                                  <Pointer />
                                </el-icon>
                              </el-form-item>
                              <el-form-item
                                label="package"
                                style="cursor: pointer"
                                @click="copy(elementDetail['package'])"
                              >
                                <span>{{ elementDetail['package'] }}</span>
                              </el-form-item>
                              <el-form-item
                                :label="$t('androidRemoteTS.code.centerXY')"
                                style="cursor: pointer"
                              >
                                <span
                                  @click="
                                    copy(
                                      computedCenter(
                                        elementDetail['bStart'],
                                        elementDetail['bEnd']
                                      )
                                    )
                                  "
                                  >{{
                                    computedCenter(
                                      elementDetail['bStart'],
                                      elementDetail['bEnd']
                                    )
                                  }}</span
                                >
                                <el-icon
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    checkLocation({
                                      eleType: 'point',
                                      eleValue: computedCenter(
                                        elementDetail['x'],
                                        elementDetail['y'],
                                        elementDetail['width'],
                                        elementDetail['height']
                                      ),
                                    })
                                  "
                                >
                                  <Location />
                                </el-icon>
                                <el-icon
                                  v-if="project && project['id']"
                                  color="green"
                                  size="16"
                                  style="
                                    vertical-align: middle;
                                    margin-left: 10px;
                                    cursor: pointer;
                                  "
                                  @click="
                                    toAddElement(
                                      'point',
                                      computedCenter(
                                        elementDetail['bStart'],
                                        elementDetail['bEnd']
                                      )
                                    )
                                  "
                                >
                                  <Pointer />
                                </el-icon>
                              </el-form-item>
                              <el-form-item label="index">
                                <span>{{ elementDetail['index'] }}</span>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.checkable')
                                "
                              >
                                <el-switch
                                  :value="
                                    JSON.parse(elementDetail['checkable'])
                                  "
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.checked')
                                "
                              >
                                <el-switch
                                  :value="JSON.parse(elementDetail['checked'])"
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.clickable')
                                "
                              >
                                <el-switch
                                  :value="
                                    JSON.parse(elementDetail['clickable'])
                                  "
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.selected')
                                "
                              >
                                <el-switch
                                  :value="JSON.parse(elementDetail['selected'])"
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.displayed')
                                "
                              >
                                <el-switch
                                  :value="
                                    JSON.parse(elementDetail['displayed'])
                                  "
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.enabled')
                                "
                              >
                                <el-switch
                                  :value="JSON.parse(elementDetail['enabled'])"
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.focusable')
                                "
                              >
                                <el-switch
                                  :value="
                                    JSON.parse(elementDetail['focusable'])
                                  "
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.focused')
                                "
                              >
                                <el-switch
                                  :value="JSON.parse(elementDetail['focused'])"
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.longClickable')
                                "
                              >
                                <el-switch
                                  :value="
                                    JSON.parse(elementDetail['long-clickable'])
                                  "
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item
                                :label="
                                  $t('androidRemoteTS.code.label.scrollable')
                                "
                              >
                                <el-switch
                                  :value="
                                    JSON.parse(elementDetail['scrollable'])
                                  "
                                  disabled
                                >
                                </el-switch>
                              </el-form-item>
                              <el-form-item label="Bounds">
                                <span>{{ elementDetail['bounds'] }}</span>
                              </el-form-item>
                            </el-form>
                          </el-scrollbar>
                        </div>
                      </el-card>
                    </el-col>
                  </el-row>
                </div>
                <el-card v-show="!isShowImg" style="height: 100%">
                  <el-result
                    icon="info"
                    :title="$t('androidRemoteTS.code.hintText')"
                    :sub-title="$t('androidRemoteTS.code.subTitleText')"
                  >
                    <template #extra>
                      <el-button
                        size="mini"
                        type="primary"
                        :disabled="isDriverFinish"
                        :loading="driverLoading"
                        @click="openDriver"
                        >{{ $t('androidRemoteTS.code.UIAutomator2ServerInit') }}
                      </el-button>
                      <el-button
                        type="primary"
                        size="mini"
                        :loading="elementLoading"
                        :disabled="isDriverFinish === false"
                        @click="getElement"
                      >
                        <el-icon :size="12" style="vertical-align: middle">
                          <Search />
                        </el-icon>
                        {{ $t('androidRemoteTS.code.getEle') }}
                      </el-button>
                    </template>
                  </el-result>
                </el-card>
              </el-tab-pane>
              <el-tab-pane :label="$t('androidRemoteTS.code.poco')">
                <poco-pane
                  ref="pocoPaneRef"
                  :poco-loading="pocoLoading"
                  :is-driver-finish="isDriverFinish"
                  :direction-status="directionStatus"
                  :project-list="store.state.projectList"
                  :get-img-url="getImgUrl"
                  @get-poco="getPoco"
                  @copy="copy"
                />
              </el-tab-pane>
            </el-tabs>
          </el-tab-pane>
          <!-- ====== WebView 调试 Tab：WebView 列表 / Chrome DevTools iframe ====== -->
          <el-tab-pane
            :label="$t('androidRemoteTS.code.webView.webDebug')"
            name="webview"
          >
            <div v-if="isWebView">
              <div v-if="webViewListDetail.length == 0">
                <el-result
                  icon="info"
                  :title="$t('androidRemoteTS.code.hintText')"
                  :sub-title="$t('androidRemoteTS.code.webView.err')"
                >
                  <template #extra>
                    <el-button
                      type="primary"
                      size="mini"
                      :loading="webViewLoading"
                      @click="getWebViewForward"
                    >
                      <el-icon :size="12" style="vertical-align: middle">
                        <Search />
                      </el-icon>
                      {{ $t('androidRemoteTS.code.webView.getWeb') }}
                    </el-button>
                  </template>
                </el-result>
              </div>
              <div v-else>
                <el-button
                  :loading="webViewLoading"
                  type="primary"
                  size="mini"
                  @click="getWebViewForward"
                >
                  {{ $t('androidRemoteTS.code.webView.againGetWeb') }}
                </el-button>
                <el-card
                  v-for="web in webViewListDetail"
                  style="margin-top: 15px"
                  class="device-card"
                  :body-style="{ padding: '0px 10px 10px 10px' }"
                >
                  <template #header>
                    <div>
                      <div style="display: flex; align-items: center">
                        <img :src="getImg('chrome')" width="20" />
                        <strong style="margin-left: 10px"
                          >{{ web['package'] }} ({{ web['version'] }})</strong
                        >
                      </div>
                    </div>
                  </template>
                  <el-card
                    v-for="w in web.children"
                    :body-style="{ padding: '15px' }"
                    style="
                      margin-top: 10px;
                      word-wrap: break-word;
                      overflow: hidden;
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                      "
                    >
                      <div>
                        <div style="display: flex; align-items: center">
                          <img
                            v-if="w.favicon"
                            :src="w.favicon"
                            width="15"
                            style="margin-right: 5px"
                          />
                          <strong>{{
                            w.title.length > 0
                              ? w.title
                              : $t('androidRemoteTS.code.webView.Untitled')
                          }}</strong>
                        </div>
                        <div style="color: #909399">
                          {{
                            w.url.length > 50
                              ? w.url.substring(0, 50) + '...'
                              : w.url
                          }}
                        </div>
                      </div>
                      <el-button
                        type="primary"
                        size="mini"
                        @click="
                          tabWebView(
                            web.port,
                            w.id,
                            w.title.length > 0
                              ? w.title
                              : $t('androidRemoteTS.code.webView.Untitled')
                          )
                        "
                      >
                        {{ $t('androidRemoteTS.code.webView.nowDebug') }}
                      </el-button>
                    </div>
                  </el-card>
                </el-card>
              </div>
            </div>
            <div v-else>
              <div style="display: flex; align-items: center">
                <el-page-header
                  icon="el-icon-arrow-left"
                  @back="switchIsWebView"
                >
                  <template #title>
                    <span style="color: #606266">{{
                      $t('androidRemoteTS.code.webView.return')
                    }}</span>
                  </template>
                  <template #content>
                    {{ $t('androidRemoteTS.code.webView.nowWeb') }}：<strong>{{
                      title
                    }}</strong>
                  </template>
                </el-page-header>
              </div>
              <iframe
                v-if="!isWebView"
                allow="clipboard-read;clipboard-write"
                :style="
                  'border:1px solid #C0C4CC;;width: 100%;height: ' +
                  iFrameHeight +
                  'px;margin-top:15px'
                "
                :src="iframeUrl"
              >
              </iframe>
            </div>
          </el-tab-pane>
          <!-- ====== 性能监控 Tab：CPU / 内存 / FPS 等指标采集 ====== -->
          <el-tab-pane :label="$t('IOSRemote.perfmon')" name="perfmon">
            <android-perf
              ref="androidPerfRef"
              :app-list="appList"
              @start-perfmon="startPerfmon"
              @stop-perfmon="stopPerfmon"
            />
          </el-tab-pane>
        </el-tabs>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="less">
/* 左右分栏拖拽条（垂直方向，鼠标可左右拖动调整左右面板宽度） */
.line {
  width: 2px;
  height: inherit;
  background: #ccc;
  text-align: center;
  border-radius: 1px;
  margin-right: -2px;
  position: relative;
  z-index: 9;
  cursor: e-resize;

  &::after {
    content: '';
    position: absolute;
    top: 48%;
    left: -14px;
    display: block;
    width: 30px;
    height: 30px;
    background: url('@/assets/img/drag.png') no-repeat center;
    transform: rotate(90deg);
    background-size: 100% 100%;
  }
}

/* 上下分栏拖拽条（水平方向，鼠标可上下拖动调整上下面板高度） */
.lineVertical {
  width: 100%;
  height: 2px;
  background: #ccc;
  text-align: center;
  position: relative;
  cursor: n-resize;
  margin: 1em calc(16px);

  &::after {
    content: '';
    position: absolute;
    left: 48%;
    top: -14px;
    display: block;
    width: 30px;
    height: 30px;
    background: url('@/assets/img/drag.png') no-repeat center;
    background-size: 100% 100%;
  }
}

/* 元素调试画布：宽度撑满，高度自适应（用于绘制元素高亮框） */
#debugPic {
  width: 100%;
  height: auto;
}

/* URL 安装输入框容器 */
.url-install-box {
  position: relative;
  height: 100%;
}

/* 远程文本输入框：绝对定位、透明、隐藏在触摸点（用于接收键盘输入并转发到设备） */
.input-box {
  position: absolute;
  border: none;
  background-color: transparent;
  outline: none;
  z-index: -1;
  width: 1px;
}
</style>
