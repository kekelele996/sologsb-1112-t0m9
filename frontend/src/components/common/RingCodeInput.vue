<script setup lang="ts">
import { computed } from 'vue';
import { COLOR_RING_PRESETS, RING_PREFIXES, type RingRecord } from '../../types/ring-record';

const props = withDefaults(
  defineProps<{
    ringNo: string;
    colorRing: string;
    /** 环号已存在时命中的历史记录 */
    existed?: RingRecord;
    historyCount?: number;
    /** 本次是否为再次捕获（新建且环号已建档） */
    recapture?: boolean;
  }>(),
  { existed: undefined, historyCount: 0, recapture: false },
);

const emit = defineEmits<{
  (e: 'update:ringNo', value: string): void;
  (e: 'update:colorRing', value: string): void;
  (e: 'view-history', ringNo: string): void;
}>();

const prefix = computed(() => {
  const [head] = props.ringNo.split('-');
  return RING_PREFIXES.includes(head) ? head : RING_PREFIXES[0];
});

const serial = computed(() => {
  const parts = props.ringNo.split('-');
  return parts.length > 1 ? parts.slice(1).join('-') : '';
});

function compose(nextPrefix: string, nextSerial: string) {
  const clean = nextSerial.replace(/[^0-9A-Za-z]/g, '');
  emit('update:ringNo', clean ? `${nextPrefix}-${clean}` : nextPrefix);
}
</script>

<template>
  <div class="ring-code">
    <div class="ring-row">
      <span class="ring-label">金属环号</span>
      <el-select :model-value="prefix" style="width: 90px" @change="(value: string) => compose(value, serial)">
        <el-option v-for="item in RING_PREFIXES" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input
        :model-value="serial"
        placeholder="环号序号，如 10231"
        maxlength="10"
        style="width: 180px"
        @update:model-value="(value: string) => compose(prefix, value)"
      />
      <span class="ring-preview">完整环号：{{ ringNo || '—' }}</span>
    </div>
    <div class="ring-row">
      <span class="ring-label">彩环组合</span>
      <el-select
        :model-value="colorRing"
        filterable
        allow-create
        default-first-option
        placeholder="选择或输入彩环组合"
        style="width: 220px"
        @update:model-value="(value: string) => emit('update:colorRing', value || '无')"
      >
        <el-option v-for="item in COLOR_RING_PRESETS" :key="item" :label="item" :value="item" />
      </el-select>
      <span class="ring-hint">彩环用于野外远距离识别，可与金属环号组合使用</span>
    </div>
    <el-alert
      v-if="existed"
      class="ring-alert"
      :type="recapture ? 'success' : 'info'"
      show-icon
      :closable="false"
      :title="
        recapture
          ? `环号 ${ringNo} 已建档（${existed.speciesCn} · 共 ${historyCount} 条记录），本次将作为再次捕获登记`
          : `环号 ${ringNo} 共有 ${historyCount} 条记录（${existed.speciesCn}）`
      "
      :description="
        recapture
          ? '鸟种自动沿用首捕档案，状态请在下方选择「重捕」或「回收」；环志日期不得早于上一条记录。'
          : '同一环号允许多次捕获，完整轨迹见「历史」窗口。'
      "
    >
      <template #default>
        <el-button link type="primary" @click="emit('view-history', ringNo)">查看个体追踪</el-button>
      </template>
    </el-alert>
  </div>
</template>

<style scoped>
.ring-code {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ring-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ring-label {
  width: 80px;
  font-size: 13px;
  color: #2f4a44;
}
.ring-preview {
  font-size: 12px;
  color: #2f7d6f;
}
.ring-hint {
  font-size: 12px;
  color: #8a99a5;
}
.ring-alert {
  margin-top: 4px;
}
</style>
