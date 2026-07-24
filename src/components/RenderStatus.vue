<script setup>
/**
 * RenderStatus.vue - 设备状态渲染组件
 * 根据设备状态显示不同颜色的标签，并支持调试状态下的释放操作
 */

// 引入 axios
import axios from '@/http/axios';

// 引入 Element Plus 消息组件
import { ElMessage } from 'element-plus';

// 引入国际化
import { useI18n } from 'vue-i18n';

// 获取国际化翻译函数
const { t: $t } = useI18n();

/**
 * 状态配置列表
 * 定义不同状态对应的标签类型（颜色）
 */
const statusList = {
  ONLINE: {
    type: 'success', // 在线 - 绿色
  },
  OFFLINE: {
    type: 'info', // 离线 - 蓝色
  },
  DISCONNECTED: {
    type: 'info', // 断开连接 - 蓝色
  },
  DEBUGGING: {}, // 调试中 - 默认样式
  TESTING: {}, // 测试中 - 默认样式
  UNAUTHORIZED: {
    type: 'danger', // 未授权 - 红色
  },
  ERROR: {
    type: 'warning', // 错误 - 橙色
  },
};

/**
 * 定义组件属性
 */
const props = defineProps({
  // 设备状态
  status: String,
  // 使用设备的用户名称
  user: String,
  // 设备的 UDID（调试状态下用于释放设备）
  udId: {
    default: '',
    type: String,
    required: false,
  },
});

// 根据状态获取对应的配置对象
const selObj = statusList[props.status] || { type: 'danger' };

/**
 * 停止调试（释放设备）
 */
const stopDebug = () => {
  axios
    .get('/controller/devices/stopDebug', { params: { udId: props.udId } })
    .then((resp) => {
      if (resp.code === 2000) {
        ElMessage.success({
          message: resp.message,
        });
      }
    });
};
</script>

<template>
  <el-popconfirm
    v-if="udId.length > 0 && status === 'DEBUGGING'"
    :title="$t('common.releaseTip')"
    icon-color="#F56C6C"
    @confirm="stopDebug"
  >
    <template #reference>
      <el-tag
        :type="selObj.type"
        size="mini"
        style="float: right; cursor: pointer"
      >
        {{ user + ' ' + $t('devices.status.' + status) }}
      </el-tag>
    </template>
  </el-popconfirm>
  <el-tag v-else :type="selObj.type" size="mini" style="float: right">
    <i v-if="status === 'TESTING'" class="el-icon-loading"></i>
    {{ $t('devices.status.' + status) }}
  </el-tag>
</template>
