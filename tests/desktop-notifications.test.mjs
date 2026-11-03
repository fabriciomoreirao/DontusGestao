import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {safeNotificationUrl,updateDesktopBadge} from '../lib/desktop-notifications.ts';

test('notification clicks stay inside the application origin',()=>{
  const origin='https://gestao.example.com';
  assert.equal(safeNotificationUrl('/?mod=tasks&task=123',origin),`${origin}/?mod=tasks&task=123`);
  for(const url of ['https://other.example.com/','//other.example.com/','javascript:alert(1)','data:text/html,test'])
    assert.equal(safeNotificationUrl(url,origin),`${origin}/`);
});

test('reading all notifications clears the operating-system badge',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');const calls=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{setAppBadge:async count=>calls.push(count),clearAppBadge:async()=>calls.push('clear')}});
  try{await updateDesktopBadge(12);await updateDesktopBadge(0);assert.deepEqual(calls,[12,'clear']);}
  finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});

test('installation manifest references valid square PNG icons at the declared sizes',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest',import.meta.url)));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
  for(const icon of manifest.icons){
    const png=fs.readFileSync(new URL(`../public${icon.src}`,import.meta.url));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
  }
});
