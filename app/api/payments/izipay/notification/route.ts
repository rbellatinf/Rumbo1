import { NextRequest, NextResponse } from "next/server";
import { PaymentApiError, processIzipayCallback } from "../../../../../lib/rumbo-payment-api";

export const dynamic="force-dynamic";
function formValue(form:FormData,...names:string[]){for(const name of names){const value=form.get(name);if(typeof value==="string"&&value.trim())return value.trim()}return""}

export async function POST(request:NextRequest){
 try{
  const form=await request.formData();
  const answerRaw=formValue(form,"kr-answer","kr_answer"),hash=formValue(form,"kr-hash","kr_hash");
  if(!answerRaw||!hash)return NextResponse.json({received:false,code:"missing_izipay_fields"},{status:422});
  const event=await processIzipayCallback(answerRaw,hash);
  return NextResponse.json({received:true,reference:event.booking_reference,status:event.status});
 }catch(error){
  return NextResponse.json({received:false,code:"izipay_notification_failed"},{status:error instanceof PaymentApiError?error.status:500});
 }
}
