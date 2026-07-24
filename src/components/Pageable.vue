<script setup>
/**
 * Pageable.vue - 分页组件
 * 封装 Element Plus 的分页组件，提供统一的分页交互
 */

// 定义组件属性
const props = defineProps({
  // 每页条数
  pageSize: Number,
  // 当前页码
  currentPage: Number,
  // 总记录数
  total: Number,
  // 是否显示每页条数选择器
  isPageSet: Boolean,
});

// 定义组件事件
const emit = defineEmits(['change']);

/**
 * 页码切换处理
 * @param {number} num - 新的页码
 */
const changePage = (num) => {
  // 触发 change 事件，传递新页码和当前每页条数
  emit('change', num, props.pageSize);
};

/**
 * 每页条数切换处理
 * @param {number} num - 新的每页条数
 */
const changeSize = (num) => {
  // 触发 change 事件，传递当前页码和新的每页条数
  emit('change', props.currentPage, num);
};
</script>

<template>
  <!-- 显示每页条数选择器的分页组件 -->
  <el-pagination
    v-if="isPageSet === true"
    :current-page="currentPage"
    background
    style="text-align: center; margin-top: 20px"
    :page-size="pageSize"
    :page-sizes="[10, 15, 20, 25]"
    layout="sizes, prev, pager, next, jumper, ->, total"
    :total="total"
    @current-change="changePage"
    @size-change="changeSize"
  ></el-pagination>
  
  <!-- 不显示每页条数选择器的分页组件 -->
  <el-pagination
    v-else
    :current-page="currentPage"
    background
    style="text-align: center; margin-top: 20px"
    :page-size="pageSize"
    layout="prev, pager, next, jumper, ->, total"
    :total="total"
    @current-change="changePage"
  ></el-pagination>
</template>
