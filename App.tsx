import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './services/supabaseClient';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';
import {
  Users,
  Calendar,
  MapPin,
  RefreshCw,
  AlertCircle,
  Filter,
  Lock,
  Search,
  UserX,
  CheckCircle,
} from 'lucide-react';

// --- CONFIGURATIONS ---

const PRESET_TARGETS: Record<string, number> = {
  'KETUA PENGARAH': 10,
  'TKP (PIA)': 17,
  'TKP (KP)': 19,
  'TKP (SMO)': 13,
  'FAMA KELANTAN': 10,
  'FAMA JOHOR': 15,
  'FAMA SELANGOR': 14,
  'FAMA SABAH': 20,
  'FAMA SARAWAK': 13,
  'FAMA NEGERI SEMBILAN': 11,
  'FAMA TERENGGANU': 12,
  'FAMA PAHANG': 17,
  'FAMA KEDAH': 13,
  'FAMA PERAK': 15,
  'FAMA PERLIS': 6,
  'FAMA PULAU PINANG': 8,
  'FAMA MELAKA': 8
};

// Custom Sort Order
const SORT_ORDER = [
  'KETUA PENGARAH',
  'TKP (PIA)',
  'TKP (KP)',
  'TKP (SMO)',
  'FAMA PERLIS',
  'FAMA KEDAH',
  'FAMA PULAU PINANG',
  'FAMA PERAK',
  'FAMA SELANGOR',
  'FAMA NEGERI SEMBILAN',
  'FAMA MELAKA',
  'FAMA JOHOR',
  'FAMA PAHANG',
  'FAMA TERENGGANU',
  'FAMA KELANTAN',
  'FAMA SARAWAK',
  'FAMA SABAH'
];

const COLORS = {
  primary: '#2563EB',
  secondary: '#3B82F6',
  accent: '#1E40AF',
  slate: '#64748B',
  target: '#E2E8F0',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444'
};

// --- TYPES ---
export interface AttendanceRecord {
  no_pekerja: string;
  nama: string;
  penempatan: string;
  tarikh_kehadiran: string;
  wing_negeri: string;
  sesi: string;
}

// Type untuk data dari table master list
export interface MasterRecord {
  no_pekerja: string;
  nama: string;
  wing_negeri: string;
  penempatan: string;
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
  filteredData: AttendanceRecord[];
  notRegisteredData: MasterRecord[];
}

// Type untuk lock juara
interface WinnerLock {
    state: string;
    percentage: number;
    timestamp: string; // Tambah timestamp untuk rekod bila dia menang
}

const App: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'registered' | 'not_registered'>('registered');
    
  // Data Storage
  const [rawData, setRawData] = useState<AttendanceRecord[]>([]);
  const [masterData, setMasterData] = useState<MasterRecord[]>([]);

  // Filter States
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');

  // --- UPDATED: Winner Lock Logic (By Session) ---
  // Kita simpan object: { "Sesi 1": {state: "Johor", ...}, "Sesi 2": {state: "Perak", ...} }
  const [sessionWinners, setSessionWinners] = useState<Record<string, WinnerLock>>(() => {
    try {
      const saved = localStorage.getItem('fama_session_winners_v2'); // Guna key baru version 2
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Derived lists
  const availableDates = useMemo(() => {
    const dates = new Set(rawData.map(r => r.tarikh_kehadiran).filter(Boolean));
    return Array.from(dates).sort();
  }, [rawData]);

  const availableSessions = useMemo(() => {
    let sourceData = rawData;
    if (selectedDate !== 'all') {
      sourceData = rawData.filter(r => r.tarikh_kehadiran === selectedDate);
    }
    const sessions = new Set(sourceData.map(r => r.sesi).filter(Boolean));
    return Array.from(sessions).sort();
  }, [rawData, selectedDate]);

  const availableStates = useMemo(() => {
    const states = new Set([
      ...Object.keys(PRESET_TARGETS),
      ...rawData.map(r => r.wing_negeri).filter(Boolean),
      ...masterData.map(r => r.wing_negeri).filter(Boolean)
    ] as string[]);

    return Array.from(states).sort((a, b) => {
      const indexA = SORT_ORDER.indexOf(a);
      const indexB = SORT_ORDER.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rawData, masterData]);

  useEffect(() => {
    // Reset session filter bila tukar tarikh, tapi JANGAN reset sessionWinners state
    setSelectedSession('all');
  }, [selectedDate]);

  // Main Logic
  const stats: DashboardStats = useMemo(() => {
    // 1. Filter Registered Data
    const filtered = rawData.filter(record => {
      const matchDate = selectedDate === 'all' || record.tarikh_kehadiran === selectedDate;
      const matchSession = selectedSession === 'all' || record.sesi === selectedSession;
      const matchState = selectedState === 'all' || record.wing_negeri === selectedState;
      return matchDate && matchSession && matchState;
    });

    const uniqueParticipants = new Set(filtered.map(r => r.no_pekerja));
    const totalHeadcount = uniqueParticipants.size;

    // 2. Cari Yang Belum Daftar
    let notRegistered = masterData.filter(staff => !uniqueParticipants.has(staff.no_pekerja));

    if (selectedState !== 'all') {
      notRegistered = notRegistered.filter(staff => staff.wing_negeri === selectedState);
    }

    // 3. Aggregate Counts
    const dateMap: Record<string, number> = {};
    const stateUniqueMap: Record<string, Set<string>> = {};

    filtered.forEach((record) => {
      const dateKey = record.tarikh_kehadiran ? record.tarikh_kehadiran.trim() : 'N/A';
      dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;

      const stateKey = record.wing_negeri ? record.wing_negeri.trim() : 'Lain-lain';
      if (!stateUniqueMap[stateKey]) {
        stateUniqueMap[stateKey] = new Set();
      }
      stateUniqueMap[stateKey].add(record.no_pekerja);
    });

    const dateDistribution: DateStat[] = Object.entries(dateMap).map(([date, count]) => ({
      date,
      count
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let stateKeys = Object.keys(PRESET_TARGETS);
    if (selectedState !== 'all') {
      stateKeys = [selectedState];
    }

    const stateDistribution: StateStat[] = stateKeys.map(key => {
      const count = stateUniqueMap[key] ? stateUniqueMap[key].size : 0;
      const target = PRESET_TARGETS[key] || 0;
      return {
        state: key,
        count,
        target,
        percentage: target > 0 ? Math.round((count / target) * 100) : 0
      };
    });

    stateDistribution.sort((a, b) => b.percentage - a.percentage);

    let topDay = null;
    let maxDayCount = -1;
    dateDistribution.forEach(d => {
      if (d.count > maxDayCount) {
        maxDayCount = d.count;
        topDay = d;
      }
    });

    let topState = null;
    let maxStatePct = -1;
    stateDistribution.forEach(s => {
      if (s.percentage > maxStatePct) {
        maxStatePct = s.percentage;
        topState = s;
      }
    });

    const totalTarget = selectedState === 'all' 
      ? Object.values(PRESET_TARGETS).reduce((a, b) => a + b, 0)
      : (PRESET_TARGETS[selectedState] || 0);

    const overallPercentage = totalTarget > 0 
      ? Math.round((totalHeadcount / totalTarget) * 100) 
      : 0;

    return {
      totalParticipants: totalHeadcount,
      totalTarget,
      overallPercentage,
      topDay,
      topState,
      dateDistribution,
      stateDistribution,
      filteredData: filtered,
      notRegisteredData: notRegistered
    };
  }, [rawData, masterData, selectedDate, selectedSession, selectedState]);

  // --- UPDATED: Lock Winner Logic (Per Session) ---
  useEffect(() => {
    // 1. Tentukan key sesi sekarang. Kalau 'all', kita boleh guna key 'OVERALL' atau nama sesi 'all'
    // Tapi user request: "JUARA SESI", jadi better lock bila user pilih spesifik sesi.
    // Kalau user pilih 'all', kita tak lock, atau kita tunjuk overall leader tanpa lock.
    // UNTUK KES NI: Kita akan lock 'all' juga sebagai satu entiti kalau ada yang capai 100% overall.
    const currentSessionKey = selectedSession;

    // 2. Check kalau sesi ni dah ada pemenang
    if (sessionWinners[currentSessionKey]) return;

    // 3. Cari pemenang baru dalam stats semasa
    const champion = stats.stateDistribution.find(s => s.percentage >= 100);
    
    if (champion) {
      const winnerData: WinnerLock = { 
        state: champion.state, 
        percentage: champion.percentage,
        timestamp: new Date().toISOString()
      };

      const updatedWinners = {
        ...sessionWinners,
        [currentSessionKey]: winnerData
      };

      setSessionWinners(updatedWinners);
      localStorage.setItem('fama_session_winners_v2', JSON.stringify(updatedWinners));
    }
  }, [stats.stateDistribution, selectedSession, sessionWinners]);

  // Helper untuk dapatkan juara sesi semasa (untuk display)
  const currentSessionWinner = sessionWinners[selectedSession];

  // --- FETCH DATA ---

  useEffect(() => {
    const fetchMasterList = async () => {
      if (!supabase) return;
      
      const { data, error } = await supabase
        .from('senarai_peserta_penuh')
        .select('no_pekerja, nama, wing_negeri, penempatan');
        
      if (error) {
        console.error('Error fetching master list:', error);
      } else if (data) {
        setMasterData(data as MasterRecord[]);
      }
    };

    fetchMasterList();
  }, []);

  const fetchAttendanceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error('Supabase configuration missing.');

      const { data, error: supabaseError } = await supabase
        .from('pendaftaran')
        .select('no_pekerja, nama, penempatan, tarikh_kehadiran, wing_negeri, sesi');

      if (supabaseError) throw supabaseError;

      if (data) {
        setRawData(data as AttendanceRecord[]);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Gagal mendapatkan data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendanceData();
    const intervalId = setInterval(fetchAttendanceData, 30000);
    return () => clearInterval(intervalId);
  }, [fetchAttendanceData]);

  // Helper Functions
  const formatDate = (dateString: string) => {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
      const d = new Date(dateString);
      return new Intl.DateTimeFormat('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    } catch (e) {
      return dateString;
    }
  };

  const handleStateClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length) {
      const stateName = data.activePayload[0].payload.state;
      setSelectedState(current => current === stateName ? 'all' : stateName);
    }
  };

  const handleDateClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length) {
      const dateValue = data.activePayload[0].payload.date;
      setSelectedDate(current => current === dateValue ? 'all' : dateValue);
    }
  };

  const CustomBarLabel = (props: any) => {
    const { x, y, width, height, index } = props;
    const item = stats.stateDistribution[index];
    if (!item) return null;
    let labelX = x + width + 8;
    if (item.target > 0) {
      const pixelsPerUnit = width / item.target;
      const countWidth = item.count * pixelsPerUnit;
      if (countWidth > width) labelX = x + countWidth + 8;
    }
    return (
      <text x={labelX} y={y + height / 2 + 1} fill="#334155" textAnchor="start" dominantBaseline="middle" fontSize={11} fontWeight="bold">
        {`${item.count}/${item.target}`}
      </text>
    );
  };

  const CustomComparisonTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm p-4 border border-slate-100 shadow-xl rounded-xl ring-1 ring-slate-200/50">
          <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2">{label}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-500">Sasaran:</span>
              <span className="font-mono font-medium text-slate-700">{data.target}</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-500">Hadir:</span>
              <span className="font-mono font-bold text-blue-600 text-lg">{data.count}</span>
            </div>
            <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs font-medium text-slate-400">Pencapaian</span>
              <span className={`font-bold ${data.percentage >= 100 ? 'text-emerald-600' : (data.percentage >= 80 ? 'text-blue-600' : 'text-amber-600')}`}>
                {data.percentage}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const CustomDateTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-sm p-4 border border-slate-100 shadow-xl rounded-xl ring-1 ring-slate-200/50">
           <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Tarikh</p>
           <p className="font-bold text-slate-800 mb-3">{formatDate(label)}</p>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
             <span className="text-slate-600 text-sm">Jumlah:</span>
             <span className="font-mono font-bold text-indigo-600 text-lg">{payload[0].value}</span>
           </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm backdrop-blur-md bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
                Dashboard Kehadiran
              </h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider flex items-center gap-1">
                Konvensyen FAMA <span className="w-1 h-1 rounded-full bg-slate-300"></span> Live Data
              </p>
            </div>
          </div>
           
          <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
               <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Kemaskini Terakhir</p>
               <p className="text-sm font-medium text-slate-700 font-mono">
                 {lastUpdated.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
               </p>
              </div>
              
              <button
                onClick={fetchAttendanceData}
                disabled={loading}
                className="group flex items-center space-x-2 bg-white border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-600 px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : 'group-hover:text-blue-500'}`} />
                <span className="hidden sm:inline font-medium">Muat Semula</span>
              </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Filters Bar */}
        <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-col sm:flex-row items-center justify-between">
          <div className="px-4 py-3 flex items-center gap-2 text-slate-600 font-medium border-b sm:border-b-0 sm:border-r border-slate-100 w-full sm:w-auto">
            <div className="p-1.5 bg-slate-100 rounded-lg">
               <Filter className="w-4 h-4 text-slate-500" />
            </div>
            <span className="text-sm">Tapisan Data</span>
          </div>
           
          <div className="flex flex-col sm:flex-row w-full sm:w-auto p-2 gap-2">
            <select 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="block w-full sm:w-48 pl-3 pr-8 py-2 text-sm bg-slate-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-xl transition-all cursor-pointer hover:bg-slate-100"
            >
              <option value="all">📅 Semua Tarikh</option>
              {availableDates.map(date => (
                <option key={date} value={date}>{formatDate(date)}</option>
              ))}
            </select>

            <select 
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="block w-full sm:w-48 pl-3 pr-8 py-2 text-sm bg-slate-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-xl transition-all cursor-pointer hover:bg-slate-100"
            >
              <option value="all">⏰ Semua Sesi</option>
              {availableSessions.map(sesi => (
                <option key={sesi} value={sesi}>{sesi}</option>
              ))}
            </select>

            <select 
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="block w-full sm:w-64 pl-3 pr-8 py-2 text-sm bg-slate-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-xl transition-all cursor-pointer hover:bg-slate-100"
            >
              <option value="all">🏢 Semua Wing/Negeri</option>
              {availableStates.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-100 p-4 mb-8 rounded-xl flex items-center gap-3 text-red-700 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Card 1 */}
          <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 p-6 relative overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
              <Users className="w-32 h-32 text-blue-600" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                   <Users className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jumlah Kehadiran (Unik)</p>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold text-slate-900 tracking-tight">
                  {stats.totalParticipants.toLocaleString()}
                </span>
                <span className="text-sm text-slate-400 font-medium">
                  / {stats.totalTarget.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-4">
                 <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                   stats.overallPercentage >= 100 ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                 }`}>
                  {stats.overallPercentage}% Pencapaian
                </span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${stats.overallPercentage >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(stats.overallPercentage, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-slate-100 p-6 relative overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
             <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
              <Calendar className="w-32 h-32 text-emerald-600" />
            </div>
            <div className="relative z-10">
               <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                   <Calendar className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kehadiran Tertinggi (Hari)</p>
              </div>
              <div className="mb-2">
                <span className="text-3xl font-bold text-slate-900 block truncate tracking-tight">
                  {stats.topDay ? formatDate(stats.topDay.date) : '-'}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                <span className="text-sm font-bold text-emerald-700">
                   {stats.topDay ? stats.topDay.count.toLocaleString() : 0}
                </span>
                <span className="text-xs text-emerald-600">Check-in</span>
              </div>
            </div>
          </div>

          {/* Card 3 (With Session Lock Logic) */}
          <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(99,102,241,0.1)] border border-slate-100 p-6 relative overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
              <MapPin className="w-32 h-32 text-indigo-600" />
            </div>
             <div className="relative z-10">
               <div className="flex items-center gap-2 mb-3">
                <div className={`p-2 rounded-lg ${currentSessionWinner ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                   {currentSessionWinner ? <Lock className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div className="flex flex-col">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {currentSessionWinner ? 'JUARA (Pertama 100%)' : 'Wing / Negeri Terbaik'}
                  </p>
                  {/* Tunjuk Sesi apa yg dilock */}
                  {selectedSession !== 'all' && (
                    <span className="text-[10px] text-slate-400 font-mono uppercase">{selectedSession}</span>
                  )}
                </div>
              </div>
              <div className="mb-2">
                <span className="text-3xl font-bold text-slate-900 block truncate tracking-tight">
                  {currentSessionWinner 
                    ? currentSessionWinner.state 
                    : (stats.topState ? stats.topState.state : '-')}
                </span>
              </div>
               <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${currentSessionWinner ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-100'}`}>
                <span className={`text-sm font-bold ${currentSessionWinner ? 'text-amber-700' : 'text-indigo-700'}`}>
                   {currentSessionWinner 
                     ? currentSessionWinner.percentage 
                     : (stats.topState ? stats.topState.percentage : 0)}%
                </span>
                <span className={`text-xs ${currentSessionWinner ? 'text-amber-600' : 'text-indigo-600'}`}>Pencapaian</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  Prestasi Mengikut Wing / Negeri
                  {selectedState !== 'all' && <span className="text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Filtered</span>}
                </h2>
                <p className="text-sm text-slate-500 mt-1">Carta menunjukkan jumlah kehadiran (unik) berbanding sasaran.</p>
              </div>
            </div>
             
            <div className="h-[600px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  layout="vertical" 
                  data={stats.stateDistribution} 
                  margin={{ top: 5, right: 60, left: 100, bottom: 5 }}
                  onClick={handleStateClick}
                  className="cursor-pointer"
                >
                  <defs>
                    <linearGradient id="barGradientBlue" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#2563EB" />
                    </linearGradient>
                    <linearGradient id="barGradientGreen" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="barGradientAmber" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#F59E0B" />
                      <stop offset="100%" stopColor="#D97706" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <YAxis type="category" dataKey="state" yAxisId="0" width={180} tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="state" yAxisId="1" orientation="left" width={180} hide />
                  <XAxis type="number" hide />
                  <Tooltip content={<CustomComparisonTooltip />} cursor={{ fill: '#f8fafc', opacity: 0.8 }} />
                  <Bar dataKey="target" name="Sasaran" yAxisId="0" fill={COLORS.target} radius={[0, 8, 8, 0]} barSize={24} animationDuration={1500}>
                    <LabelList content={<CustomBarLabel />} />
                  </Bar>
                  <Bar dataKey="count" name="Hadir" yAxisId="1" radius={[0, 6, 6, 0]} barSize={14} animationDuration={1500}>
                    {
                      stats.stateDistribution.map((entry, index) => {
                        let fillUrl = "url(#barGradientBlue)";
                        if (entry.percentage >= 100) fillUrl = "url(#barGradientGreen)";
                        else if (entry.percentage < 80) fillUrl = "url(#barGradientAmber)";
                        const isSelected = selectedState !== 'all' && selectedState === entry.state;
                        const opacity = selectedState === 'all' || isSelected ? 1 : 0.3;
                        return <Cell key={`cell-${index}`} fill={fillUrl} style={{ opacity, transition: 'opacity 0.3s ease' }} />;
                      })
                    }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
            <div className="mb-8 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Trend Kehadiran Harian
                {selectedDate !== 'all' && <span className="text-xs font-normal px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">Filtered</span>}
              </h2>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dateDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 20 }} onClick={handleDateClick} className="cursor-pointer">
                  <defs>
                    <linearGradient id="dateGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.6}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomDateTooltip />} cursor={{ fill: '#f1f5f9', opacity: 0.6 }} />
                  <Bar dataKey="count" name="Kehadiran" fill="url(#dateGradient)" radius={[8, 8, 0, 0]} barSize={60} animationDuration={1500}>
                      {
                        stats.dateDistribution.map((entry, index) => {
                          const isSelected = selectedDate !== 'all' && selectedDate === entry.date;
                          const opacity = selectedDate === 'all' || isSelected ? 1 : 0.4;
                          return <Cell key={`cell-${index}`} fill="url(#dateGradient)" style={{ opacity, transition: 'opacity 0.3s ease' }} />;
                        })
                      }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* --- DUAL TAB TABLE SECTION --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-12">
           {/* Tab Header */}
           <div className="flex border-b border-slate-200">
             <button
               onClick={() => setActiveTab('registered')}
               className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                 activeTab === 'registered' 
                   ? 'bg-white text-blue-600 border-b-2 border-blue-600' 
                   : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
               }`}
             >
               <CheckCircle className="w-4 h-4" />
               Hadir ({stats.filteredData.length})
             </button>
             <button
               onClick={() => setActiveTab('not_registered')}
               className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 ${
                 activeTab === 'not_registered' 
                   ? 'bg-white text-red-600 border-b-2 border-red-600' 
                   : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
               }`}
             >
               <UserX className="w-4 h-4" />
               Belum Hadir ({stats.notRegisteredData.length})
             </button>
           </div>
           
           {/* Tab Content */}
           <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
             {activeTab === 'registered' ? (
               // --- TABLE: YANG DAH DAFTAR ---
               <table className="w-full text-left border-collapse">
                 <thead className="bg-slate-50 sticky top-0 z-10">
                   <tr>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-16">Bil</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">No Pekerja</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Nama</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Wing / Negeri</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Penempatan</th>
                     <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Tarikh / Sesi</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {stats.filteredData.length > 0 ? (
                     stats.filteredData.map((record, index) => (
                       <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                         <td className="px-6 py-4 text-sm text-slate-500 font-mono">{index + 1}</td>
                         <td className="px-6 py-4 text-sm font-medium text-slate-900">{record.no_pekerja}</td>
                         <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                           {record.nama || <span className="text-slate-400 italic">Tiada Nama</span>}
                         </td>
                         <td className="px-6 py-4 text-sm text-slate-600">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                             {record.wing_negeri}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-sm text-slate-600">
                           {record.penempatan || '-'}
                         </td>
                         <td className="px-6 py-4 text-sm text-slate-500">
                           <div className="flex flex-col">
                             <span>{formatDate(record.tarikh_kehadiran)}</span>
                             <span className="text-xs text-slate-400">{record.sesi}</span>
                           </div>
                         </td>
                       </tr>
                     ))
                   ) : (
                     <tr>
                       <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                         <div className="flex flex-col items-center justify-center gap-2">
                           <Search className="w-8 h-8 opacity-20" />
                           <p>Tiada rekod kehadiran dijumpai.</p>
                         </div>
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             ) : (
               // --- TABLE: BELUM DAFTAR ---
               <table className="w-full text-left border-collapse">
                 <thead className="bg-red-50 sticky top-0 z-10">
                   <tr>
                     <th className="px-6 py-4 text-xs font-semibold text-red-700 uppercase tracking-wider border-b border-red-200 w-16">Bil</th>
                     <th className="px-6 py-4 text-xs font-semibold text-red-700 uppercase tracking-wider border-b border-red-200">No Pekerja</th>
                     <th className="px-6 py-4 text-xs font-semibold text-red-700 uppercase tracking-wider border-b border-red-200">Nama</th>
                     <th className="px-6 py-4 text-xs font-semibold text-red-700 uppercase tracking-wider border-b border-red-200">Wing / Negeri</th>
                     <th className="px-6 py-4 text-xs font-semibold text-red-700 uppercase tracking-wider border-b border-red-200">Penempatan</th>
                     <th className="px-6 py-4 text-xs font-semibold text-red-700 uppercase tracking-wider border-b border-red-200">Status</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-red-100 bg-red-50/10">
                   {stats.notRegisteredData.length > 0 ? (
                     stats.notRegisteredData.map((record, index) => (
                       <tr key={index} className="hover:bg-red-50 transition-colors">
                         <td className="px-6 py-4 text-sm text-slate-500 font-mono">{index + 1}</td>
                         <td className="px-6 py-4 text-sm font-medium text-slate-900">{record.no_pekerja}</td>
                         <td className="px-6 py-4 text-sm text-slate-700 font-medium">{record.nama}</td>
                         <td className="px-6 py-4 text-sm text-slate-600">
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                             {record.wing_negeri}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-sm text-slate-600">
                           {record.penempatan || '-'}
                         </td>
                         <td className="px-6 py-4 text-sm text-red-500 font-bold italic">
                           Belum Hadir
                         </td>
                       </tr>
                     ))
                   ) : (
                     <tr>
                       <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                         <div className="flex flex-col items-center justify-center gap-2">
                           <CheckCircle className="w-8 h-8 text-green-500" />
                           <p className="text-green-600 font-medium">Semua peserta dalam senarai telah hadir!</p>
                         </div>
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             )}
           </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-8 pb-4 text-center">
          <p className="text-sm text-slate-400 font-medium">
            &copy; {new Date().getFullYear()} Lembaga Pemasaran Pertanian Persekutuan (FAMA). Hak Cipta Terpelihara.
          </p>
        </div>
      </main>
    </div>
  );
};

export default App;
