"use client";

import { Alert, Box, Button, Skeleton } from "@mui/material";
import { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import Chip from "@mui/material/Chip";

type Order = {
  id: number; invoice_no: number; customer_name: string; total: string; paid: string; credit_due: string;
  created_at: string; items: { name: string; qty: number; lineTotal: string }[] | null;
};
const inr = (n: number | string) => "₹" + Number(n).toLocaleString("en-IN");

export default function BillsClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  async function load() { setError(""); setLoading(true); try { const response = await fetch("/api/orders"); if (!response.ok) throw new Error("Bills could not be loaded."); setOrders(await response.json()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);

  return (
    <>
      <Typography variant="h4" sx={{ fontSize: { xs: 27, md: 31 } }}>Every sale, all in one place.</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: .7, mb: 3 }}>Customer bills · A clear record of sales, payments and outstanding credit.</Typography>
      {error && <Alert severity="error" action={<Button onClick={() => void load()}>Retry</Button>} sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Skeleton height={80} />}
      <Paper variant="outlined" sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Invoice</TableCell><TableCell>Customer</TableCell><TableCell>Items</TableCell>
              <TableCell align="right">Total</TableCell><TableCell align="right">Paid</TableCell>
              <TableCell align="right">Udhaar</TableCell><TableCell>Date</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>#{o.invoice_no}</TableCell>
                <TableCell>{o.customer_name}</TableCell>
                <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(o.items ?? []).map((i) => `${i.name} ×${i.qty}`).join(", ")}
                </TableCell>
                <TableCell align="right">{inr(o.total)}</TableCell>
                <TableCell align="right">{inr(o.paid)}</TableCell>
                <TableCell align="right">{Number(o.credit_due) > 0 ? <Chip size="small" color="warning" label={inr(o.credit_due)} /> : "—"}</TableCell>
                <TableCell>{new Date(o.created_at).toLocaleDateString("en-IN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      {!loading && !orders.length && !error && <Box sx={{ p: 6, textAlign: "center", color: "text.secondary" }}>Your customer bills will appear here after your first sale.</Box>}
    </>
  );
}
