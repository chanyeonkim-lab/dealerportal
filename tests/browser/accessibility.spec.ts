import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('dealer and management screens meet automated accessibility checks',async({page})=>{
 test.setTimeout(60000);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 async function check(name:string){
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,reason:n.failureSummary}))})),name).toEqual([]);
 }
 await check('Overview');
 await page.getByRole('button',{name:'New contract'}).click();
 await page.getByRole('button',{name:'Or explore a prepared example'}).click();
 await check('Contract review');
 await page.getByRole('button',{name:'Close contract review'}).click();
 await page.getByRole('button',{name:'Open sales assistant'}).click();
 await check('Sales assistant');
 await page.getByRole('button',{name:'Close assistant'}).click();
 await page.getByRole('button',{name:'Hyundai internal',exact:true}).click();
 await check('Internal sales overview');
 await page.getByRole('button',{name:'Training management',exact:true}).click();
 await check('Training management');
 await page.getByRole('button',{name:'Learning performance',exact:true}).click();
 await check('Learning performance');
 await page.getByRole('button',{name:'Dealer',exact:true}).click();
 await page.getByRole('button',{name:'Learning hub',exact:true}).click();
 await expect(page.getByRole('heading',{name:'EV sales essentials',exact:true})).toBeVisible();
 await check('Learning');
 await page.setViewportSize({width:390,height:844});await page.reload();
 await check('Mobile overview');
 await page.getByRole('button',{name:'Open menu'}).click();
 await check('Mobile navigation');
});
