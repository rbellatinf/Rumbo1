import { spawn } from "node:child_process";
import express from "express";
import pg from "pg";
import { installNativeRuntimeRoutes } from "./native-runtime-routes.mjs";

const {Pool}=pg;
const PORT=Number(process.env.PORT||4000),INNER_PORT=Number(process.env.RUMBO_EDGE_PORT||4005),API_KEY=process.env.RUMBO_API_KEY||"";
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});
const inner=spawn(process.execPath,[new URL('./public-edge.mjs',import.meta.url).pathname],{env:{...process.env,PORT:String(INNER_PORT)},stdio:'inherit'});
inner.on('exit',code=>{console.error(`Rumbo inner edge exited with ${code}`);process.exit(code??1)});

const app=express();
app.set('trust proxy',true);
app.use(express.raw({type:'*/*',limit:'2mb'}));
app.get('/health',async(_req,res)=>{try{await pool.query('SELECT 1');const innerOk=await fetch(`http://127.0.0.1:${INNER_PORT}/health`,{signal:AbortSignal.timeout(3000)}).then(r=>r.ok).catch(()=>false);res.status(innerOk?200:503).json({status:innerOk?'ok':'degraded',service:'rumbo-native-front',runtime:'native'})}catch{res.status(503).json({status:'error',service:'rumbo-native-front'})}});
app.use('/api',(req,res,next)=>{if(!API_KEY)return res.status(503).json({error:{message:'RUMBO_API_KEY no está configurado.'}});if(req.get('X-Rumbo-API-Key')!==API_KEY)return res.status(401).json({error:{message:'API key inválida.'}});next()});
installNativeRuntimeRoutes(app,{pool});
app.use(async(req,res)=>{try{const headers=new Headers();for(const[key,value]of Object.entries(req.headers)){if(value==null||key==='host'||key==='content-length')continue;headers.set(key,Array.isArray(value)?value.join(','):String(value))}const body=['GET','HEAD'].includes(req.method)?undefined:Buffer.isBuffer(req.body)?req.body:undefined,upstream=await fetch(`http://127.0.0.1:${INNER_PORT}${req.originalUrl}`,{method:req.method,headers,body,redirect:'manual'});res.status(upstream.status);upstream.headers.forEach((value,key)=>{if(!['content-encoding','transfer-encoding','connection'].includes(key.toLowerCase()))res.setHeader(key,value)});res.send(Buffer.from(await upstream.arrayBuffer()))}catch(error){console.error(error);res.status(502).json({error:{message:'Rumbo API no respondió.'}})}});
app.listen(PORT,'0.0.0.0',()=>console.log(`Rumbo native front listening on ${PORT}; inner edge=${INNER_PORT}`));
