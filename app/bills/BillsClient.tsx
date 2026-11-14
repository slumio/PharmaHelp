"use client";

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
  useEffect(() => { fetch("/api/orders").then((r) => r.json()).then(setOrders); }, []);

  return (
    <>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Customer bills</Typography>
      <Paper variant="outlined">
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
    </>
  );
}
