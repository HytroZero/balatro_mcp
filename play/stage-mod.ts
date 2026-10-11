import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..',import.meta.url)));
const destination = resolve(root,'build/balatro-mcp-mod/balatro_mcp_mod');
await rm(destination,{recursive:true,force:true});
await mkdir(destination,{recursive:true});
await cp(resolve(root,'play/mod'),destination,{recursive:true});
await writeFile(resolve(root,'build/balatro-mcp-mod/PROVENANCE.json'),JSON.stringify({implementation:'balatro_mcp_mod 0.2.0',derivedFrom:'Strategy Forge 0.2.0',packagedBy:'balatro-mcp-server 0.1.0',
  transport:'Independent HTTP JSON-RPC over LuaSocket',dependencies:['Steamodded','LuaSocket'],targetGame:'PC Balatro 1.0.1o',
  originalSourcePatches:[],balatrobotCodeIncluded:false},null,2));
console.log('Standalone mod staged: ' + destination + '\nCopy this balatro_mcp_mod directory to the game Mods directory.');
