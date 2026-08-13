import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const {Pool}=pg;
if(!process.env.DATABASE_URL){console.error("DATABASE_URL no está configurado.");process.exit(1)}
const here=path.dirname(fileURLToPath(import.meta.url));
const initDir=path.resolve(here,"../../postgres/init");
const productionExcluded=/(?:_test_|_demo_|world_test|reconcile_test)/i;
const migrations=(await fs.readdir(initDir))
  .filter(file=>/^\d+_.+\.sql$/.test(file))
  .filter(file=>Number(file.match(/^(\d+)_/)?.[1]||0)>=70)
  .filter(file=>!productionExcluded.test(file))
  .sort((a,b)=>a.localeCompare(b,"en",{numeric:true}));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==="disable"?false:{rejectUnauthorized:false}});
try{
  for(const file of migrations){const sql=await fs.readFile(path.join(initDir,file),"utf8");await pool.query(sql);console.log(`Rumbo DB prepare OK: ${file}`)}
  console.log(`Rumbo DB prepare complete: ${migrations.length} production migrations (${migrations.at(-1)||"none"}).`);
}catch(error){console.error("No se pudo preparar PostgreSQL:",error.message);process.exitCode=1}finally{await pool.end()}
