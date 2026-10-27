import { NextResponse } from 'next/server';
import { createContract, listContracts } from '@/lib/db';
import { sampleExtraction, saveContractSchema } from '@/lib/domain';
import { extractContract } from '@/lib/ai';
export const runtime='nodejs';
export async function GET(){return NextResponse.json({contracts:listContracts()});}
export async function POST(request:Request){
  try{
    if(request.headers.get('content-type')?.includes('application/json')){
      const body=await request.json();
      if(body.action==='sample')return NextResponse.json({result:sampleExtraction,source:'sample'});
      const parsed=saveContractSchema.safeParse(body);
      if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join(' ')},{status:400});
      const id=createContract(parsed.data);
      return NextResponse.json({id},{status:201});
    }
    if(Number(request.headers.get('content-length')||0)>11*1024*1024)return NextResponse.json({error:'Maximum document size is 10 MB.'},{status:413});
    const form=await request.formData(),file=form.get('file');
    if(!(file instanceof File)||file.size===0||file.size>10*1024*1024)return NextResponse.json({error:'Choose a JPG, PNG or PDF up to 10 MB.'},{status:400});
    const bytes=Buffer.from(await file.arrayBuffer());
    const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'image/jpeg':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':null;
    if(!mime)return NextResponse.json({error:'Unsupported document. Use a valid JPG, PNG or PDF.'},{status:400});
    if(!(process.env.OPENAI_API_KEY||process.env.DEALER_OPENAI_API_KEY))return NextResponse.json({error:'Live extraction needs OPENAI_API_KEY on the server. Use the prepared example to explore the review workflow.'},{status:503});
    const result=await extractContract(bytes,mime);
    return NextResponse.json({result,source:'live'});
  }catch{return NextResponse.json({error:'Unable to process the document. Check the server configuration or retry with a clearer document.'},{status:500});}
}
