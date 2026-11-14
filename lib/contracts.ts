import { z } from "zod";
export const SearchMedicines = z.object({
  query: z.string().trim().min(1).max(200).describe("Medicine name (partial match allowed)"),
  limit: z.number().int().min(1).max(1000000).max(50).default(10),
});
export const FindRackLocation = z.object({ query: z.string().trim().min(1).max(200) });
export const GetDashboardMetrics = z.object({});
export const GetExpiringStock = z.object({ days: z.number().int().min(1).max(1000000).max(365).default(90) });
export const GetLowStock = z.object({});

export const UpsertStock = z.object({
  name: z.string().trim().min(1).max(200),
  packSize: z.string().default("strip"),
  batchNo: z.string().default("NA"),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mrp: z.number().min(0).max(10000000),
  purchasePrice: z.number().min(0).max(10000000).optional(),
  qty: z.number().int().min(1).max(1000000),
  rackCode: z.string().optional(),
  rowNo: z.number().int().min(0).optional(),
  colNo: z.number().int().min(0).optional(),
  supplierName: z.string().optional(),
  sourceImageUrl: z.string().optional(),
});

export const UpdateStockCount = z.object({
  medicineId: z.number().int().positive(),
  countedQty: z.number().int().min(0).max(1000000),
  reason: z.string().default("physical count adjustment"),
});
export const ReduceStock = z.object({
  medicineId: z.number().int().positive(),
  qty: z.number().int().min(1).max(1000000),
  reason: z.string().default("manual issue"),
});
export const DeleteStock = z.object({
  medicineId: z.number().int().positive(),
  reason: z.string().default("removed from shelf"),
});

export const CreateOrder = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().optional(),
  paid: z.number().min(0).max(10000000).optional(),
  items: z.array(z.object({ medicineId: z.number().int().positive(), qty: z.number().int().min(1).max(1000000) } )).min(1).max(1000),
});

