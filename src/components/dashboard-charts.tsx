"use client";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
} from "recharts";

const SEV_COLORS: Record<string, string> = {
  Critical: "#f04444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#3b82f6",
  Informational: "#94a3b8",
};

export function SeverityDonut({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No findings yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
          {data.map((d) => (
            <Cell key={d.name} fill={SEV_COLORS[d.name] ?? "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "hsl(222 44% 9%)", border: "1px solid hsl(217 33% 17%)", borderRadius: 8, color: "#fff", fontSize: 12 }}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ data }: { data: { category: string; count: number }[] }) {
  if (data.length === 0) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">No categorized findings yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(260, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="category" width={140} tick={{ fontSize: 11, fill: "hsl(215 20% 62%)" }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "hsl(217 33% 17% / 0.4)" }}
          contentStyle={{ background: "hsl(222 44% 9%)", border: "1px solid hsl(217 33% 17%)", borderRadius: 8, color: "#fff", fontSize: 12 }}
        />
        <Bar dataKey="count" fill="hsl(210 100% 62%)" radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
