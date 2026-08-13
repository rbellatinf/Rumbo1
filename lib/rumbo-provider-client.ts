export type ProviderPayload=Record<string,unknown>;

export function rumboProvider(){
 const apiUrl=(process.env.RUMBO_API_URL||"https://rumbo-api-4twt.onrender.com").trim().replace(/\/$/,"");
 const apiKey=process.env.RUMBO_API_KEY?.trim();
 const headers:Record<string,string>={};
 if(apiKey)headers["X-Rumbo-API-Key"]=apiKey;
 return{apiUrl,headers};
}

export async function parseProviderJson(response:Response):Promise<ProviderPayload>{
 const text=await response.text();
 if(!text)return{};
 try{return JSON.parse(text) as ProviderPayload}catch{return{error:{message:text.slice(0,300)}}}
}

export function providerMessage(payload:ProviderPayload,fallback:string){
 const error=payload.error;
 if(error&&typeof error==="object"&&!Array.isArray(error)&&typeof(error as ProviderPayload).message==="string")return String((error as ProviderPayload).message);
 if(typeof payload.message==="string")return payload.message;
 return fallback;
}
