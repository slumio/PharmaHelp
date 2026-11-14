"use client";

import { useRef, useState } from "react";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

type Item = { id: number; name: string; packSize: string; batchNo: string; expiryDate: string; qty: number; mrp: number; purchasePrice: number };
const toRows = (items: Omit<Item, "id">[]): Item[] => items.map((i, idx) => ({ ...i, id: idx }));

export default function ImportClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [supplier, setSupplier] = useState("");
  const [source, setSource] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const extract = async (body: FormData) => {
    setErr(""); setDone("");
    const r = await fetch("/api/bills", { method: "POST", body });
    const j = await r.json();
    if (!r.ok) { setErr(j.error?.message ?? "Extraction failed"); return; }
    setSupplier(j.supplierName);
    setSource(j.source);
    setItems(toRows(j.items));
  };

  const onImage = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    await extract(fd);
  };
  const onCsv = async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    await extract(fd);
  };

  const confirm = async () => {
    const r = await fetch("/api/bills", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierName: supplier, items: items.map(({ id, ...rest }) => rest) }),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error?.message ?? "Insert failed"); return; }
    setDone(`Bill saved: ${j.items} items, ${j.unitsAdded} units added to stock, total ₹${j.total}`);
    setItems([]); setSupplier("");
  };

  const cols: GridColDef[] = [
    { field: "name", headerName: "Medicine", flex: 1.2, editable: true },
    { field: "packSize", headerName: "Pack", width: 110, editable: true },
    { field: "batchNo", headerName: "Batch", width: 100, editable: true },
    { field: "expiryDate", headerName: "Expiry", width: 120, editable: true },
    { field: "qty", headerName: "Qty", width: 80, type: "number", editable: true },
    { field: "mrp", headerName: "MRP", width: 90, type: "number", editable: true },
    { field: "purchasePrice", headerName: "Purchase", width: 100, type: "number", editable: true },
  ];

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Bills & Import</Typography>
      <Typography color="text.secondary">
        Upload a supplier bill photo (AI extracts the line items) or a CSV — review the table, then confirm to add stock.
      </Typography>
      {err && <Alert severity="error">{err}</Alert>}
      {done && <Alert severity="success">{done}</Alert>}
      <Stack direction="row" spacing={2}>
        <Button component="label" variant="contained" startIcon={<CloudUploadIcon />}>
          Upload bill image
          <input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
        </Button>
        <Button component="label" variant="outlined">
          Upload CSV
          <input hidden type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} />
        </Button>
      </Stack>
      {items.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
            <TextField size="small" label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            <Typography variant="caption" color="text.secondary">source: {source}</Typography>
            <Button variant="contained" onClick={confirm} sx={{ ml: "auto" }}>Confirm & add to stock</Button>
          </Stack>
          <DataGrid
            rows={items} columns={cols} autoHeight density="compact"
            processRowUpdate={(n) => { setItems((rs) => rs.map((r) => (r.id === n.id ? n : r))); return n; }}
          />
        </Paper>
      )}
      <input ref={fileRef} type="file" hidden />
    </Stack>
  );
}
