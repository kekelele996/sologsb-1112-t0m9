<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import FilterBar from '../components/common/FilterBar.vue';
import EmptyPanel from '../components/common/EmptyPanel.vue';
import RingCodeInput from '../components/common/RingCodeInput.vue';
import SpeciesPicker from '../components/common/SpeciesPicker.vue';
import { useRingStore } from '../stores/ringStore';
import { useSiteStore } from '../stores/siteStore';
import { useSessionStore } from '../stores/sessionStore';
import { BIRD_AGES, RING_STATUSES, STATUS_COLOR, type BirdAge, type RingRecord, type RingStatus } from '../types/ring-record';
import { formatDate } from '../utils/format';
import { speciesCount } from '../utils/stats';
import { buildTrack, trackSummary, type TrackPoint } from '../utils/track';

const route = useRoute();
const ringStore = useRingStore();
const siteStore = useSiteStore();
const sessionStore = useSessionStore();

const dialogVisible = ref(false);
const editingId = ref('');
const formRef = ref<FormInstance>();
const historyVisible = ref(false);
const historyRingNo = ref('');

interface RingForm {
  ringNo: string;
  colorRing: string;
  speciesCn: string;
  speciesSci: string;
  age: BirdAge;
  ringDate: string;
  netNo: string;
  netRound: number;
  status: RingStatus;
  ringer: string;
  siteId: string;
  sessionId: string;
  remark: string;
}

const form = ref<RingForm>({
  ringNo: 'A-',
  colorRing: '无',
  speciesCn: '',
  speciesSci: '',
  age: '成',
  ringDate: new Date().toISOString().slice(0, 10),
  netNo: '1 号网',
  netRound: 1,
  status: '初捕',
  ringer: '',
  siteId: '',
  sessionId: '',
  remark: '',
});

/** 环号已有档案（编辑时排除自身）→ 本次为该个体的再次捕获 */
const existedRecord = computed(() => {
  const found = ringStore.findByRingNo(form.value.ringNo);
  return found && found.id !== editingId.value ? found : undefined;
});
const existedHistory = computed(() => (existedRecord.value ? ringStore.historyOf(form.value.ringNo) : []));
/** 该环号时间线上的「上一条」记录（新增取最新一条，编辑取自身前一条） */
const prevRecord = computed(() => ringStore.prevForSave(form.value.ringNo, editingId.value));
/** 再次捕获时状态只能记为重捕 / 回收 */
const statusOptions = computed<RingStatus[]>(() => (existedRecord.value ? ['重捕', '回收'] : [...RING_STATUSES]));

const rules: FormRules = {
  ringNo: [{ required: true, message: '请输入金属环号', trigger: 'blur' }],
  speciesCn: [{ required: true, message: '请选择或输入鸟种中文名', trigger: 'change' }],
  ringer: [{ required: true, message: '请输入环志人', trigger: 'blur' }],
  ringDate: [
    {
      validator: (_rule, value, callback) => {
        const prev = prevRecord.value;
        if (prev && typeof value === 'string' && value && value < prev.ringDate.slice(0, 10)) {
          callback(new Error(`本次日期早于上一条记录（${prev.ringDate.slice(0, 10)}），请调整日期`));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

/** 同一环号再次捕获：鸟种自动沿用首次建档，状态默认记为重捕 */
watch(
  () => form.value.ringNo,
  () => {
    const existed = existedRecord.value;
    if (!existed) return;
    const first = existedHistory.value[0] ?? existed;
    form.value.speciesCn = first.speciesCn;
    form.value.speciesSci = first.speciesSci;
    if (form.value.status === '初捕') form.value.status = '重捕';
  },
);

const kwParam = computed(() => (typeof route.query.kw === 'string' ? route.query.kw : ''));
const speciesParam = computed(() => (typeof route.query.species === 'string' ? route.query.species : ''));
const statusParam = computed(() => (typeof route.query.status === 'string' ? route.query.status : ''));
const sessionParam = computed(() => (typeof route.query.session === 'string' ? route.query.session : ''));
const sessionSelectParam = computed(() => (typeof route.query.sessionSelect === 'string' ? route.query.sessionSelect : ''));

const visible = computed(() => {
  const kw = kwParam.value.trim().toLowerCase();
  return ringStore.rings.filter((record) => {
    if (speciesParam.value && record.speciesCn !== speciesParam.value) return false;
    if (statusParam.value && record.status !== statusParam.value) return false;
    if (sessionSelectParam.value && record.sessionId !== sessionSelectParam.value) return false;
    if (kw) {
      const haystack = `${record.ringNo} ${record.colorRing} ${record.speciesCn} ${record.speciesSci} ${record.ringer} ${record.netNo}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
});

const entityOptions = computed(() => speciesCount(ringStore.rings).map((item) => item.speciesCn));

function openCreate() {
  editingId.value = '';
  formRef.value?.clearValidate();
  form.value = {
    ringNo: 'A-',
    colorRing: '无',
    speciesCn: '红喉歌鸲',
    speciesSci: 'Calliope calliope',
    age: '成',
    ringDate: new Date().toISOString().slice(0, 10),
    netNo: '1 号网',
    netRound: 1,
    status: '初捕',
    ringer: '韩雪',
    siteId: siteStore.sites[0]?.id ?? '',
    sessionId: sessionStore.sessions[0]?.id ?? '',
    remark: '',
  };
  dialogVisible.value = true;
}

function openEdit(record: RingRecord) {
  editingId.value = record.id;
  form.value = {
    ringNo: record.ringNo,
    colorRing: record.colorRing,
    speciesCn: record.speciesCn,
    speciesSci: record.speciesSci,
    age: record.age,
    ringDate: record.ringDate.slice(0, 10),
    netNo: record.netNo,
    netRound: record.netRound,
    status: record.status,
    ringer: record.ringer,
    siteId: record.siteId,
    sessionId: record.sessionId,
    remark: record.remark ?? '',
  };
  dialogVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  const payload = {
    ringNo: form.value.ringNo,
    colorRing: form.value.colorRing,
    speciesCn: form.value.speciesCn,
    speciesSci: form.value.speciesSci,
    age: form.value.age,
    ringDate: new Date(`${form.value.ringDate}T08:00:00`).toISOString(),
    netNo: form.value.netNo,
    netRound: Number(form.value.netRound) || 1,
    status: form.value.status,
    ringer: form.value.ringer,
    siteId: form.value.siteId,
    sessionId: form.value.sessionId,
    remark: form.value.remark,
  };
  if (editingId.value) {
    const { conflict } = await ringStore.updateRing(editingId.value, payload);
    if (conflict) {
      ElMessage.error(`本次日期 ${conflict.date} 早于上一条记录（${conflict.prevDate}），未保存`);
      return;
    }
    ElMessage.success(`已更新环志记录 ${payload.ringNo}，个体轨迹与统计已同步`);
  } else {
    const { record, conflict } = await ringStore.addRing(payload);
    if (conflict) {
      ElMessage.error(`本次日期 ${conflict.date} 早于上一条记录（${conflict.prevDate}），未保存`);
      return;
    }
    if (record) {
      ElMessage.success(
        record.status === '初捕'
          ? `已登记环志记录 ${record.ringNo}（${record.speciesCn}）`
          : `已登记${record.status}记录 ${record.ringNo}（${record.speciesCn}），个体轨迹已更新`,
      );
    }
  }
  dialogVisible.value = false;
}

function showHistory(ringNo: string) {
  historyRingNo.value = ringNo;
  historyVisible.value = true;
}

/** 从个体轨迹窗口直接登记该环号的下一次捕获 */
function openFollowUp() {
  const ringNo = historyRingNo.value;
  historyVisible.value = false;
  openCreate();
  form.value.ringNo = ringNo;
}

async function remove(record: RingRecord) {
  const confirmed = await ElMessageBox.confirm(`确认删除环志记录 ${record.ringNo}（${record.speciesCn}）？`, '删除确认', { type: 'warning' })
    .then(() => true)
    .catch(() => false);
  if (!confirmed) return;
  await ringStore.removeRing(record.id);
  if (historyVisible.value && ringStore.historyOf(historyRingNo.value).length === 0) {
    historyVisible.value = false;
  }
  ElMessage.success('已删除，个体轨迹与统计已同步');
}

/** 个体轨迹：按时间升序的每次捕获 + 相隔天数 / 直线距离 / 跨点标记 */
const trackPoints = computed(() => buildTrack(ringStore.historyOf(historyRingNo.value), siteStore.sites));
const trackInfo = computed(() => trackSummary(trackPoints.value));
const trackSpecies = computed(() => trackPoints.value[0]?.record.speciesCn ?? '');

function movedRowClass({ row }: { row: TrackPoint }): string {
  return row.moved ? 'moved-row' : '';
}
</script>

<template>
  <div>
    <h2 class="page-title">环志记录录入与个体追踪</h2>
    <p class="page-desc">
      首次环志照原流程建档；同一环号再次捕获可直接追加记录（鸟种自动沿用，状态记为重捕 / 回收）。「轨迹」窗口按时间展示每次捕获的点位、相隔天数与直线距离。
    </p>

    <div class="toolbar">
      <el-button type="primary" @click="openCreate">登记环志记录</el-button>
    </div>

    <FilterBar
      :fields="[
        { key: 'species', label: '鸟种', options: entityOptions, width: 140 },
        { key: 'status', label: '状态', options: [...RING_STATUSES], width: 110 },
        { key: 'sessionSelect', label: '调查批次', options: sessionStore.sessions.map((s) => s.sessionNo), width: 130 },
      ]"
      keyword-placeholder="搜索环号 / 鸟种 / 环志人 / 网号"
      :result-count="visible.length"
      :total-count="ringStore.rings.length"
    />

    <EmptyPanel v-if="visible.length === 0" description="没有符合条件的环志记录" action-text="登记环志记录" @action="openCreate" />

    <el-card v-else shadow="never" class="block">
      <el-table :data="visible" size="small" border>
        <el-table-column prop="ringNo" label="金属环号" width="110" />
        <el-table-column prop="colorRing" label="彩环" width="100" />
        <el-table-column prop="speciesCn" label="鸟种" width="110" />
        <el-table-column prop="speciesSci" label="学名" min-width="170" show-overflow-tooltip />
        <el-table-column prop="age" label="年龄" width="80" />
        <el-table-column label="环志日期" width="110">
          <template #default="scope">{{ formatDate(scope.row.ringDate) }}</template>
        </el-table-column>
        <el-table-column prop="netNo" label="网号" width="90" />
        <el-table-column prop="netRound" label="网次" width="70" align="right" />
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="STATUS_COLOR[scope.row.status as RingStatus]" size="small">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ringer" label="环志人" width="90" />
        <el-table-column label="鸟点" width="140">
          <template #default="scope">{{ siteStore.siteName(scope.row.siteId) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button link type="primary" @click="showHistory(scope.row.ringNo)">轨迹</el-button>
            <el-button link type="primary" @click="openEdit(scope.row)">编辑</el-button>
            <el-button link type="danger" @click="remove(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑环志记录' : existedRecord ? '登记再次捕获（重捕 / 回收）' : '登记环志记录'" width="760px">
      <RingCodeInput
        v-model:ring-no="form.ringNo"
        v-model:color-ring="form.colorRing"
        :existed="existedRecord"
        :history-count="existedHistory.length"
        @view-history="showHistory"
      />

      <el-divider content-position="left">鸟种与环志信息</el-divider>

      <SpeciesPicker v-model:species-cn="form.speciesCn" v-model:species-sci="form.speciesSci" :disabled="!!existedRecord" />

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" class="ring-form">
        <el-form-item label="金属环号" prop="ringNo">
          <el-input v-model="form.ringNo" placeholder="如：A-10231" maxlength="20" />
        </el-form-item>
        <el-form-item label="鸟种中文名" prop="speciesCn">
          <el-input v-model="form.speciesCn" placeholder="与上方鸟种选择一致" maxlength="30" :disabled="!!existedRecord" />
        </el-form-item>
        <el-form-item label="学名">
          <el-input v-model="form.speciesSci" maxlength="60" :disabled="!!existedRecord" />
        </el-form-item>
        <el-form-item label="年龄">
          <el-select v-model="form.age" style="width: 160px">
            <el-option v-for="age in BIRD_AGES" :key="age" :label="age" :value="age" />
          </el-select>
        </el-form-item>
        <el-form-item label="环志日期" prop="ringDate">
          <el-date-picker v-model="form.ringDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="网号">
          <el-input v-model="form.netNo" style="width: 160px" maxlength="20" placeholder="如：3 号网" />
        </el-form-item>
        <el-form-item label="网次">
          <el-input-number v-model="form.netRound" :min="1" :max="20" placeholder="网次" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width: 160px">
            <el-option v-for="status in statusOptions" :key="status" :label="status" :value="status" />
          </el-select>
        </el-form-item>
        <el-form-item label="环志人" prop="ringer">
          <el-input v-model="form.ringer" style="width: 160px" maxlength="16" placeholder="如：韩雪" />
        </el-form-item>
        <el-form-item label="鸟点">
          <el-select v-model="form.siteId" style="width: 240px" :options="[]">
            <el-option v-for="site in siteStore.sites" :key="site.id" :label="`${site.siteNo} · ${site.name}`" :value="site.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="调查批次">
          <el-select v-model="form.sessionId" style="width: 240px">
            <el-option v-for="session in sessionStore.sessions" :key="session.id" :label="`${session.sessionNo} · ${session.date}`" :value="session.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="80" placeholder="重捕位移、体况等" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="historyVisible" :title="`个体追踪 · ${historyRingNo}`" width="900px">
      <div class="track-head">
        <el-tag size="small" type="success" effect="plain">{{ trackSpecies }}</el-tag>
        <span>捕获 {{ trackInfo.count }} 次</span>
        <span>途经 {{ trackInfo.siteCount }} 个点位</span>
        <span>累计位移 {{ trackInfo.totalKm }} km</span>
      </div>
      <el-table :data="trackPoints" size="small" border :row-class-name="movedRowClass">
        <el-table-column prop="seq" label="#" width="46" align="center" />
        <el-table-column label="日期" width="105">
          <template #default="scope">{{ formatDate(scope.row.record.ringDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope">
            <el-tag :type="STATUS_COLOR[scope.row.record.status as RingStatus]" size="small">{{ scope.row.record.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="捕获点位" min-width="170">
          <template #default="scope">
            <span :class="{ 'moved-site': scope.row.moved }">{{ scope.row.site?.name ?? '未知鸟点' }}</span>
            <el-tag v-if="scope.row.moved" type="warning" size="small" effect="dark" class="moved-tag">跨点</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="与上次相隔" width="100" align="right">
          <template #default="scope">{{ scope.row.daysSincePrev === null ? '—' : `${scope.row.daysSincePrev} 天` }}</template>
        </el-table-column>
        <el-table-column label="直线距离" width="100" align="right">
          <template #default="scope">
            <span v-if="scope.row.distanceFromPrev === null">—</span>
            <span v-else :class="{ 'moved-dist': scope.row.moved }">{{ scope.row.distanceFromPrev }} km</span>
          </template>
        </el-table-column>
        <el-table-column prop="record.netNo" label="网号" width="90" />
        <el-table-column prop="record.ringer" label="环志人" width="90" />
        <el-table-column prop="record.remark" label="备注" min-width="120" show-overflow-tooltip />
      </el-table>
      <template #footer>
        <el-button type="primary" @click="openFollowUp">登记该环号新捕获</el-button>
        <el-button @click="historyVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  color: #1f4a44;
}
.page-desc {
  margin: 0 0 12px;
  color: #6f8480;
  font-size: 13px;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.block {
  border-radius: 8px;
}
.ring-form {
  margin-top: 10px;
}
.track-head {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  color: #2f4a44;
}
/* 跨点捕获：整行暖色底 + 点位与距离加粗变色，醒目提示位移 */
:deep(.moved-row > td.el-table__cell) {
  background: #fdf3e3 !important;
}
.moved-site {
  color: #b36b00;
  font-weight: 600;
}
.moved-tag {
  margin-left: 6px;
}
.moved-dist {
  color: #b36b00;
  font-weight: 600;
}
</style>
