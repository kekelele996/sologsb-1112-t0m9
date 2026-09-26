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

/** 日期冲突：本次日期早于该环号时间线的上一条记录 */
export interface RingConflict {
  ringNo: string;
  /** 上一条记录日期（YYYY-MM-DD） */
  prevDate: string;
  /** 本次试图保存的日期（YYYY-MM-DD） */
  date: string;
}

interface RingState {
  rings: RingRecord[];
  hydrated: boolean;
}

const dayOf = (iso: string) => iso.slice(0, 10);

/** 环志记录与个体追踪（同一环号 = 同一个体，可多次捕获） */
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
    /**
     * 保存（新增 / 编辑）时，该环号时间线上的「上一条」记录：
     * 新增或环号变更 → 该环号当前最新一条；编辑且环号未变 → 原时间线上位于自身之前的一条。
     */
    prevForSave(state) {
      return (ringNo: string, editingId = ''): RingRecord | undefined => {
        const normalized = ringNo.trim().toLowerCase();
        if (!normalized) return undefined;
        const byDate = (list: RingRecord[]) => [...list].sort((a, b) => a.ringDate.localeCompare(b.ringDate));
        const editing = editingId ? state.rings.find((record) => record.id === editingId) : undefined;
        if (editing && editing.ringNo.toLowerCase() === normalized) {
          const full = byDate(state.rings.filter((record) => record.ringNo.toLowerCase() === normalized));
          const index = full.findIndex((record) => record.id === editingId);
          return index > 0 ? full[index - 1] : undefined;
        }
        const history = byDate(
          state.rings.filter((record) => record.ringNo.toLowerCase() === normalized && record.id !== editingId),
        );
        return history[history.length - 1];
      };
    },
  },

  actions: {
    async hydrate() {
      this.rings = await db.rings.orderBy('ringDate').reverse().toArray();
      this.hydrated = true;
    },

    /**
     * 新增环志记录：首次环志照原流程建档；同一环号再次捕获时允许追加，
     * 鸟种沿用首次建档，状态记为重捕 / 回收；日期早于上一条记录时返回冲突，不落库。
     */
    async addRing(input: RingInput): Promise<{ record?: RingRecord; conflict?: RingConflict }> {
      const ringDate = input.ringDate ?? new Date().toISOString();
      const prev = this.prevForSave(input.ringNo);
      if (prev && dayOf(ringDate) < dayOf(prev.ringDate)) {
        return { conflict: { ringNo: input.ringNo.trim(), prevDate: dayOf(prev.ringDate), date: dayOf(ringDate) } };
      }
      const first = this.historyOf(input.ringNo)[0];
      const record: RingRecord = {
        id: uid('ring'),
        ringNo: input.ringNo.trim(),
        colorRing: input.colorRing || '无',
        // 同一环号视为同一个体：鸟种自动沿用首次建档
        speciesCn: first ? first.speciesCn : input.speciesCn.trim(),
        speciesSci: first ? first.speciesSci : input.speciesSci.trim(),
        age: input.age,
        ringDate,
        netNo: input.netNo.trim(),
        netRound: Number(input.netRound) || 1,
        // 已有档案的个体再次捕获只能记为重捕 / 回收
        status: first ? (input.status === '回收' ? '回收' : '重捕') : input.status,
        ringer: input.ringer.trim(),
        siteId: input.siteId,
        sessionId: input.sessionId,
        remark: input.remark?.trim() || undefined,
      };
      await db.rings.put(toPlain(record));
      this.rings = [record, ...this.rings];
      return { record };
    },

    /** 更新记录：日期早于时间线上一条时返回冲突；保存后轨迹与统计随 state 联动更新 */
    async updateRing(id: string, patch: Partial<RingInput>): Promise<{ conflict?: RingConflict }> {
      const current = this.rings.find((record) => record.id === id);
      if (!current) return {};
      const next: RingRecord = { ...current, ...patch };
      next.ringNo = next.ringNo.trim();
      const prev = this.prevForSave(next.ringNo, id);
      if (prev && dayOf(next.ringDate) < dayOf(prev.ringDate)) {
        return { conflict: { ringNo: next.ringNo, prevDate: dayOf(prev.ringDate), date: dayOf(next.ringDate) } };
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
