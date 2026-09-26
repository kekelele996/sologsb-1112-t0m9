import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import type { BirdAge, RingRecord, RingStatus } from '../types/ring-record';

export interface RingInput {
  ringNo: string;
  colorRing: string;
  speciesCn: string;
  speciesSci: string;
  age: BirdAge;
  ringDate?: string;
  netNo: string;
  netRound: number;
  status: RingStatus;
  ringer: string;
  siteId: string;
  sessionId: string;
  remark?: string;
}

/** 日期冲突：本次日期越过了相邻记录 */
export interface DateConflict {
  /** 冲突相邻记录的日期（YYYY-MM-DD） */
  date: string;
  /** 越界方向：早于上一条 / 晚于下一条 */
  bound: 'prev' | 'next';
}

interface RingState {
  rings: RingRecord[];
  hydrated: boolean;
}

const dateOf = (ringDate: string) => ringDate.slice(0, 10);

/** 环志记录与个体追踪（同一环号允许多次捕获） */
export const useRingStore = defineStore('ring', {
  state: (): RingState => ({ rings: [], hydrated: false }),

  getters: {
    findByRingNo(state) {
      return (ringNo: string): RingRecord | undefined =>
        state.rings.find((record) => record.ringNo.toLowerCase() === ringNo.trim().toLowerCase());
    },
    /** 同一环号的全部历史记录（含重捕 / 回收），按时间升序 */
    historyOf(state) {
      return (ringNo: string): RingRecord[] =>
        state.rings
          .filter((record) => record.ringNo.toLowerCase() === ringNo.trim().toLowerCase())
          .sort((a, b) => a.ringDate.localeCompare(b.ringDate));
    },
  },

  actions: {
    async hydrate() {
      this.rings = await db.rings.orderBy('ringDate').reverse().toArray();
      this.hydrated = true;
    },

    /**
     * 新增环志记录：
     * - 环号首次出现 → 照原流程建档（初捕）；
     * - 环号已存在 → 作为再次捕获建档，鸟种自动沿用，状态记为重捕 / 回收；
     * - 本次日期早于上一条记录时拒绝保存，返回冲突日期。
     */
    async addRing(input: RingInput): Promise<{ record?: RingRecord; conflict?: DateConflict }> {
      const history = this.historyOf(input.ringNo);
      const ringDate = input.ringDate ?? new Date().toISOString();
      let speciesCn = input.speciesCn.trim();
      let speciesSci = input.speciesSci.trim();
      let status = input.status;

      if (history.length > 0) {
        const latest = history[history.length - 1];
        if (dateOf(ringDate) < dateOf(latest.ringDate)) {
          return { conflict: { date: dateOf(latest.ringDate), bound: 'prev' } };
        }
        speciesCn = latest.speciesCn;
        speciesSci = latest.speciesSci;
        status = input.status === '回收' ? '回收' : '重捕';
      }

      const record: RingRecord = {
        id: uid('ring'),
        ringNo: input.ringNo.trim(),
        colorRing: input.colorRing || '无',
        speciesCn,
        speciesSci,
        age: input.age,
        ringDate,
        netNo: input.netNo.trim(),
        netRound: Number(input.netRound) || 1,
        status,
        ringer: input.ringer.trim(),
        siteId: input.siteId,
        sessionId: input.sessionId,
        remark: input.remark?.trim() || undefined,
      };
      await db.rings.put(toPlain(record));
      this.rings = [record, ...this.rings];
      return { record };
    },

    /** 编辑记录：日期不得越过同环号相邻记录，保存后轨迹与统计随状态自动更新 */
    async updateRing(id: string, patch: Partial<RingInput>): Promise<{ conflict?: DateConflict }> {
      const current = this.rings.find((record) => record.id === id);
      if (!current) return {};
      const next: RingRecord = { ...current, ...patch };

      const others = this.rings
        .filter((record) => record.id !== id && record.ringNo.toLowerCase() === next.ringNo.toLowerCase())
        .sort((a, b) => a.ringDate.localeCompare(b.ringDate));
      if (others.length > 0) {
        const currentDate = dateOf(current.ringDate);
        const nextDate = dateOf(next.ringDate);
        const prevRec = [...others].reverse().find((record) => dateOf(record.ringDate) <= currentDate);
        const nextRec = others.find((record) => dateOf(record.ringDate) >= currentDate);
        if (prevRec && nextDate < dateOf(prevRec.ringDate)) {
          return { conflict: { date: dateOf(prevRec.ringDate), bound: 'prev' } };
        }
        if (nextRec && nextDate > dateOf(nextRec.ringDate)) {
          return { conflict: { date: dateOf(nextRec.ringDate), bound: 'next' } };
        }
      }

      await db.rings.put(toPlain(next));
      this.rings = this.rings.map((record) => (record.id === id ? next : record));
      return {};
    },

    async removeRing(id: string) {
      await db.rings.delete(id);
      this.rings = this.rings.filter((record) => record.id !== id);
    },
  },
});
