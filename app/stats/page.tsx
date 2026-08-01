'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import { MODE_LABELS, QuizMode, StudyLog, WordSet } from '@/lib/types';
import NavHeader from '@/components/NavHeader';

export default function StatsPage() {
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: logData }, { data: setData }] = await Promise.all([
        supabase
          .from('study_logs')
          .select('*')
          .order('answered_at', { ascending: true }),
        supabase.from('word_sets').select('*'),
      ]);
      if (logData) setLogs(logData as StudyLog[]);
      if (setData) setSets(setData as WordSet[]);
      setLoading(false);
    })();
  }, []);

  const setNameById = useMemo(() => {
    const m = new Map<string, string>();
    sets.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sets]);

  const totalCount = logs.length;
  const totalCorrect = logs.filter((l) => l.is_correct).length;

  // 日付ごとの学習数・正答率
  const byDate = useMemo(() => {
    const map = new Map<string, { date: string; total: number; correct: number }>();
    logs.forEach((l) => {
      const date = new Date(l.answered_at).toLocaleDateString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
      });
      const entry = map.get(date) ?? { date, total: 0, correct: 0 };
      entry.total += 1;
      if (l.is_correct) entry.correct += 1;
      map.set(date, entry);
    });
    return Array.from(map.values()).map((e) => ({
      ...e,
      accuracy: e.total ? Math.round((e.correct / e.total) * 100) : 0,
    }));
  }, [logs]);

  // 単語帳ごとの学習数・正答率
  const bySet = useMemo(() => {
    const map = new Map<string, { name: string; total: number; correct: number }>();
    logs.forEach((l) => {
      const name = setNameById.get(l.set_id) ?? '(削除済み)';
      const entry = map.get(l.set_id) ?? { name, total: 0, correct: 0 };
      entry.total += 1;
      if (l.is_correct) entry.correct += 1;
      map.set(l.set_id, entry);
    });
    return Array.from(map.values()).map((e) => ({
      ...e,
      accuracy: e.total ? Math.round((e.correct / e.total) * 100) : 0,
    }));
  }, [logs, setNameById]);

  // モードごとの学習数・正答率
  const byMode = useMemo(() => {
    const map = new Map<QuizMode, { mode: QuizMode; total: number; correct: number }>();
    logs.forEach((l) => {
      const entry = map.get(l.mode) ?? { mode: l.mode, total: 0, correct: 0 };
      entry.total += 1;
      if (l.is_correct) entry.correct += 1;
      map.set(l.mode, entry);
    });
    return Array.from(map.values()).map((e) => ({
      label: MODE_LABELS[e.mode],
      total: e.total,
      accuracy: e.total ? Math.round((e.correct / e.total) * 100) : 0,
    }));
  }, [logs]);

  return (
    <main>
      <NavHeader />
      <h1 className="mb-4 text-xl font-bold">学習データ</h1>

      {loading && <p className="text-gray-400">読み込み中...</p>}

      {!loading && totalCount === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          まだ学習記録がありません。単語帳で出題を解くと、ここに記録されます。
        </div>
      )}

      {!loading && totalCount > 0 && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="総回答数" value={`${totalCount}`} />
            <StatCard label="正解数" value={`${totalCorrect}`} />
            <StatCard
              label="全体正答率"
              value={`${Math.round((totalCorrect / totalCount) * 100)}%`}
            />
          </section>

          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-3 font-bold">日別の学習推移</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={byDate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis yAxisId="left" fontSize={12} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    fontSize={12}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="total"
                    name="回答数"
                    stroke="#3466ff"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="accuracy"
                    name="正答率(%)"
                    stroke="#16a34a"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-3 font-bold">単語帳ごとの正答率</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={bySet}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis domain={[0, 100]} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="accuracy" name="正答率(%)" fill="#3466ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-3 font-bold">出題モードごとの正答率</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={byMode}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis domain={[0, 100]} fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="accuracy" name="正答率(%)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-black/5">
      <p className="text-2xl font-bold text-primary-700">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
