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
 * ColorImg.vue - 彩色图片组件
 * 使用 CSS mask-image 技术将单色背景通过图片形状显示，实现图片颜色自定义
 */

/**
 * 定义组件属性
 */
const props = defineProps({
  // 图片 URL（作为 mask 使用）
  src: String,
  // 填充颜色（背景色）
  color: String,
  // 自定义样式类
  className: String,
  // 宽度
  width: String | Number,
  // 高度
  height: String | Number,
});
</script>

<template>
  <div
    :class="['colorImg']"
    :style="{
      maskImage: `url(${src})`,
      backgroundColor: color || '#000',
      width: width + 'px',
      height: height + 'px',
    }"
  />
</template>

<style scoped lang="less">
.colorImg {
  display: inline-block;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
}
</style>
