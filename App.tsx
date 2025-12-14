import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './services/supabaseClient';
import { AttendanceRecord, DashboardStats, DateStat, StateStat } from './types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ReferenceLine,
  LabelList
} from 'recharts';
import {
  Users,
  Calendar,
  MapPin,
  RefreshCw,
  AlertCircle,
  Filter,
  Clock,
  ChevronRight
} from 'lucide-react';

// Preset Targets configuration
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
  'FAMA NEGERI SEMBILAN': 12,
  'FAMA TERENGGANU': 12,
  'FAMA PAHANG': 17,
  'FAMA KEDAH': 13,
  'FAMA PERAK': 15,
  'FAMA PERLIS': 6,
  'FAMA PULAU PINANG': 8,
  'FAMA MELAKA': 8
};

const COLORS = {
  primary: '#2563EB', // Blue 600
  secondary: '#3B82F6', // Blue 500
  accent: '#1E40AF',    // Blue 800
  slate: '#64748B',     // Slate 500
  target: '#E2E8F0',    // Slate 200 (lighter for target background)
  success: '#10B981',   // Emerald 500
  warning: '#F59E0B',   // Amber 500
  danger: '#EF4444'     // Red 500
};

const App: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  // Raw data storage
  const [rawData, setRawData] = useState<AttendanceRecord[]>([]);

  // Filter States
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');

  // Derived lists for dropdowns
  const availableDates = useMemo(() => {
    const dates = new Set(rawData.map(r => r.tarikh_kehadiran).filter(Boolean));
    return Array.from(dates).sort();
  }, [rawData]);

  const availableSessions = useMemo(() => {
    let sourceData = rawData;
    
    // Filter sessions based on selected date
    if (selectedDate !== 'all') {
      sourceData = rawData.filter(r => r.tarikh_kehadiran === selectedDate);
    }

    const sessions = new Set(sourceData.map(r => r.sesi).filter(Boolean));
    return Array.from(sessions).sort();
  }, [rawData, selectedDate]);

  const availableStates = useMemo(() => {
    // Merge preset keys with actual data to ensure all are covered
    const states = new Set([
      ...Object.keys(PRESET_TARGETS),
      ...rawData.map(r => r.wing_negeri).filter(Boolean)
    ] as string[]);
    return Array.from(states).sort();
  }, [rawData]);

  // Reset selected session when date changes
  useEffect(() => {
    setSelectedSession('all');
  }, [selectedDate]);

  // Main Processing Logic with Filters
  const stats: DashboardStats = useMemo(() => {
    // 1. Filter Data
    const filtered = rawData.filter(record => {
      const matchDate = selectedDate === 'all' || record.tarikh_kehadiran === selectedDate;
      const matchSession = selectedSession === 'all' || record.sesi === selectedSession;
      const matchState = selectedState === 'all' || record.wing_negeri === selectedState;
      return matchDate && matchSession && matchState;
    });

    // 2. Aggregate Counts
    const totalParticipants = filtered.length;
    const dateMap: Record<string, number> = {};
    const stateMap: Record<string, number> = {};

    filtered.forEach((record) => {
      // Date - Using tarikh_kehadiran
      const dateKey = record.tarikh_kehadiran ? record.tarikh_kehadiran.trim() : 'N/A';
      dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;

      // State
      const stateKey = record.wing_negeri ? record.wing_negeri.trim() : 'Lain-lain';
      stateMap[stateKey] = (stateMap[stateKey] || 0) + 1;
    });

    // 3. Transform to Arrays
    const dateDistribution: DateStat[] = Object.entries(dateMap).map(([date, count]) => ({
      date,
      count
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 4. State Distribution with Targets
    // We want to show ALL preset states even if count is 0, unless a specific state filter is active
    let stateKeys = Object.keys(PRESET_TARGETS);
    
    // If a specific state is selected, only show that one
    if (selectedState !== 'all') {
      stateKeys = [selectedState];
    }

    const stateDistribution: StateStat[] = stateKeys.map(key => {
      const count = stateMap[key] || 0;
      const target = PRESET_TARGETS[key] || 0; // Default to 0 if not in preset (e.g. 'Lain-lain')
      return {
        state: key,
        count,
        target,
        percentage: target > 0 ? Math.round((count / target) * 100) : 0
      };
    });

    // Sort by Percentage descending, then by Count
    stateDistribution.sort((a, b) => b.percentage - a.percentage);

    // 5. KPIs
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

    // Calculate Total Target based on filters
    // If 'all' states selected, sum all targets. If specific state, take that target.
    const totalTarget = selectedState === 'all' 
      ? Object.values(PRESET_TARGETS).reduce((a, b) => a + b, 0)
      : (PRESET_TARGETS[selectedState] || 0);

    const overallPercentage = totalTarget > 0 
      ? Math.round((totalParticipants / totalTarget) * 100) 
      : 0;

    return {
      totalParticipants,
      totalTarget,
      overallPercentage,
      topDay,
      topState,
      dateDistribution,
      stateDistribution
    };
  }, [rawData, selectedDate, selectedSession, selectedState]);

  const fetchAttendanceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) {
        throw new Error('Supabase configuration missing.');
      }

      // Fetch 'sesi' and 'tarikh_kehadiran'
      const { data, error: supabaseError } = await supabase
        .from('pendaftaran')
        .select('no_pekerja, tarikh_kehadiran, wing_negeri, sesi');

      if (supabaseError) {
        throw supabaseError;
      }

      if (data) {
        setRawData(data as AttendanceRecord[]);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Gagal mendapatkan data dari pangkalan data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendanceData();
    const intervalId = setInterval(fetchAttendanceData, 30000);
    return () => clearInterval(intervalId);
  }, [fetchAttendanceData]);

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
      const d = new Date(dateString);
      return new Intl.DateTimeFormat('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    } catch (e) {
      return dateString;
    }
  };

  // Interactive Click Handlers
  const handleStateClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length) {
      const stateName = data.activePayload[0].payload.state;
      // Toggle selection: if already selected, clear it.
      setSelectedState(current => current === stateName ? 'all' : stateName);
    }
  };

  const handleDateClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length) {
      const dateValue = data.activePayload[0].payload.date;
      // Toggle selection
      setSelectedDate(current => current === dateValue ? 'all' : dateValue);
    }
  };

  // Custom Label for the Bar Chart
  const CustomBarLabel = (props: any) => {
    const { x, y, width, height, index } = props;
    const item = stats.stateDistribution[index];
    
    if (!item) return null;

    // We attach this to the 'target' bar.
    // width represents item.target in pixels.
    let labelX = x + width + 8;

    // Handle case where count > target (Bar overflow)
    // We assume linear scale starting at 0.
    if (item.target > 0) {
      const pixelsPerUnit = width / item.target;
      const countWidth = item.count * pixelsPerUnit;
      if (countWidth > width) {
         labelX = x + countWidth + 8;
      }
    }

    return (
      <text 
        x={labelX} 
        y={y + height / 2 + 1} 
        fill="#334155" 
        textAnchor="start" 
        dominantBaseline="middle"
        fontSize={11}
        fontWeight="bold"
      >
        {`${item.count}/${item.target}`}
      </text>
    );
  };

  // Custom Tooltip for Comparison Chart
  const CustomComparisonTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Payload[0] is typically the target (axis 0), Payload[1] is actual (axis 1) or vice versa depending on render order
      // We can grab the full data object from either payload
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
            {/* Date Filter */}
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

            {/* Session Filter */}
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

            {/* State Filter */}
            <select 
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="block w-full sm:w-64 pl-3 pr-8 py-2 text-sm bg-slate-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-xl transition-all cursor-pointer hover:bg-slate-100"
            >
              <option value="all">🏢 Semua Negeri</option>
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
          {/* Card 1: Total Attendance vs Target */}
          <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 p-6 relative overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
              <Users className="w-32 h-32 text-blue-600" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                   <Users className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jumlah Kehadiran Keseluruhan</p>
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

          {/* Card 2: Highest Day */}
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
                <span className="text-xs text-emerald-600">Peserta</span>
              </div>
            </div>
          </div>

          {/* Card 3: Best Percentage State */}
          <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(99,102,241,0.1)] border border-slate-100 p-6 relative overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
              <MapPin className="w-32 h-32 text-indigo-600" />
            </div>
             <div className="relative z-10">
               <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                   <MapPin className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Wing / Negeri Terbaik</p>
              </div>
              
              <div className="mb-2">
                <span className="text-3xl font-bold text-slate-900 block truncate tracking-tight">
                  {stats.topState ? stats.topState.state : '-'}
                </span>
              </div>
              
               <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-100">
                <span className="text-sm font-bold text-indigo-700">
                   {stats.topState ? stats.topState.percentage : 0}%
                </span>
                <span className="text-xs text-indigo-600">Pencapaian</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          
           {/* Chart 1: State Performance vs Target (Overlapping Bar) */}
           <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  Prestasi Mengikut Wing / Negeri
                  {selectedState !== 'all' && <span className="text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Filtered</span>}
                </h2>
                <p className="text-sm text-slate-500 mt-1">Carta menunjukkan jumlah kehadiran berbanding sasaran.</p>
              </div>
              <div className="mt-4 sm:mt-0 flex items-center gap-6 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 border border-amber-200"></div>
                  <span>Hadir</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-3 rounded-full bg-slate-200"></div>
                  <span>Sasaran</span>
                </div>
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
                  
                  {/* Axis 0: Visible Labels (for layout reference) */}
                  <YAxis 
                    type="category" 
                    dataKey="state" 
                    yAxisId="0" 
                    width={180}
                    tick={{ fontSize: 12, fill: '#475569', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  
                  {/* Axis 1: Hidden, Duplicate for Overlap Alignment */}
                  <YAxis 
                    type="category" 
                    dataKey="state" 
                    yAxisId="1" 
                    orientation="left" 
                    width={180} 
                    hide 
                  />

                  <XAxis type="number" hide />
                  
                  <Tooltip 
                    content={<CustomComparisonTooltip />} 
                    cursor={{ fill: '#f8fafc', opacity: 0.8 }} 
                  />
                  
                  {/* Target Bar (Background) - Wider */}
                  <Bar 
                    dataKey="target" 
                    name="Sasaran" 
                    yAxisId="0"
                    fill={COLORS.target} 
                    radius={[0, 8, 8, 0]} 
                    barSize={24} 
                    animationDuration={1500}
                  >
                    <LabelList content={<CustomBarLabel />} />
                  </Bar>
                  
                  {/* Actual Bar (Foreground) - Thinner, Rendered ON TOP via second axis or just order */}
                  <Bar 
                    dataKey="count" 
                    name="Hadir" 
                    yAxisId="1"
                    radius={[0, 6, 6, 0]} 
                    barSize={14}
                    animationDuration={1500}
                  >
                    {
                      stats.stateDistribution.map((entry, index) => {
                        let fillUrl = "url(#barGradientBlue)";
                        if (entry.percentage >= 100) fillUrl = "url(#barGradientGreen)";
                        else if (entry.percentage < 80) fillUrl = "url(#barGradientAmber)";
                        
                        // Highlight selected state visually
                        const isSelected = selectedState !== 'all' && selectedState === entry.state;
                        const opacity = selectedState === 'all' || isSelected ? 1 : 0.3;

                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={fillUrl} 
                            style={{ opacity, transition: 'opacity 0.3s ease' }}
                          />
                        );
                      })
                    }
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Date Trend */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
            <div className="mb-8 border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Trend Kehadiran Harian
                {selectedDate !== 'all' && <span className="text-xs font-normal px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">Filtered</span>}
              </h2>
              <p className="text-sm text-slate-500 mt-1">Klik pada bar tarikh untuk menapis data mengikut hari.</p>
            </div>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={stats.dateDistribution} 
                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  onClick={handleDateClick}
                  className="cursor-pointer"
                >
                  <defs>
                    <linearGradient id="dateGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0.6}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    tick={{ fontSize: 12, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    content={<CustomDateTooltip />}
                    cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                  />
                  <Bar 
                    dataKey="count" 
                    name="Kehadiran" 
                    fill="url(#dateGradient)" 
                    radius={[8, 8, 0, 0]} 
                    barSize={60}
                    animationDuration={1500}
                  >
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
