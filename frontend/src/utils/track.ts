import type { RingRecord } from '../types/ring-record';
import type { BirdSite } from '../types/bird-site';
import { distanceKm } from './geo';

const DAY = 86_400_000;

/** 个体轨迹上的一个捕获点 */
export interface TrackPoint {
  /** 时间顺序，从 1 开始 */
  seq: number;
  record: RingRecord;
  site?: BirdSite;
  /** 与上一次捕获相隔天数（首次捕获为 null） */
  daysSincePrev: number | null;
  /** 与上一次捕获点位的直线距离 km（首次或点位缺失为 null） */
  distanceFromPrev: number | null;
  /** 是否跨点（与上一次捕获点位不同） */
  moved: boolean;
}

/** 两个 ISO 日期的相隔日历天数 */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((to - from) / DAY);
}

/** 由同一环号的捕获记录构建个体轨迹（按时间升序） */
export function buildTrack(records: RingRecord[], sites: BirdSite[]): TrackPoint[] {
  const sorted = [...records].sort((a, b) => a.ringDate.localeCompare(b.ringDate));
  const siteOf = (siteId: string) => sites.find((site) => site.id === siteId);
  return sorted.map((record, index) => {
    const site = siteOf(record.siteId);
    const prev = sorted[index - 1];
    if (!prev) {
      return { seq: 1, record, site, daysSincePrev: null, distanceFromPrev: null, moved: false };
    }
    const prevSite = siteOf(prev.siteId);
    const moved = record.siteId !== prev.siteId;
    return {
      seq: index + 1,
      record,
      site,
      daysSincePrev: daysBetween(prev.ringDate, record.ringDate),
      distanceFromPrev: site && prevSite ? distanceKm(prevSite, site) : null,
      moved,
    };
  });
}

/** 轨迹概要：捕获次数、途经点位数、累计位移 km */
export function trackSummary(points: TrackPoint[]): { count: number; siteCount: number; totalKm: number } {
  const totalKm = points.reduce((sum, point) => sum + (point.distanceFromPrev ?? 0), 0);
  return {
    count: points.length,
    siteCount: new Set(points.map((point) => point.record.siteId)).size,
    totalKm: Number(totalKm.toFixed(2)),
  };
}
