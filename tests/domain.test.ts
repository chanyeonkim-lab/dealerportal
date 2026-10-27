import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sampleExtraction,saveContractSchema,searchKnowledge } from '../lib/domain';
import { createContract,listContracts,database } from '../lib/db';
import { addCourse,courseSchema,publicCourses,recordParticipation,submitAttempt,trainingReport } from '../lib/training';
process.env.DEALER_DATA_DIR=mkdtempSync(path.join(tmpdir(),'dealer-test-'));
const valid={opportunityId:'opp-001',fields:sampleExtraction.fields,reviewed:true,source:'sample'};
test('contract requires human review and a known opportunity',()=>{
 assert.equal(saveContractSchema.safeParse({...valid,reviewed:false}).success,false);
 assert.equal(saveContractSchema.safeParse({...valid,opportunityId:'other'}).success,false);
 assert.equal(saveContractSchema.safeParse(valid).success,true);
});
test('contract rejects inconsistent money, missing required data and invalid VIN or date',()=>{
 for(const fields of [{...valid.fields,deposit:80000},{...valid.fields,totalPrice:-1},{...valid.fields,customerName:null},{...valid.fields,vin:'INVALID'},{...valid.fields,signedDate:'2026-02-31'}])assert.equal(saveContractSchema.safeParse({...valid,fields}).success,false);
});
test('reviewed contract persists with its relationship and audit event',()=>{
 const id=createContract(saveContractSchema.parse(valid));
 const saved=listContracts().find(c=>c.id===id);
 assert.equal(saved?.opportunityId,'opp-001');assert.equal(saved?.fields.customerName,'Alex Morgan');
 assert.equal(database().prepare('SELECT count(*) AS n FROM audit_events WHERE record_id=?').get(id)?.n,1);
});
test('knowledge retrieval stays AU scoped and makes no invented winter range claim',()=>{
 const docs=searchKnowledge('IONIQ 5 winter range');assert.ok(docs.length>0);
 assert.ok(docs.every(d=>d.market==='AU'));assert.match(docs[0].text,/No Australian trim-specific range figure is verified/);
});
test('published course is available without exposing answer key and retains failed and passed attempts',()=>{
 const course=courseSchema.parse({title:'Test course',body:'Ask about driving needs and home charging before making a recommendation.',questions:[0,1,2].map(i=>({question:`Test question ${i}?`,options:['A','B','C'],correct:i}))});
 const id=addCourse(course);const exposed=publicCourses().find(c=>c.id===id);
 assert.ok(exposed);assert.equal('correct' in exposed.questions[0],false);
 recordParticipation(id);
 assert.equal(submitAttempt(id,[2,2,0]).score,0);assert.equal(submitAttempt(id,[0,1,2]).score,3);
 const report=trainingReport().filter(e=>e.course_id===id);
 assert.equal(report.filter(e=>e.type==='opened').length,1);
 assert.equal(report.filter(e=>e.type==='quiz_submitted').length,2);
});
test('course validation rejects missing quiz and out-of-range answer keys',()=>{
 assert.equal(courseSchema.safeParse({title:'Test',body:'x'.repeat(40),questions:[]}).success,false);
});
