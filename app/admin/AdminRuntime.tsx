"use client";

import type { ReactNode } from "react";
import AdminLayoutClient from "./AdminLayoutClient";

let shieldInstalled=false;

function installAdminFetchShield(){
  if(shieldInstalled||typeof window==="undefined")return;
  shieldInstalled=true;
  const nativeFetch=window.fetch.bind(window);
  let inflight:Promise<Response>|null=null;
  let cached:Response|null=null;
  let cachedAt=0;

  window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{
    const rawUrl=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
    const method=String(init?.method||(input instanceof Request?input.method:"GET")).toUpperCase();
    const isOverview=method==="GET"&&(rawUrl==="/api/admin/overview"||rawUrl.endsWith("/api/admin/overview"));
    if(!isOverview)return nativeFetch(input,init);

    if(cached&&Date.now()-cachedAt<1800)return Promise.resolve(cached.clone());
    if(inflight)return inflight.then(response=>response.clone());

    const run=async()=>{
      const delays=[0,1200,2500,4500,7500,11000];
      let last:Response|null=null;
      for(const delay of delays){
        if(delay)await new Promise(resolve=>window.setTimeout(resolve,delay));
        try{
          const response=await nativeFetch(input,{...init,cache:"no-store"});
          last=response;
          if(response.ok||[401,403].includes(response.status)||![502,503,504].includes(response.status))return response;
        }catch{
          // Render Free puede estar despertando; reintentamos sin romper el Admin.
        }
      }
      return last||new Response(JSON.stringify({message:"Rumbo API está despertando. Reintenta en unos segundos."}),{status:502,headers:{"content-type":"application/json"}});
    };

    inflight=run().then(response=>{
      if(response.ok){cached=response.clone();cachedAt=Date.now();}
      return response;
    }).finally(()=>{inflight=null;});
    return inflight.then(response=>response.clone());
  }) as typeof window.fetch;
}

export default function AdminRuntime({children}:{children:ReactNode}){
  installAdminFetchShield();
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
