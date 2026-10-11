import {test,expect} from '@playwright/test';
import {generationTypes,diagramLabels,newWorkspace,layoutDiagram,newComponent,newConnection,emptyGraph} from '@multi-agent/ai-design-studio';
import {fixture} from '../../../packages/ai-design-studio/test/fixtures.js';

test('viewport modes, focus, fit, manual camera, arrange, fullscreen and all diagram views',async({page})=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const large=emptyGraph('hld');
  for(let i=0;i<60;i++) {large.components.push(newComponent('service_'+i,'server','Service '+i));if(i)large.connections.push(newConnection('link_'+i,'service_'+(i-1),'service_'+i,'flow'));}
  const workspace=newWorkspace();
  workspace.diagrams=await Promise.all(generationTypes.map(async type=>({id:'diagram_'+type,title:diagramLabels[type],graph:fixture(type),canvas:{engine:'tldraw-layout',layout:await layoutDiagram(fixture(type))},origin:'ai' as const,manuallyEdited:false})));
  workspace.diagrams.push({id:'large',title:'Large saved design',graph:large,canvas:{engine:'tldraw-layout',layout:await layoutDiagram(large)},origin:'ai',manuallyEdited:false});
  workspace.activeDiagramId='diagram_hld';
  const doc={designId:'viewport_test',title:'Viewport test',revision:1,workspace,graph:workspace.diagrams[0].graph,canvas:null,chat:[]};
  const largeTab=workspace.diagrams.pop()!;
  const largeDoc={...doc,designId:'large_test',workspace:{...workspace,diagrams:[largeTab],activeDiagramId:largeTab.id},graph:large,canvas:largeTab.canvas};
  let savedDoc=doc;
  await page.route('**/api/ai-design-studio/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/session')) return route.fulfill({json:{model:'test',token:'test'}});
    if(path.endsWith('/designs')) return route.fulfill({json:[{designId:doc.designId,title:doc.title,revision:1},{designId:largeDoc.designId,title:'Large test',revision:1}]});
    if(route.request().method()==='PUT'){savedDoc={...doc,...route.request().postDataJSON(),revision:2};return route.fulfill({json:{revision:2}});}
    return route.fulfill({json:path.endsWith('/large_test')?largeDoc:savedDoc});
  });
  await page.goto('/ai-design-studio?studio-test=1');
  await page.getByLabel('Open design').selectOption(doc.designId);
  const toolbar=page.getByRole('toolbar',{name:'Diagram viewport'});
  await expect(toolbar).toBeVisible();
  for(const type of generationTypes){
    await page.getByRole('navigation',{name:'Diagram tabs'}).getByRole('button',{name:diagramLabels[type],exact:true}).click();
    await expect(page.getByTestId('studio-component')).toHaveCount(fixture(type).components.length);
    await page.waitForTimeout(100);
    const fits=await page.evaluate(()=>{const e=(window as any).studioTestEditor,b=e.getCurrentPageBounds(),v=e.getViewportPageBounds();return !b||v.contains(b);});
    expect(fits,type).toBe(true);
  }
  await page.getByRole('navigation',{name:'Diagram tabs'}).getByRole('button',{name:'Class',exact:true}).click();
  await page.waitForTimeout(100);
  const before=await page.evaluate(()=>{const e=(window as any).studioTestEditor;e.select('shape:order');e.setCamera({x:30,y:40,z:1});return e.getCurrentPageShapes().map((s:any)=>({id:s.id,x:s.x,y:s.y,props:s.props}));});
  await toolbar.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.getByTestId('studio-component').first()).toHaveAttribute('data-detail','overview');
  await toolbar.getByRole('button',{name:'Detail',exact:true}).click();await expect(page.getByTestId('studio-component').first()).toHaveAttribute('data-detail','detail');
  expect(await page.evaluate(()=>(window as any).studioTestEditor.getCurrentPageShapes().map((s:any)=>({id:s.id,x:s.x,y:s.y,props:s.props})))).toEqual(before);
  await page.evaluate(()=>{const e=(window as any).studioTestEditor;e.setCamera({x:30,y:40,z:.3});});await expect(page.getByTestId('studio-component').first()).toHaveAttribute('data-detail','overview');
  await toolbar.getByRole('button',{name:'100%',exact:true}).click();await expect(page.getByLabel('Zoom level')).toHaveText('100%');
  await page.evaluate(()=>{(window as any).studioTestEditor.select('shape:item');});
  const camera=await page.evaluate(()=>({...((window as any).studioTestEditor.getCamera())}));
  await toolbar.getByRole('button',{name:'Focus Selection',exact:true}).click();await expect(toolbar.getByRole('button',{name:'Return to Diagram'})).toBeVisible();
  await expect(page.locator('[data-shape-id="shape:gateway"] [data-testid="studio-component"]')).toHaveAttribute('opacity','0.2');
  await toolbar.getByRole('button',{name:'Return to Diagram'}).click();await page.waitForTimeout(350);
  const restored=await page.evaluate(()=>(window as any).studioTestEditor.getCamera());expect(restored.x).toBeCloseTo(camera.x);expect(restored.y).toBeCloseTo(camera.y);expect(restored.z).toBeCloseTo(camera.z);
  await page.evaluate(()=>{const e=(window as any).studioTestEditor;e.updateShape({id:'shape:order',type:'studio-component',x:444});e.setCamera({x:12,y:23,z:.7});});await page.waitForTimeout(300);
  expect(await page.evaluate(()=>(window as any).studioTestEditor.getCamera().z)).toBe(.7);
  await toolbar.getByRole('button',{name:'Auto Arrange',exact:true}).click();await expect(toolbar.getByRole('button',{name:'Auto Arrange',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).studioTestEditor.getShape('shape:order').x)).not.toBe(444);
  await toolbar.getByRole('button',{name:'Overview',exact:true}).click();
  expect(await page.evaluate(async()=>{const e=(window as any).studioTestEditor;const result=await e.getSvgString(e.getCurrentPageShapes().map((s:any)=>s.id));return result.svg.includes('pay(): Boolean');})).toBe(true);
  await toolbar.getByRole('button',{name:'Detail',exact:true}).click();
  await page.screenshot({path:'test-results/ai-design-studio/viewport-class.png'});
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();await expect(page.locator('.ads-tools')).toHaveCount(0);await expect(page.locator('.ads-sidebar')).toHaveCount(0);await expect(toolbar).toBeVisible();
  await page.setViewportSize({width:1100,height:750});await toolbar.getByRole('button',{name:'Fit to Screen'}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Fullscreen',exact:true})).toBeVisible();
  await page.evaluate(()=>{const e=(window as any).studioTestEditor;e.updateShape({id:'shape:order',type:'studio-component',x:555});e.setCamera({x:12,y:23,z:.7});});
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.ads-save-status')).toContainText('Saved');
  await page.reload();await page.getByLabel('Open design').selectOption(doc.designId);await expect(toolbar).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).studioTestEditor.getShape('shape:order')?.x)).toBe(555);
  expect(await page.evaluate(()=>(window as any).studioTestEditor.getCamera().z)).toBeCloseTo(.7);
  await page.getByLabel('Open design').selectOption('large_test');await expect(page.getByTestId('studio-component')).toHaveCount(60);await expect(page.getByRole('img',{name:'Diagram minimap'})).toBeVisible();
  await page.waitForTimeout(120);
  expect(await page.evaluate(()=>{const e=(window as any).studioTestEditor;return e.getViewportPageBounds().contains(e.getCurrentPageBounds());})).toBe(true);
  await toolbar.getByRole('button',{name:'Minimap',exact:true}).click();await expect(page.getByRole('img',{name:'Diagram minimap'})).toHaveCount(0);
  await page.screenshot({path:'test-results/ai-design-studio/viewport-large.png'});
  expect(errors).toEqual([]);
});
