import { NextResponse } from 'next/server';
import { z } from 'zod';
import { answerSalesQuestion } from '@/lib/ai';
import { searchKnowledge } from '@/lib/domain';
export async function POST(req:Request){
 try{
  const parsed=z.object({question:z.string().trim().min(1).max(2000)}).safeParse(await req.json());
  if(!parsed.success)return NextResponse.json({error:'Enter a question of 1–2,000 characters.'},{status:400});
  if(process.env.OPENAI_API_KEY||process.env.DEALER_OPENAI_API_KEY)return NextResponse.json({...await answerSalesQuestion(parsed.data.question),mode:'live'});
  const sources=searchKnowledge(parsed.data.question);
  return NextResponse.json({mode:'sample',answer:'Prepared coaching guidance — not a live AI response.\n\n'+sources.map(s=>`${s.text} [${s.id}]`).join('\n\n'),sources:sources.map(({id,title,status})=>({id,title,status}))});
 }catch{return NextResponse.json({error:'The assistant could not respond. Please retry.'},{status:500});}
}
