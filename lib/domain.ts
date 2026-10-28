import { z } from 'zod';

export const contractFields = z.object({
  customerName: z.string().max(120).nullable(),
  email: z.string().max(200).nullable(),
  vehicle: z.string().max(150).nullable(),
  vin: z.string().max(17).nullable(),
  totalPrice: z.number().nonnegative().max(1000000).nullable(),
  deposit: z.number().nonnegative().max(1000000).nullable(),
  signedDate: z.string().nullable(),
});
export const extractionSchema = z.object({
  fields: contractFields,
  evidence: z.array(z.object({ field: z.string(), quote: z.string(), page: z.number().int().positive().nullable() })),
  warnings: z.array(z.string()),
});
export type Extraction = z.infer<typeof extractionSchema>;
export const saveContractSchema = z.object({
  opportunityId: z.string().min(1).max(100),
  fields: contractFields,
  reviewed: z.literal(true),
  source: z.enum(['sample', 'live']),
}).superRefine(({fields},ctx) => {
  if (!fields.customerName || !fields.vehicle || fields.totalPrice === null)
    ctx.addIssue({code:'custom', message:'Customer, vehicle and total price must be reviewed.'});
  if (fields.deposit !== null && fields.totalPrice !== null && fields.deposit > fields.totalPrice)
    ctx.addIssue({code:'custom', message:'Deposit cannot exceed total price.'});
  if (fields.email && !z.email().safeParse(fields.email).success)
    ctx.addIssue({code:'custom', message:'Enter a valid email or leave it blank.'});
  if (fields.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(fields.vin))
    ctx.addIssue({code:'custom', message:'VIN must contain 17 valid characters, excluding I, O and Q.'});
  if (fields.signedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.signedDate) || Number.isNaN(Date.parse(fields.signedDate)) || new Date(fields.signedDate).toISOString().slice(0,10)!==fields.signedDate))
    ctx.addIssue({code:'custom',message:'Use a valid YYYY-MM-DD date.'});
});
export const sampleExtraction: Extraction = {
  fields: {customerName:'Alex Morgan', email:'alex@example.com', vehicle:'IONIQ 5 · demo vehicle', vin:null, totalPrice:72000, deposit:2000, signedDate:'2026-10-20'},
  evidence:[{field:'customerName',quote:'Purchaser: Alex Morgan',page:1},{field:'totalPrice',quote:'Total purchase price: AUD 72,000',page:1},{field:'deposit',quote:'Deposit paid: AUD 2,000',page:1}],
  warnings:['Prepared example, not extracted from your upload. All amounts are fictional.', 'VIN is missing. Check the original before finalising.', 'Signature presence and legal validity have not been verified.'],
};
export const opportunities = [
  {id:'opp-001',name:'Alex Morgan',initials:'AM',email:'alex@example.com',vehicle:'IONIQ 5',stage:'Proposal',value:72000,action:'Review contract',colour:'blue'},
  {id:'opp-002',name:'Sophie Chen',initials:'SC',email:'sophie@example.com',vehicle:'TUCSON Hybrid',stage:'Test drive',value:54000,action:'Prepare consultation',colour:'purple'},
  {id:'opp-003',name:'Oliver Williams',initials:'OW',email:'oliver@example.com',vehicle:'KONA Electric',stage:'Discovery',value:58000,action:'Explore EV needs',colour:'orange'},
];
export const knowledge = [
  {id:'AU-TRAIN-01',title:'Range conversations',market:'AU',status:'Demo training guidance',text:'A quoted laboratory range is a comparison figure, not a promise for every journey. Temperature, motorway speed, climate control, load and driving style affect actual range. Ask about the customer’s route and charging access. No Australian trim-specific range figure is verified in this prototype.'},
  {id:'AU-TRAIN-02',title:'Charging confidence',market:'AU',status:'Demo training guidance',text:'Distinguish public DC rapid charging from home AC charging. Confirm the exact Australian vehicle, battery, charger power and temperature conditions before giving a time. A driveway does not establish installation suitability. Offer a home charging assessment.'},
  {id:'AU-TRAIN-03',title:'Needs-led walk-around',market:'AU',status:'Demo training guidance',text:'Ask about daily and longer journeys, passengers, luggage and charging access. Confirm priorities, link two features to needs, invite the customer to check the actual vehicle, and propose a test drive with a clear purpose. Prices, finance, promotions and Australian specifications require approved local sources.'},
];
export function searchKnowledge(query:string) {
  const q=query.toLowerCase();
  if (/winter|range|주행|겨울/.test(q)) return [knowledge[0],knowledge[1]];
  if (/charg|충전/.test(q)) return [knowledge[1],knowledge[0]];
  return [knowledge[2],knowledge[0]];
}
export const quizQuestions = [
  {question:'A customer asks whether the advertised range is guaranteed in winter. What is the best response?',options:['Guarantee the quoted range after a full charge.','Explain the conditions and check their route and charging options.','Promise a fixed percentage reduction.']},
  {question:'A customer has a driveway. What should you check before quoting home charging time?',options:['Installation suitability, vehicle, power supply and routine.','Only the public DC charging headline.','Nothing: a driveway is sufficient.']},
  {question:'What makes a useful walk-around?',options:['Read every feature from the specification sheet.','Lead with the highest price.','Link relevant features to needs and invite practical checks.']},
];
export function gradeQuiz(answers:number[]) {
  const correct=[1,0,2];
  return {score:answers.reduce((sum,a,i)=>sum+(a===correct[i]?1:0),0),total:3,feedback:answers.map((a,i)=>({correct:a===correct[i],answer:correct[i]}))};
}
