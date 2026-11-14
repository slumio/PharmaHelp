"use client";

import { useEffect, useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import Chip from "@mui/material/Chip";
import { LineChart } from "@mui/x-charts/LineChart";
import type { Metrics } from "@/lib/queries";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

function Stat({ title, value, tone }: { title: string; value: string; tone?: "warn" }) {
  return (
    <Card>
      <CardContent>
        <Typography color="text.secondary" variant="body2">{title}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, color: tone === "warn" ? "warning.dark" : "text.primary" }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function DashboardClient() {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    fetch("/api/metrics").then((r) => r.json()).then((j: Metrics) => setM(j));
  }, []);
  if (!m) return <Typography>Loading…</Typography>;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}><Stat title="Today's revenue" value={inr(m.todayRevenue)} /></Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}><Stat title="Orders today" value={String(m.todayOrders)} /></Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}><Stat title="Expiring in 90 days" value={`${inr(m.expiry90.value)} (${m.expiry90.count})`} tone="warn" /></Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}><Stat title="Low stock items" value={String(m.lowStockCount)} tone="warn" /></Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}><Stat title="Credit (udhaar) outstanding" value={inr(m.creditOutstanding)} /></Grid>

      <Grid size={{ xs: 12, md: 7 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>30-day revenue</Typography>
            <LineChart
              height={260}
              xAxis={[{ scaleType: "point", data: m.trend.map((t: { day: string }) => t.day.slice(5)), tickLabelStyle: { fontSize: 10 } }]}
              series={[{ data: m.trend.map((t: { revenue: number }) => t.revenue), area: true, showMark: false }]}
            />
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>Top movers (30 days)</Typography>
            <Table size="small">
              <TableHead><TableRow><TableCell>Medicine</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Revenue</TableCell></TableRow></TableHead>
              <TableBody>
                {m.topMovers.map((t: { name: string; qty: number; revenue: number }) => (
                  <TableRow key={t.name}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell align="right">{t.qty}</TableCell>
                    <TableCell align="right">{inr(t.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Chip label="Slow movers: " size="small" sx={{ mt: 2, display: "none" }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Slow movers: {m.slowMovers.map((s: { name: string }) => s.name).join(", ")}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
