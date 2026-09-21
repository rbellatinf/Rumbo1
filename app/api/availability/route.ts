import { NextRequest } from "next/server";
import { parseOfferAvailability } from "../../../lib/booking-requests";
import { accessConfiguration, backendMessage, noStoreJson, parseJson, providerHeaders } from "../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function GET(request:NextRequest){
 const params=request.nextUrl.searchParams;
 const productId=params.get("productId")?.trim();
 const departureId=params.get("departureId")?.trim();
 const departureDate=params.get("departureDate")?.trim();
 const returnDate=params.get("returnDate")?.trim();
 const adults=Number(params.get("adults")||"1"),children=Number(params.get("children")||"0"),travellers=adults+children;
 if(!productId?.startsWith("rumbo:")||!Number.isInteger(adults)||!Number.isInteger(children)||adults<1||children<0||travellers>18)return noStoreJson({message:"La disponibilidad solo se consulta sobre una selección válida de Rumbo."},422);
 const nativeId=productId.slice(6),provider=accessConfiguration();
 if(!provider)return noStoreJson({message:"Rumbo API no está configurada."},503);
 try{
  const response=await fetch(`${provider.apiUrl}/api/catalog`,{headers:providerHeaders(provider),cache:"no-store"});
  const payload=await parseJson(response) as {products?:Array<Record<string,unknown>>};
  if(!response.ok)return noStoreJson({message:backendMessage(payload as Record<string,unknown>,"No pudimos consultar el catálogo de Rumbo.")},response.status);
  const product=payload.products?.find(item=>String(item.id)===nativeId);
  if(!product)return noStoreJson({message:"La oferta ya no está disponible."},404);
  const departures=Array.isArray(product.departures)?product.departures as Array<Record<string,unknown>>:[];
  const departure=(departureId?departures.find(item=>String(item.id||"")===departureId):undefined)
    ||(departureDate&&returnDate?departures.find(item=>String(item.departure_date||"")===departureDate&&String(item.return_date||"")===returnDate):undefined)
    ||departures[0];
  if(!departure)return noStoreJson({message:"No encontramos una salida activa para esas fechas."},404);
  const available=departure.available_capacity==null?999999:Number(departure.available_capacity);
  const capacity=departure.capacity==null?available:Number(departure.capacity);
  const amount=Number(departure.price_amount||0),taxes=departure.taxes_amount==null?null:Number(departure.taxes_amount),suggested=departure.suggested_price_amount==null?null:Number(departure.suggested_price_amount),currency=String(departure.currency||"USD");
  const min=Number(departure.min_passengers_per_booking||1),max=Number(departure.max_passengers_per_booking||18);
  const saleOpen=departure.sale_open!==false&&(!departure.sale_deadline||Date.parse(String(departure.sale_deadline))>=Date.now());
  const policies={
    cancellation:departure.policy_cancellation??product.policy_cancellation??null,
    changes:departure.policy_changes??product.policy_changes??null,
    refund:departure.policy_refund??product.policy_refund??null,
    noShow:departure.policy_no_show??product.policy_no_show??null,
  };
  const parsed=parseOfferAvailability({
    product_id:productId,
    variant_id:String(departure.id||""),
    departure_date:String(departure.departure_date||departureDate||""),
    return_date:String(departure.return_date||returnDate||""),
    total_capacity:capacity,
    remaining_capacity:available,
    price_amount:amount,
    taxes_amount:taxes,
    suggested_price_amount:suggested,
    price_display:`${currency} ${amount.toFixed(2)}`,
    total_amount:amount*travellers,
    currency,
    bookable:Boolean(departure.id&&amount>0&&saleOpen&&travellers>=min&&travellers<=max&&available>=travellers),
    hold_minutes:15,
    min_passengers_per_booking:min,
    max_passengers_per_booking:max,
    confirmation_mode:String(departure.confirmation_mode||"confirmed"),
    confirmation_label:String(departure.confirmation_label||(departure.confirmation_mode==="minimum_required"?"Sujeta a mínimo de pasajeros":"Salida confirmada")),
    sale_deadline:departure.sale_deadline??null,
    policies,
  });
  return noStoreJson({availability:parsed});
 }catch(error){return noStoreJson({message:error instanceof Error?`Rumbo API no respondió: ${error.message}`:"Rumbo API no respondió."},502)}
}
