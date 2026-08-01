import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement
);

type TelemetryPoint = {
  altitude: number;
  speed: number;
};

export default function TelemetryChart({
  data,
}: {
  data: TelemetryPoint[];
}) {
  return (
    <div style={{ marginTop: 30 }}>
      <Line
        data={{
          labels: data.map((_, index) => index),
          datasets: [
            {
              label: "Altitude (m)",
              data: data.map((d) => d.altitude),
              borderColor: "#22c55e",
              tension: 0.4,
            },
            {
              label: "Speed (m/s)",
              data: data.map((d) => d.speed),
              borderColor: "#38bdf8",
              tension: 0.4,
            },
          ],
        }}
        options={{
          responsive: true,
          plugins: {
            legend: {
              labels: {
                color: "white",
              },
            },
          },
          scales: {
            x: {
              ticks: { color: "white" },
            },
            y: {
              ticks: { color: "white" },
            },
          },
        }}
      />
    </div>
  );
}

