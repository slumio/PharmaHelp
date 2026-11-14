"use client";

import { Alert, Skeleton } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import SearchIcon from "@mui/icons-material/Search";
import InputAdornment from "@mui/material/InputAdornment";

type Row = { medicine_id: number; name: string; rack_code: string | null; row_no: number | null; col_no: number | null };

export default function ShelvesClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [rack, setRack] = useState<string>("all");

  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/stock").then(async response => { if (!response.ok) throw new Error("Shelf data could not be loaded."); setRows(await response.json()); }).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);

  const racks = useMemo(() => [...new Set(rows.map((r) => r.rack_code ?? "?"))].sort(), [rows]);
  const filtered = useMemo(
    () => rows.filter((r) => (rack === "all" || r.rack_code === rack) && r.name.toLowerCase().includes(q.toLowerCase())),
    [rows, q, rack],
  );

  return (
    <>
      <Typography variant="h4" sx={{ fontSize: { xs: 27, md: 31 } }}>Know exactly where to look.</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: .7, mb: 3 }}>Shelf map · Find the right medicine on the right shelf, faster.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Skeleton height={100} />}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <TextField
          size="small" placeholder="Find a medicine…" value={q} onChange={(e) => setQ(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          sx={{ width: 280 }}
        />
        <ToggleButtonGroup size="small" value={rack} exclusive onChange={(_, v) => v && setRack(v)}>
          <ToggleButton value="all">All racks</ToggleButton>
          {racks.map((r) => <ToggleButton key={r} value={r}>{r}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      {(rack === "all" ? racks : [rack]).map((rc) => {
        const inRack = filtered.filter((r) => (r.rack_code ?? "?") === rc);
        const maxRow = Math.max(...rows.filter((r) => (r.rack_code ?? "?") === rc).map((r) => r.row_no ?? 0), 0) + 1;
        const maxCol = Math.max(...rows.filter((r) => (r.rack_code ?? "?") === rc).map((r) => r.col_no ?? 0), 0) + 1;
        return (
          <Paper key={rc} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="h6" gutterBottom>Rack {rc}</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(maxCol, 12)}, minmax(80px, 1fr))`, gap: 1 }}>
              {Array.from({ length: Math.min(maxRow, 20) * Math.min(maxCol, 12) }, (_, i) => {
                const rn = Math.floor(i / Math.min(maxCol, 12)), cn = i % Math.min(maxCol, 12);
                const meds = inRack.filter((r) => r.row_no === rn && r.col_no === cn);
                return (
                  <Tooltip key={i} title={meds.map((m) => m.name).join(", ") || "Empty"}>
                    <Box sx={{
                      minHeight: 80, borderRadius: 0, p: 1, fontSize: 11,
                      bgcolor: meds.length ? "primary.light" : "grey.100",
                      outline: meds.length && q && meds.some((m) => m.name.toLowerCase().includes(q.toLowerCase())) ? "2px solid" : undefined,
                      outlineColor: "warning.main", overflow: "hidden",
                    }}>
                      {meds.map((m) => <div key={m.medicine_id}>{m.name}</div>)}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Paper>
        );
      })}
      {!loading && !error && filtered.length === 0 && <Typography color="text.secondary">No medicines found. Add stock and a rack location to start building your shelf map.</Typography>}
    </>
  );
}
