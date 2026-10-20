<script setup>
/**
 * RenderDeviceName.vue - 设备名称渲染组件
 * 根据优先级依次显示设备昵称、中文名、型号，确保始终有名称显示
 */

// 引入国际化
import { useI18n } from 'vue-i18n';

// 获取国际化翻译函数
const { t: $t } = useI18n();

/**
 * 定义组件属性
 */
const props = defineProps({
  // 设备对象
  device: Object,
});
</script>

<template>
  <!-- 设备名称显示，优先级：昵称 > 中文名 > 型号 > 未知 -->
  <span
    style="white-space: nowrap; text-overflow: ellipsis; overflow: hidden"
    >{{
      // 如果有昵称，显示昵称
      device['nickName'] && device['nickName'].length > 0
        ? device['nickName']
        // 如果有中文名，显示中文名
        : device['chiName'] && device['chiName'].length > 0
        ? device['chiName']
        // 如果有型号，显示型号
        : device['model'] && device['model'].length > 0
        ? device['model']
        // 都没有则显示 '未知'
        : $t('form.unknown')
    }}</span
  >
</template>
