/**
 * Lazy wrapper for TelemetryChart
 * ✅ Defers chart.js library loading until component is actually rendered
 * This keeps chart.js out of the main bundle
 */

import { Suspense, lazy } from 'react';

const TelemetryChart = lazy(() => import('./TelemetryChart'));

interface LazyTelemetryChartProps {
  data: { altitude: number; speed: number }[];
}

export default function LazyTelemetryChart({ data }: LazyTelemetryChartProps) {
  return (
    <Suspense fallback={
      <div style={{ marginTop: 30, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <p>Loading chart...</p>
      </div>
    }>
      <TelemetryChart data={data} />
    </Suspense>
  );
}
