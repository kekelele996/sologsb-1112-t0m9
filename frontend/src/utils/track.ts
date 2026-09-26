import type { RingRecord } from '../types/ring-record';
import type { BirdSite } from '../types/bird-site';
import { distanceKm as haversineKm } from './geo';

const DAY = 86_400_000;

/** 个体追踪时间线中的一环（一次捕获） */
export interface TrackEntry {
  record: RingRecord;
  /** 与上一次捕获相隔天数（首次捕获为 null） */
  daysSincePrev: number | null;
  /** 与上一次捕获点位的直线距离 km（首次捕获或点位缺失为 null） */
  distanceKm: number | null;
  /** 是否与上一次捕获跨点 */
  moved: boolean;
}

/** 按时间排序构建同一个体的捕获轨迹：每次捕获的相隔天数、直线距离与跨点标记 */
export function buildTrack(records: RingRecord[], sites: BirdSite[]): TrackEntry[] {
  const sorted = [...records].sort((a, b) => a.ringDate.localeCompare(b.ringDate));
  const siteOf = (siteId: string) => sites.find((site) => site.id === siteId);
  return sorted.map((record, index) => {
    if (index === 0) return { record, daysSincePrev: null, distanceKm: null, moved: false };
    const prev = sorted[index - 1];
    const daysSincePrev = Math.round((new Date(record.ringDate).getTime() - new Date(prev.ringDate).getTime()) / DAY);
    const moved = record.siteId !== prev.siteId;
    const curr = siteOf(record.siteId);
    const before = siteOf(prev.siteId);
    const distanceKm = curr && before ? haversineKm(before, curr) : null;
    return { record, daysSincePrev, distanceKm, moved };
  });
}

/** 轨迹汇总：捕获次数、跨点次数、累计位移 */
export function trackSummary(entries: TrackEntry[]): { count: number; moves: number; totalKm: number } {
  const moves = entries.filter((entry) => entry.moved).length;
  const totalKm = entries.reduce((sum, entry) => sum + (entry.distanceKm ?? 0), 0);
  return { count: entries.length, moves, totalKm: Number(totalKm.toFixed(2)) };
}
