export interface AttendanceRecord {
  no_pekerja: string;
  tarikh_kehadiran: string;
  fama_negeri: string | null;
  sesi: string | null;
}

export interface DateStat {
  date: string;
  count: number;
}

export interface StateStat {
  state: string;
  count: number;
  target: number;
  percentage: number;
}

export interface DashboardStats {
  totalParticipants: number;
  totalTarget: number;
  overallPercentage: number;
  topDay: DateStat | null;
  topState: StateStat | null;
  dateDistribution: DateStat[];
  stateDistribution: StateStat[];
}