import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error')console.log('browser console:',msg.text().slice(0,300));});
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5173/?backend=wasm');
 await page.screenshot({path:'/tmp/face2polygon-initial.png',fullPage:true});
 await page.getByRole('button',{name:'Enable camera'}).click();
 const monitor=setInterval(async()=>{console.log('Status:',await page.getByRole('status').textContent().catch(()=>''),await page.getByRole('alert').allTextContents().catch(()=>[]));},10000);
 monitor.unref();
 await page.getByRole('button',{name:'Stop camera'}).waitFor({timeout:120000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
 await page.getByRole('status').filter({hasText:/Looking for a head|Tracking primary head/}).waitFor({timeout:120000});
 console.log('Real model warmup and fake-webcam inference passed:',await page.getByRole('status').textContent());
 await page.getByRole('button',{name:'Transparent',exact:true}).click();
 await page.waitForTimeout(1500);
 const alpha=await page.locator('canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,1,1).data[3]);
 assert.equal(alpha,0);
 await page.getByRole('button',{name:'Stop camera'}).click();
 assert.equal(await page.locator('video').evaluate(v=>v.srcObject),null);
 assert.deepEqual(errors,[]);
 console.log('Transparent background and stream cleanup passed.');
 // Exercise polygon rendering in the browser with controlled landmark geometry.
 if(!process.env.APP_URL) {
 const meshResult=await page.evaluate(async()=>{
   const {PolygonMesh}=await import('/src/mesh.ts');
   const points=new Float32Array(136);
   for(let i=0;i<68;i++){points[i*2]=320+100*Math.cos(i*2.4);points[i*2+1]=260+100*Math.sin(i*2.4);}
   points.set([260,220],72);points.set([380,220],90);points.set([320,380],16);
   const mesh=new PolygonMesh();mesh.update({box:{x1:200,y1:80,x2:440,y2:400,score:1},points,visibility:new Uint8Array(68).fill(2)},0,33);
   const frame=new ImageData(640,480);for(let i=0;i<frame.data.length;i+=4){frame.data.set([160,120,90,255],i);}
   const c=document.querySelector('canvas');const ctx=c.getContext('2d');ctx.clearRect(0,0,640,480);mesh.draw(ctx,frame,false);
   const data=ctx.getImageData(0,0,640,480).data;let opaque=0;for(let i=3;i<data.length;i+=4)if(data[i])opaque++;
   return {opaque,corner:data[3],facets:mesh.triangles.length/3};
 });
 assert.ok(meshResult.opaque>10000);assert.equal(meshResult.corner,0);console.log('Polygon rendering passed:',meshResult);
 }
}finally{await browser.close();}
