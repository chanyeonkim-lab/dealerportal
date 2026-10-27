import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addCourse, courseSchema, courses, publicCourses, recordParticipation, submitAttempt, trainingReport } from '@/lib/training';
// DEMO ONLY: no identity provider. Never expose this API outside a trusted local prototype.
export async function GET(req:Request){const admin=new URL(req.url).searchParams.get('view')==='admin';return NextResponse.json(admin?{courses:courses(),events:trainingReport()}:{courses:publicCourses()});}
export async function POST(req:Request){try{const body=await req.json();if(body.action==='publish'){const p=courseSchema.safeParse(body.course);if(!p.success)return NextResponse.json({error:p.error.issues[0].message},{status:400});return NextResponse.json({id:addCourse(p.data)},{status:201});}
 const parsed=z.object({action:z.enum(['open','submit']),courseId:z.string(),answers:z.array(z.number().int().min(0).max(2)).length(3).optional()}).safeParse(body);
 if(!parsed.success)return NextResponse.json({error:'Invalid training request.'},{status:400});
 if(parsed.data.action==='open'){recordParticipation(parsed.data.courseId);return NextResponse.json({ok:true});}
 if(!parsed.data.answers)return NextResponse.json({error:'Answer all three questions.'},{status:400});
 return NextResponse.json(submitAttempt(parsed.data.courseId,parsed.data.answers));
 }catch{return NextResponse.json({error:'Unable to process training request.'},{status:400});}}
