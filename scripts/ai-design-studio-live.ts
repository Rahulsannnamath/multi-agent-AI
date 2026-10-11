import dotenv from 'dotenv';
import { mkdirSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { generateDiagram,editDiagram,explainDiagram } from '../backend/api/src/ai-design-studio/ai.js';
import { applyOperations } from '@multi-agent/ai-design-studio';
dotenv.config({path:'.env'});
mkdirSync('test-results/ai-design-studio',{recursive:true});
async function main() {
console.log('Verifying configured model:',process.env['OPENAI_MODEL']);
for(const [mode,prompt] of [['hld','Design a scalable URL shortener. Explain assumptions and bottlenecks without invented guarantees.'],['uml_class','Generate an e-commerce UML class diagram containing User, Customer, Admin, Product, ShoppingCart, CartItem, Order, OrderItem, Payment, Coupon, and PaymentService. Include attributes, methods, inheritance, composition, associations and valid multiplicities.']] as const){
  const graph=await generateDiagram(prompt,mode);
  assert.ok(graph.components.length>1);assert.ok(graph.connections.length>0);
  writeFileSync(`test-results/ai-design-studio/live-${mode}.json`,JSON.stringify(graph,null,2));
  console.log(`${mode}: ${graph.components.length} editable components, ${graph.connections.length} validated connections`);
  if(mode==='uml_class'){
    const modified=structuredClone(graph);modified.components[0].description='Manual responsibility edit to preserve';
    const plan=await editDiagram(modified,[],'Add a PaymentGateway interface and connect PaymentService to it using realization. Do not change any existing component.',7);
    const edited=applyOperations(modified,plan.operations);
    for(const c of modified.components) assert.deepEqual(edited.components.find(v=>v.id===c.id),c);
    writeFileSync('test-results/ai-design-studio/live-plan.json',JSON.stringify(plan,null,2));
    console.log(`Incremental edit: ${plan.operations.length} operations; existing members preserved`);
    const explanation=await explainDiagram(edited,'Explain the payment relationships.');assert.ok(explanation.explanation);
    console.log('Explanation verified');
  }
}
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Live verification failed'); process.exitCode=1; });
