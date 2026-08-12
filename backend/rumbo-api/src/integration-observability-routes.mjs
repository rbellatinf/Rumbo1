const clean=(value)=>String(value||"").trim();

export function installIntegrationObservabilityRoutes(app,{pool,requireAdmin,audit}){
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
    const integration=clean(req.body.integration_code),service=clean(req.body.service_code),source=clean(req.body.source)||'admin_test';
    if(!integration||!service)return res.status(422).json({error:{message:'Integración y servicio son obligatorios.'}});
    const success=Boolean(req.body.success),httpStatus=Number.isFinite(Number(req.body.http_status))?Number(req.body.http_status):null,duration=Number.isFinite(Number(req.body.duration_ms))?Math.max(0,Math.round(Number(req.body.duration_ms))):null;
    const requestSummary=req.body.request_summary&&typeof req.body.request_summary==='object'&&!Array.isArray(req.body.request_summary)?req.body.request_summary:{};
    const responseSummary=req.body.response_summary&&typeof req.body.response_summary==='object'&&!Array.isArray(req.body.response_summary)?req.body.response_summary:{};
    const {rows}=await pool.query(`INSERT INTO rumbo_integration_calls(integration_code,service_code,source,success,http_status,duration_ms,error_code,error_message,request_summary,response_summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING id,trace_id,created_at`,[integration,service,source,success,httpStatus,duration,clean(req.body.error_code)||null,clean(req.body.error_message)||null,JSON.stringify(requestSummary),JSON.stringify(responseSummary)]);
    await audit(req.adminSession.email,'integration.call_logged','integration_service',`${integration}:${service}`,{success,http_status:httpStatus,duration_ms:duration,trace_id:rows[0].trace_id});
    res.status(201).json(rows[0]);
  });
}
