type TelemetryEvent={
  integrationCode:string;
  serviceCode:string;
  success:boolean;
  httpStatus?:number|null;
  durationMs?:number|null;
  errorCode?:string|null;
  errorMessage?:string|null;
  requestSummary?:Record<string,unknown>;
  responseSummary?:Record<string,unknown>;
  source?:string;
};

export function recordIntegrationCall(event:TelemetryEvent){
  const apiUrl=(process.env.RUMBO_API_URL||"").replace(/\/$/,"");
  const apiKey=process.env.RUMBO_API_KEY||"";
  if(!apiUrl||!apiKey)return;
  void fetch(`${apiUrl}/api/integration-observability`,{
    method:"POST",
    headers:{"Content-Type":"application/json","X-Rumbo-API-Key":apiKey},
    body:JSON.stringify({
      integration_code:event.integrationCode,
      service_code:event.serviceCode,
      source:event.source||"runtime",
      success:event.success,
      http_status:event.httpStatus??null,
      duration_ms:event.durationMs??null,
      error_code:event.errorCode??null,
      error_message:event.errorMessage??null,
      request_summary:event.requestSummary||{},
      response_summary:event.responseSummary||{},
    }),
    cache:"no-store",
  }).catch(()=>{});
}
