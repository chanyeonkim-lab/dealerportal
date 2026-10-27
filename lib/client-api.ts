import { z } from 'zod';
import { opportunities, quizQuestions, sampleExtraction, saveContractSchema, searchKnowledge } from './domain';
import { courseSchema, type Course } from './training-schema';

type Contract={id:string;opportunityId:string;fields:unknown;source:string;reviewedAt:string};
type TrainingEvent={id:string;learner:string;course_id:string;type:string;score:number|null;total:number|null;created_at:string};
type State={contracts:Contract[];courses:Course[];events:TrainingEvent[]};
const key='hyundai-au-public-preview-v1';
function initial():State{return {contracts:[],events:[],courses:[{id:'AU01',title:'EV sales essentials',body:'Ask about everyday journeys, longer trips, passengers, luggage and charging access. Confirm priorities before recommending a feature.\n\nRange: Published range is a comparison figure, not a winter guarantee. Ask about routes and charging options.\n\nCharging: Distinguish home AC from public DC charging. Check the Australian vehicle and installation before quoting a time.\n\nWalk-around: Link relevant features to needs and invite practical checks. Agree a purposeful test drive.\n\nDemo guidance, not official Hyundai certification.',questions:quizQuestions.map((q,i)=>({...q,correct:[1,0,2][i]}))}]};}
function read():State{const saved=localStorage.getItem(key);return saved?JSON.parse(saved):initial();}
function write(state:State){localStorage.setItem(key,JSON.stringify(state));}
const json=(data:unknown,status=200)=>Response.json(data,{status});

// A build-time switch. Normal development always uses the real server API.
export async function apiFetch(input:string,init?:RequestInit):Promise<Response>{
  if(process.env.NEXT_PUBLIC_STATIC_PREVIEW!=='1')return fetch(input,init);
  try{
    const url=new URL(input,window.location.origin),method=init?.method||'GET';
    if(!url.pathname.startsWith('/api/'))return json({error:'Preview endpoint not supported.'},404);
    if(init?.body instanceof FormData)return json({error:'Document uploads are disabled in the public preview. Use the prepared example. No file has been uploaded.'},503);
    const body=typeof init?.body==='string'?JSON.parse(init.body):{},state=read();
    if(url.pathname==='/api/dashboard'&&method==='GET')return json({opportunities,contracts:state.contracts,liveAI:false});
    if(url.pathname==='/api/contracts'){
      if(method==='GET')return json({contracts:state.contracts});
      if(method!=='POST')return json({error:'Method not supported.'},405);
      if(body.action==='sample')return json({result:sampleExtraction,source:'sample'});
      const parsed=saveContractSchema.safeParse(body);
      if(!parsed.success)return json({error:parsed.error.issues.map(i=>i.message).join(' ')},400);
      if(parsed.data.source!=='sample')return json({error:'Only prepared examples can be saved in this preview.'},400);
      const id=crypto.randomUUID();state.contracts.unshift({id,opportunityId:parsed.data.opportunityId,fields:parsed.data.fields,source:'sample',reviewedAt:new Date().toISOString()});
      state.contracts=state.contracts.slice(0,200);write(state);return json({id},201);
    }
    if(url.pathname==='/api/assistant'&&method==='POST'){
      const q=z.string().trim().min(1).max(2000).safeParse(body.question);
      if(!q.success)return json({error:'Enter a question of 1–2,000 characters.'},400);
      const sources=searchKnowledge(q.data);
      return json({mode:'sample',answer:'Prepared coaching guidance — not a live AI response.\n\n'+sources.map(s=>`${s.text} [${s.id}]`).join('\n\n'),sources:sources.map(({id,title,status})=>({id,title,status}))});
    }
    if(url.pathname==='/api/training'){
      if(method==='GET')return json(url.searchParams.get('view')==='admin'?{courses:state.courses,events:state.events}:{courses:state.courses.map(c=>({...c,questions:c.questions.map(({question,options})=>({question,options}))}))});
      if(method!=='POST')return json({error:'Method not supported.'},405);
      if(body.action==='publish'){
        const parsed=courseSchema.safeParse(body.course);if(!parsed.success)return json({error:parsed.error.issues[0].message},400);
        const id=crypto.randomUUID();state.courses.push({...parsed.data,id});write(state);return json({id},201);
      }
      const course=state.courses.find(c=>c.id===body.courseId);if(!course)return json({error:'Unknown course.'},400);
      const base={id:crypto.randomUUID(),learner:'Jamie Taylor',course_id:course.id,created_at:new Date().toISOString()};
      if(body.action==='open'){
        state.events.unshift({...base,type:'opened',score:null,total:null});state.events=state.events.slice(0,500);write(state);return json({ok:true});
      }
      if(body.action==='submit'){
        const parsed=z.array(z.number().int().min(0).max(2)).length(3).safeParse(body.answers);
        if(!parsed.success)return json({error:'Answer all three questions.'},400);
        const feedback=course.questions.map((q,i)=>({correct:parsed.data[i]===q.correct,answer:q.correct})),score=feedback.filter(f=>f.correct).length;
        state.events.unshift({...base,type:'quiz_submitted',score,total:3});state.events=state.events.slice(0,500);write(state);return json({score,total:3,feedback});
      }
    }
    return json({error:'Preview endpoint not supported.'},404);
  }catch{return json({error:'Unable to save preview data. Allow browser storage or clear this site’s stored demo data.'},500);}
}
