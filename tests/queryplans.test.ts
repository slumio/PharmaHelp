import { afterAll,expect,it } from "vitest";
import { rows,closeDatabase } from "@/db/sqlite";
afterAll(closeDatabase);
it("installs SQL lookup indexes",()=>{
 const indexes=rows<{name:string}>("PRAGMA index_list(medicines)");
 expect(indexes.some(i=>i.name==="medicines_store_stock")).toBe(true);
 expect(indexes.some(i=>i.name==="medicines_store_expiry")).toBe(true);
});
