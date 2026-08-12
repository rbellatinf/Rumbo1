const clean=(value)=>String(value||"").trim();

export function installIntegrationObservabilityRoutes(app,{pool,requireAdmin,audit}){
  async function insertCall(body){
    const integration=clean(body.integration_code),service=clean(body.service_code),source=clean(body.source)||'runtime';
    if(!integration||!service)return null;
    const success=Boolean(body.success),httpStatus=Number.isFinite(Number(body.http_status))?Number(body.http_status):null,duration=Number.isFinite(Number(body.duration_ms))?Math.max(0,Math.round(Number(body.duration_ms))):null;
    const requestSummary=body.request_summary&&typeof body.request_summary==='object'&&!Array.isArray(body.request_summary)?body.request_summary:{};
    const responseSummary=body.response_summary&&typeof body.response_summary==='object'&&!Array.isArray(body.response_summary)?body.response_summary:{};
    const {rows}=await pool.query(`INSERT INTO rumbo_integration_calls(integration_code,service_code,source,success,http_status,duration_ms,error_code,error_message,request_summary,response_summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id,trace_id,created_at`,[integration,service,source,success,httpStatus,duration,clean(body.error_code)||null,clean(body.error_message)||null,JSON.stringify(requestSummary),JSON.stringify(responseSummary)]);
    return {...rows[0],integration,service,success,httpStatus,duration};
  }

  // Endpoint interno: ya está protegido por X-Rumbo-API-Key en el gateway.
  // Permite que los adaptadores server-side registren tráfico real sin una sesión de Admin.
  app.post('/api/integration-observability',async(req,res)=>{
    const row=await insertCall(req.body||{});
    if(!row)return res.status(422).json({error:{message:'Integración y servicio son obligatorios.'}});
    res.status(201).json({id:row.id,trace_id:row.trace_id,created_at:row.created_at});
  });

  app.get('/api/admin/integration-observability',requireAdmin,async(req,res)=>{
    const integration=clean(req.query.integration),service=clean(req.query.service);
    const requestedHours=Number(req.query.hours||24),hours=[24,168,720].includes(requestedHours)?requestedHours:24;
    const values=[hours];let where=` WHERE created_at>=now()-($1||' hours')::interval`;
    if(integration){values.push(integration);where+=` AND integration_code=$${values.length}`}
    if(service){values.push(service);where+=` AND service_code=$${values.length}`}
    const stats=await pool.query(`SELECT integration_code,service_code,count(*)::int AS invocations,count(*) FILTER(WHERE success)::int AS successes,count(*) FILTER(WHERE NOT success)::int AS errors,round(100.0*count(*) FILTER(WHERE success)/NULLIF(count(*),0),2)::float8 AS success_rate,round(avg(duration_ms))::int AS avg_latency_ms,percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms) FILTER(WHERE duration_ms IS NOT NULL)::int AS p95_latency_ms,max(created_at) AS last_invocation_at,max(created_at) FILTER(WHERE success) AS last_success_at,max(created_at) FILTER(WHERE NOT success) AS last_error_at FROM rumbo_integration_calls${where} GROUP BY integration_code,service_code ORDER BY integration_code,service_code`,values);
    const logs=await pool.query(`SELECT id,integration_code,service_code,trace_id,source,success,http_status,duration_ms,error_code,error_message,request_summary,response_summary,created_at FROM rumbo_integration_calls${where} ORDER BY created_at DESC LIMIT 100`,values);
    res.json({window_hours:hours,stats:stats.rows,logs:logs.rows});
  });

  app.post('/api/admin/integration-observability',requireAdmin,async(req,res)=>{
    const row=await insertCall(req.body||{});
    if(!row)return res.status(422).json({error:{message:'Integración y servicio son obligatorios.'}});
    await audit(req.adminSession.email,'integration.call_logged','integration_service',`${row.integration}:${row.service}`,{success:row.success,http_status:row.httpStatus,duration_ms:row.duration,trace_id:row.trace_id});
    res.status(201).json({id:row.id,trace_id:row.trace_id,created_at:row.created_at});
  });
}
