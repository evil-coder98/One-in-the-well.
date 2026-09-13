import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
let renderer, scene, camera, clock, player, monster, flashlight, redLight;
let mode='steals', active=false, maze=[], N=21, cell=3, orbs=[], solids=[], furniture=[], keys={}, yaw=0, pitch=0;
let move={x:0,y:0}, running=false, touchRun=false, orbLeft=25, batteries=10, aggression=0, threshold=3, state='stalk', stateTime=0, chaseLength=20, stun=0, path=[], pathTimer=0, toastTime=0, flashCooldown=0;
const WALK=2.1, RUN=4.2, MONSTER=4.2;
const v3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function init(){
 renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false}); renderer.setPixelRatio(1); renderer.setSize(innerWidth,innerHeight); renderer.outputColorSpace=THREE.SRGBColorSpace;
 scene=new THREE.Scene(); scene.background=new THREE.Color(0x000000); scene.fog=new THREE.FogExp2(0x000000,.055);
 camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.08,90); camera.rotation.order='YXZ';
 clock=new THREE.Clock(); player=new THREE.Object3D();
 flashlight=new THREE.SpotLight(0xe9f1ff, mode==='steals'?32:0, 24, Math.PI/5, .5, 1.5); flashlight.position.set(0,0,0); flashlight.target.position.set(0,0,-1); camera.add(flashlight,flashlight.target); camera.add(new THREE.PointLight(0xcbdcff,1.3,5)); scene.add(camera);
 scene.add(new THREE.AmbientLight(0xffffff,.035));
 window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
 makeMonster(); bindUI(); loop();
}
const material=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
function addBox(w,h,d,mat,x,y,z,arr=solids){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);scene.add(o);if(arr)arr.push(o);return o;}
function makeMonster(){
 monster=new THREE.Group(); const body=material(0x080808), edge=material(0x171717), eye=new THREE.MeshBasicMaterial({color:0xff0909});
 // Long, unmistakable two-legged silhouette: no torso, oversized cube head.
 const head=new THREE.Mesh(new THREE.BoxGeometry(1.02,.92,.92),body);head.position.y=3.05;monster.add(head);
 for(const s of [-1,1]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.48,2.55,.52),body);leg.position.set(s*.39,1.28,0);monster.add(leg);const e=new THREE.Mesh(new THREE.SphereGeometry(.145,7,6),eye);e.position.set(s*.25,3.1,-.475);monster.add(e)}
 const glow=new THREE.PointLight(0xff0808,0,14,2);glow.position.set(0,3,-.4);monster.add(glow);monster.userData.glow=glow;
 redLight=new THREE.SpotLight(0xff1010,0,28,Math.PI/3,.55,1.3);redLight.position.set(0,2.8,-.2);redLight.target.position.set(0,2.5,-1);monster.add(redLight,redLight.target);scene.add(monster);
}
function generateMaze(){
 maze=Array.from({length:N},()=>Array(N).fill(1));const stack=[[1,1]];maze[1][1]=0;
 while(stack.length){const [x,z]=stack[stack.length-1],opts=[];for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]){let nx=x+dx,nz=z+dz;if(nx>0&&nz>0&&nx<N-1&&nz<N-1&&maze[nz][nx])opts.push([nx,nz,dx,dz])}if(!opts.length){stack.pop();continue}const [nx,nz,dx,dz]=opts[Math.floor(Math.random()*opts.length)];maze[z+dz/2][x+dx/2]=0;maze[nz][nx]=0;stack.push([nx,nz]);}
 // Make small rooms and loops while retaining connected paths.
 for(let z=2;z<N-2;z+=4)for(let x=2;x<N-2;x+=4)if(Math.random()<.48){for(let dz=0;dz<2;dz++)for(let dx=0;dx<2;dx++)maze[z+dz][x+dx]=0;}
 for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++)if(maze[z][x]&&Math.random()<.045&&((!maze[z-1][x]&&!maze[z+1][x])||(!maze[z][x-1]&&!maze[z][x+1])))maze[z][x]=0;
}
function clearWorld(){for(const o of [...solids,...furniture,...orbs]){scene.remove(o);o.geometry?.dispose()}solids=[];furniture=[];orbs=[];}
const wx=x=>(x-(N-1)/2)*cell, wz=z=>(z-(N-1)/2)*cell;
function buildWorld(){
 clearWorld();generateMaze();const black=material(0x101010),white=material(0xbcbcbc),floorBlack=material(0x080808),floorWhite=material(0x777777),furn=material(0x252525);
 // Checkerboard floor and ceiling; wall faces alternate monochrome panels.
 for(let z=0;z<N;z++)for(let x=0;x<N;x++){const X=wx(x),Z=wz(z);if(maze[z][x]){addBox(cell,3.5,cell,black,X,1.75,Z);continue;}addBox(cell,.12,cell,(x+z)%2?floorWhite:floorBlack,X,-.08,Z,null);addBox(cell,.12,cell,(x+z)%2?floorBlack:floorWhite,X,3.5,Z,null);
 if(Math.random()<.065&&!(x===1&&z===1)){const type=Math.random();if(type<.55){addBox(1.15,.85,.75,furn,X,.48,Z,furniture);addBox(1.2,.08,.8,edgeMat(),X,.93,Z,furniture);}else{addBox(.65,1.35,.65,furn,X,.67,Z,furniture);addBox(.72,.08,.72,edgeMat(),X,1.36,Z,furniture);}}
 }
 // Player starts inside the entrance; orb locations are unique walkable cells.
 player.position.set(wx(1),1.62,wz(1)); yaw=0;pitch=0;
 const cells=[];for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++)if(!maze[z][x]&&!(x===1&&z===1))cells.push([x,z]);shuffle(cells);
 for(let i=0;i<25;i++){const [x,z]=cells[i];const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,1),new THREE.MeshBasicMaterial({color:0x168dff}));orb.position.set(wx(x),.95,wz(z));scene.add(orb);const glow=new THREE.PointLight(0x087dff,1.1,4);glow.position.copy(orb.position);scene.add(glow);solids.push(glow);orb.userData.glow=glow;orbs.push(orb);}
 const far=farthest([1,1]);monster.position.set(wx(far[0]),0,wz(far[1]));monster.rotation.y=Math.random()*Math.PI*2;
 orbLeft=25;batteries=10;aggression=0;threshold=2+Math.floor(Math.random()*4);state='stalk';stateTime=0;path=[];pathTimer=0;stun=0;flashCooldown=0;
}
function edgeMat(){return material(0x353535)}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}}
function gridAt(x,z){return [Math.round(x/cell+(N-1)/2),Math.round(z/cell+(N-1)/2)]}
function openCell(x,z){return x>=0&&z>=0&&x<N&&z<N&&maze[z][x]===0}
function canOccupy(x,z,r=.28){const pts=[[x-r,z],[x+r,z],[x,z-r],[x,z+r],[x-r*.7,z-r*.7],[x+r*.7,z-r*.7],[x-r*.7,z+r*.7],[x+r*.7,z+r*.7]];return pts.every(([a,b])=>{const [gx,gz]=gridAt(a,b);return openCell(gx,gz)})}
function movePlayer(dx,dz){let nx=player.position.x+dx,nz=player.position.z+dz;if(canOccupy(nx,player.position.z))player.position.x=nx;if(canOccupy(player.position.x,nz))player.position.z=nz;}
function bfs(start,goal){const q=[start],prev=new Map([[start.join(','),null]]);for(let i=0;i<q.length;i++){const p=q[i];if(p[0]===goal[0]&&p[1]===goal[1])break;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=[p[0]+dx,p[1]+dz],k=n.join(',');if(openCell(...n)&&!prev.has(k)){prev.set(k,p);q.push(n)}}}let k=goal.join(',');if(!prev.has(k))return[];const out=[];while(k){const p=k.split(',').map(Number);out.unshift(p);const before=prev.get(k);k=before?before.join(','):null;}return out;}
function allOpen(){const a=[];for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++)if(!maze[z][x])a.push([x,z]);return a;}
function farthest(from){const reachable=bfs(from,allOpen().at(-1)); // use BFS distances from source for true furthest reachable
 const q=[from],dist=new Map([[from.join(','),0]]);for(let i=0;i<q.length;i++){const p=q[i];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=[p[0]+dx,p[1]+dz],k=n.join(',');if(openCell(...n)&&!dist.has(k)){dist.set(k,dist.get(p.join(','))+1);q.push(n)}}}let best=from,bd=-1;for(const p of q){const d=dist.get(p.join(','));if(d>bd){bd=d;best=p}}return best;}
function nearestCell(pos){let p=gridAt(pos.x,pos.z);if(openCell(...p))return p;return allOpen().sort((a,b)=>Math.hypot(wx(a[0])-pos.x,wz(a[1])-pos.z)-Math.hypot(wx(b[0])-pos.x,wz(b[1])-pos.z))[0]||[1,1];}
function start(m){mode=m;active=true;$('menu').hidden=true;$('ending').hidden=true;$('hud').hidden=false;$('battery').hidden=mode!=='shutter';$('action').hidden=mode!=='shutter';$('runWarning').hidden=true;$('toast').textContent='';buildWorld();flashlight.intensity=mode==='steals'?32:0;clock.getDelta();}
function notify(text,seconds=1){$('toast').textContent=text;toastTime=seconds;}
function triggerFlash(){if(!active||mode!=='shutter'||batteries<=0||flashCooldown>0)return;batteries--;flashCooldown=.45;cameraFlash=.18;if(state==='chase'){stun=5;notify('LEGS STUNNED',1.2);return;}if(state==='stalk'){scareAway();}}
let cameraFlash=0;
function scareAway(){aggression++;state='retreat';stateTime=0;const p=nearestCell(player.position),goal=farthest(p);path=bfs(nearestCell(monster.position),goal);pathTimer=0;if(aggression>=threshold){state='trigger';stateTime=0;$('runWarning').hidden=false;}}
function updateMonster(dt){stateTime+=dt;if(stun>0){stun=Math.max(0,stun-dt);redLight.intensity=0;return;}
 if(state==='trigger'){if(stateTime>=3){state='chase';stateTime=0;chaseLength=15+Math.random()*15;$('runWarning').hidden=true;notify('');}return;}
 if(state==='chase'&&stateTime>=chaseLength){state='retreat';stateTime=0;path=[];}
 if(state==='stalk'||state==='chase'){
  pathTimer-=dt;if(pathTimer<=0){pathTimer=state==='chase'?.35:1.2;const p=nearestCell(player.position),m=nearestCell(monster.position);let goal=p;
   if(state==='stalk'){// choose a reachable cell behind the player's facing direction when possible
    const behind=[p[0]-Math.round(Math.sin(yaw)),p[1]+Math.round(Math.cos(yaw))];goal=openCell(...behind)?behind:farthest(p);
   }path=bfs(m,goal);
  }
  const speed=state==='chase'?MONSTER*2*(running?1.35:1):MONSTER*(running?1.2:1);followPath(dt,speed);
  const chasing=state==='chase';monster.userData.glow.intensity=chasing?2.5:0;redLight.intensity=chasing?18:0;
  if(monster.position.distanceTo(player.position)<.72&&chasing){state='caught';stateTime=0;notify('CAUGHT',2);}
 }else if(state==='retreat'){followPath(dt,MONSTER*3);if(!path.length||stateTime>12){state='stalk';stateTime=0;path=[];}}
 else if(state==='caught'&&stateTime>1.5){active=false;$('hud').hidden=true;$('ending').hidden=false;$('endingTitle').textContent='YOU WERE CAUGHT';$('endingText').textContent='LEGS found you.';}
}
function followPath(dt,speed){if(!path.length)return;let [x,z]=path[0],tx=wx(x),tz=wz(z),dx=tx-monster.position.x,dz=tz-monster.position.z,d=Math.hypot(dx,dz);if(d<.18){path.shift();return;}const step=Math.min(d,speed*dt);monster.position.x+=dx/d*step;monster.position.z+=dz/d*step;monster.rotation.y=Math.atan2(-dx,-dz);}
function updateMap(){const c=$('mapCanvas').getContext('2d'),w=150;c.clearRect(0,0,w,w);c.fillStyle='#030303';c.fillRect(0,0,w,w);const [px,pz]=gridAt(player.position.x,player.position.z),s=5;for(let z=Math.max(0,pz-14);z<Math.min(N,pz+15);z++)for(let x=Math.max(0,px-14);x<Math.min(N,px+15);x++)if(!maze[z][x]){c.fillStyle='#202020';c.fillRect(w/2+(x-px)*s,w/2+(z-pz)*s,s,s)}for(const o of orbs)if(o.visible&&o.position.distanceTo(player.position)<12){const [x,z]=gridAt(o.position.x,o.position.z);c.fillStyle='#168dff';c.fillRect(w/2+(x-px)*s-1,w/2+(z-pz)*s-1,3,3)}c.fillStyle='#fff';c.beginPath();c.arc(w/2,w/2,3,0,Math.PI*2);c.fill();c.strokeStyle='#fff';c.beginPath();c.moveTo(w/2,w/2);c.lineTo(w/2+Math.sin(yaw)*10,w/2-Math.cos(yaw)*10);c.stroke();}
function update(dt){if(!active)return;const forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+move.y,side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+move.x;let len=Math.hypot(forward,side);let f=forward,s=side;if(len>1){f/=len;s/=len;}running=!!(keys.ShiftLeft||keys.ShiftRight||touchRun);const speed=running?RUN:WALK;movePlayer((Math.sin(yaw)*f+Math.cos(yaw)*s)*speed*dt,(-Math.cos(yaw)*f+Math.sin(yaw)*s)*speed*dt);
 camera.position.copy(player.position);camera.rotation.set(pitch,yaw,0,'YXZ');flashlight.intensity=mode==='steals'?32:0;
 // In IT STEALS, aim the always-on flashlight at LEGS to repel him; no camera button is shown.
 if(mode==='steals'&&state==='stalk'&&flashCooldown<=0){const to=monster.position.clone().add(v3(0,2.3,0)).sub(camera.position);const d=to.length();to.normalize();const forward=v3(0,0,-1).applyEuler(camera.rotation);if(d<19&&forward.dot(to)>.94){flashCooldown=1.1;scareAway();}}
 if(cameraFlash>0){cameraFlash-=dt;flashlight.intensity=mode==='shutter'?90:32;}
 if(flashCooldown>0)flashCooldown-=dt;
 for(const o of orbs){if(!o.visible)continue;o.rotation.y+=dt*1.1;o.userData.glow.intensity=1.1+Math.sin(performance.now()*.004)*.3;if(o.position.distanceTo(player.position)<.78){o.visible=false;o.userData.glow.visible=false;orbLeft--;if(mode==='shutter')batteries=Math.min(10,batteries+1);$('orbCount').textContent=`BLUE ORBS: ${orbLeft}`;notify(`${orbLeft} BLUE ORBS LEFT`,1);if(orbLeft===0){active=false;$('hud').hidden=true;$('ending').hidden=false;$('endingTitle').textContent='YOU ESCAPED';$('endingText').textContent='All 25 blue orbs collected.';}}}
 updateMonster(dt);const distance=monster.position.distanceTo(player.position);const shake=(state==='chase'?Math.max(0,(8-distance)/8)*.035:Math.max(0,(4-distance)/4)*.012);if(shake){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;}if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').textContent='';}$('battery').textContent=`BATTERY: ${batteries}`;updateMap();
}
function loop(){requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.05);update(dt);renderer.render(scene,camera);}
function bindUI(){document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mode)start(b.dataset.mode);else notify('COMING SOON');}));$('quit').addEventListener('click',()=>{active=false;$('hud').hidden=true;$('menu').hidden=false;});$('back').addEventListener('click',()=>{$('ending').hidden=true;$('menu').hidden=false;});$('action').addEventListener('pointerdown',e=>{e.preventDefault();triggerFlash()});$('run').addEventListener('pointerdown',e=>{e.preventDefault();touchRun=true});for(const ev of ['pointerup','pointercancel','pointerleave'])$('run').addEventListener(ev,()=>touchRun=false);
 window.addEventListener('keydown',e=>{keys[e.code]=true;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='Space')triggerFlash();});window.addEventListener('keyup',e=>keys[e.code]=false);
 let lookId=null,lastX=0,lastY=0;canvas.addEventListener('pointerdown',e=>{if(!active)return;lookId=e.pointerId;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(lookId!==e.pointerId)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.0025;pitch=Math.max(-1.25,Math.min(1.25,pitch-dy*.0022));});for(const ev of ['pointerup','pointercancel'])canvas.addEventListener(ev,()=>lookId=null);
 const stick=$('stick'),nub=stick.querySelector('i');let stickId=null,rect;function moveStick(e){const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;let dx=e.clientX-cx,dy=e.clientY-cy,r=35,d=Math.hypot(dx,dy);if(d>r){dx=dx/d*r;dy=dy/d*r;}nub.style.transform=`translate(${dx}px,${dy}px)`;move.x=dx/r;move.y=-dy/r;}stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;rect=stick.getBoundingClientRect();stick.setPointerCapture(e.pointerId);moveStick(e)});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e)});function reset(){stickId=null;move={x:0,y:0};nub.style.transform='';}stick.addEventListener('pointerup',reset);stick.addEventListener('pointercancel',reset);
}
init();
