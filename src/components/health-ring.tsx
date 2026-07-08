"use client";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

function color(score: number): string {
  if (score >= 90) return "#16a34a";
  if (score >= 75) return "#ca8a04";
  if (score >= 50) return "#d97706";
  if (score >= 25) return "#ea580c";
  return "#dc2626";
}

export function HealthRing({ score, label }: { score: number; label: string }) {
  return (
    <div className="relative flex items-center justify-center">
      <RadialBarChart
        width={160}
        height={160}
        cx={80}
        cy={80}
        innerRadius={62}
        outerRadius={78}
        barSize={14}
        data={[{ name: "health", value: score, fill: color(score) }]}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar background dataKey="value" cornerRadius={8} angleAxisId={0} />
      </RadialBarChart>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold" style={{ color: color(score) }}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
