"use client";

import { useEffect, useState } from "react";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

type Row = {
  medicine_id: number; name: string; pack_size: string; batch_no: string; expiry_date: string;
  mrp: string; stock: number; min_stock: number; rack_code: string | null;
};

export default function InventoryClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dialog, setDialog] = useState<null | "upsert" | "reduce" | "count" | "delete">(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { const response = await fetch("/api/stock"); if (!response.ok) throw new Error("Inventory could not be loaded. Please try again."); setRows(await response.json()); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);

  const post = async (action: string, args: Record<string, unknown>) => {
    const r = await fetch("/api/stock", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, args }),
    });
    const j = await r.json();
    if (!r.ok) setErr(j.error?.message ?? "Failed");
    else { setMsg("Done"); setDialog(null); void load(); }
  };

  const openDialog = (kind: typeof dialog, row?: Row) => {
    setForm(row ? { medicineId: String(row.medicine_id), name: row.name, batchNo: row.batch_no, packSize: row.pack_size, expiryDate: row.expiry_date ?? "", mrp: row.mrp, rackCode: row.rack_code ?? "" } : {});
    setDialog(kind);
  };

  const cols: GridColDef[] = [
    { field: "name", headerName: "Medicine", flex: 1.2 },
    { field: "pack_size", headerName: "Pack", width: 110 },
    { field: "batch_no", headerName: "Batch", width: 90 },
    { field: "expiry_date", headerName: "Expiry", width: 110 },
    { field: "mrp", headerName: "MRP", width: 90, align: "right" },
    { field: "stock", headerName: "Stock", width: 80, align: "right", type: "number" },
    { field: "rack_code", headerName: "Rack", width: 80 },
    {
      field: "actions", headerName: "Actions", width: 260, sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => openDialog("upsert", p.row)}>Add</Button>
          <Button size="small" onClick={() => openDialog("reduce", p.row)}>Reduce</Button>
          <Button size="small" onClick={() => openDialog("count", p.row)}>Count</Button>
          <Button size="small" color="error" onClick={() => openDialog("delete", p.row)}>Delete</Button>
        </Stack>
      ),
    },
  ];

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center",  mb: 3, gap: 2 }}>
        <Stack><Typography variant="h4" sx={{ fontSize: { xs: 27, md: 31 } }}>A place for every medicine.</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .7 }}>Inventory · Keep your shelves stocked and your counts clear.</Typography></Stack>
        <Button variant="contained" onClick={() => openDialog("upsert")}>New stock</Button>
      </Stack>
      {err && <Alert severity="error" onClose={() => setErr(null)} sx={{ mb: 2 }}>{err}</Alert>}
      <DataGrid
        loading={loading} sx={{ bgcolor: "background.paper", borderColor: "divider", borderRadius: 0, "& .MuiDataGrid-columnHeaders": { bgcolor: "#263132" }, "& .MuiDataGrid-cell": { borderColor: "#354444", fontSize: 12 }, "& .MuiDataGrid-columnHeaderTitle": { fontSize: 11, fontWeight: 600 } }} rows={rows} columns={cols} getRowId={(r) => r.medicine_id}
        autoHeight initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        pageSizeOptions={[25, 50]} disableRowSelectionOnClick density="compact"
      />

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {dialog === "upsert" && (form.name ? `Add stock — ${form.name}` : "New stock")}
          {dialog === "reduce" && `Reduce stock — ${form.name}`}
          {dialog === "count" && `Physical count — ${form.name}`}
          {dialog === "delete" && `Delete stock — ${form.name}`}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialog === "upsert" && !form.medicineId && <TextField label="Medicine name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            {dialog === "upsert" && (
              <>
                <TextField label="Batch no" value={form.batchNo ?? ""} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} />
                <TextField label="Expiry (YYYY-MM-DD)" value={form.expiryDate ?? ""} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                <TextField label="MRP" type="number" value={form.mrp ?? ""} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
                <TextField label="Rack code" value={form.rackCode ?? ""} onChange={(e) => setForm({ ...form, rackCode: e.target.value })} />
              </>
            )}
            {dialog !== "delete" && <TextField label={dialog === "count" ? "Counted quantity" : "Quantity"} type="number" value={form.qty ?? ""} onChange={(e) => setForm({ ...form, qty: e.target.value })} />}
            {dialog === "delete" && <TextField select label="Reason" value={form.reason ?? "expired"} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {["expired", "damaged", "returned to supplier", "removed from shelf"].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const n = Number(form.qty);
              if (dialog === "upsert") void post("upsert", { name: form.name, qty: n, mrp: Number(form.mrp) || 0, batchNo: form.batchNo || "NA", packSize: form.packSize || "strip", expiryDate: form.expiryDate || undefined, rackCode: form.rackCode || undefined });
              if (dialog === "reduce") void post("reduce", { medicineId: Number(form.medicineId), qty: n, reason: form.reason || "manual issue" });
              if (dialog === "count") void post("update_count", { medicineId: Number(form.medicineId), countedQty: n });
              if (dialog === "delete") void post("delete", { medicineId: Number(form.medicineId), reason: form.reason });
            }}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!msg} autoHideDuration={3000} onClose={() => setMsg(null)}><Alert severity="success">{msg}</Alert></Snackbar>
      <Snackbar open={!!err} autoHideDuration={5000} onClose={() => setErr(null)}><Alert severity="error">{err}</Alert></Snackbar>
    </>
  );
}
