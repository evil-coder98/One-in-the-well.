import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const CONFIG={
  radius:3.35,
  barLength:3.75,
  barRadius:.075,
  layerHeight:2.65,
  maxBarsPerLayer:3,
  looseBase:.10,
  looseMax:.333,
  obstacleBase:.045,
  obstacleMax:.18,
  boardBase:.025,
  boardMax:.12,
  obstacleStartMin:10,
  boardStartMin:25,
  twoMin:45,
  twoMax:115,
  creatureStartDistanceMin:3,
  creatureStartDistanceMax:7,
  creatureStep:.95,
  creatureBarsMin:9,
  creatureBarsMax:22,
  infiniteAfter:3,
  infiniteChance:.14,
  climbTime:.42,
  pryTime:2.2,
  pixelScale:1.55
};

const gameEl=document.querySelector("#game");
const startScreen=document.querySelector("#start-screen");
const deathScreen=document.querySelector("#death-screen");
const startButton=document.querySelector("#start-button");
const hardButton=document.querySelector("#hard-button");
const restartButton=document.querySelector("#restart-button");
const message=document.querySelector("#message");
const counter=document.querySelector("#bar-counter");

let scene,camera,renderer,raycaster;
let barsGroup,obstaclesGroup,boardsGroup;
let bars=new Map(),layers=new Map(),obstacles=new Map(),boards=new Map();
let player={layer:0,barId:null,x:0,y:1,z:0};
let running=false,dead=false,hard=false,climbing=false;
let climb={start:0,duration:CONFIG.climbTime,from:{x:0,y:0,z:0},to:{x:0,y:0,z:0}};
let milestones={loose:20,obstacle:35,board:60,two:90};
let looseChance=.1,obstacleChance=.045,boardChance=.025;
let chaseCount=0;
let creature={active:false,layer:-99,stepsLeft:0,nextStep:0,infinite:false,speed:CONFIG.creatureStep};
let shake={amount:0,time:0};
let yaw=0,pitch=.05,pointer=null,moved=false;
let audio=null,last=performance.now();

const matWall=new THREE.MeshStandardMaterial({color:0x272727,roughness:1,side:THREE.DoubleSide});
const matStone=new THREE.MeshStandardMaterial({color:0x363636,roughness:1});
const matBar=new THREE.MeshStandardMaterial({color:0x777777,roughness:.9,metalness:.35});
const matLoose=new THREE.MeshStandardMaterial({color:0x8f5b3d,roughness:1,metalness:.1});
const matWood=new THREE.MeshStandardMaterial({color:0x5b3d25,roughness:1});
const matObstacle=new THREE.MeshStandardMaterial({color:0x191919,roughness:1});

function ri(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function smooth(t){return t*t*(3-2*t)}

function init(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x020202);
  scene.fog=new THREE.FogExp2(0x020202,.075);

  camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.03,100);
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(1);
  renderer.setSize(Math.max(320,Math.floor(innerWidth/CONFIG.pixelScale)),Math.max(240,Math.floor(innerHeight/CONFIG.pixelScale)),false);
  renderer.domElement.style.width="100vw";
  renderer.domElement.style.height="100vh";
  gameEl.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x777777,.34));
  const light=new THREE.PointLight(0x9ba8b8,2.2,9);
  light.position.set(0,1,0);
  scene.add(light);

  barsGroup=new THREE.Group(); obstaclesGroup=new THREE.Group(); boardsGroup=new THREE.Group();
  scene.add(barsGroup,obstaclesGroup,boardsGroup);
  raycaster=new THREE.Raycaster();

  createWell();
  resetRun();

  renderer.domElement.addEventListener("pointerdown",down);
  renderer.domElement.addEventListener("pointermove",move);
  renderer.domElement.addEventListener("pointerup",up);
  renderer.domElement.addEventListener("pointercancel",up);
  addEventListener("resize",resize);

  // Use both pointerup and click. This is deliberately redundant because
  // Safari/iPad can treat a first touch differently when WebGL has just loaded.
  const bindButton=(button,fn)=>{
    let handled=0;
    const fire=(e)=>{
      e.preventDefault();
      const now=performance.now();
      if(now-handled<350)return;
      handled=now;
      fn();
    };
    button.addEventListener("pointerup",fire,{passive:false});
    button.addEventListener("touchend",fire,{passive:false});
    button.addEventListener("click",fire,{passive:false});
  };
  bindButton(startButton,()=>start(false));
  bindButton(hardButton,()=>start(true));
  bindButton(restartButton,()=>start(hard));
  requestAnimationFrame(loop);
}

function createWell(){
  // Low-poly wall with visible inside faces. It is segmented so the player
  // can see the claustrophobic wall instead of being surrounded by fog only.
  const segments=16;
  const geo=new THREE.CylinderGeometry(CONFIG.radius,CONFIG.radius,220,segments,1,true,0,Math.PI*2);
  const wall=new THREE.Mesh(geo,matWall);
  wall.position.y=105;
  scene.add(wall);

  // Rough stones around the lower wall.
  for(let i=0;i<32;i++){
    const a=i/32*Math.PI*2;
    const s=.3+Math.random()*.35;
    const stone=new THREE.Mesh(new THREE.BoxGeometry(s,.35+Math.random()*.5,s),matStone);
    stone.position.set(Math.cos(a)*(CONFIG.radius-.05),-1.1,Math.sin(a)*(CONFIG.radius-.05));
    stone.rotation.y=a+Math.random();
    scene.add(stone);
  }

  const bottom=new THREE.Mesh(new THREE.CylinderGeometry(CONFIG.radius-.05,CONFIG.radius-.05,.25,16),matStone);
  bottom.position.y=-1.5;
  scene.add(bottom);
}

function resetRun(){
  bars.clear();layers.clear();obstacles.clear();boards.clear();
  for(const g of [barsGroup,obstaclesGroup,boardsGroup]) while(g.children.length)g.remove(g.children[0]);

  player={layer:0,barId:null,x:0,y:0,z:0};
  creature={active:false,layer:-99,stepsLeft:0,nextStep:0,infinite:false,speed:CONFIG.creatureStep/(hard?1.5:1)};
  chaseCount=0;
  shake={amount:0,time:0};

  // Explicitly ordered milestones. The old prototype could leave these
  // effectively unobserved because only one bar existed per layer and the
  // progression was not designed around multiple routes.
  milestones.loose=ri(CONFIG.obstacleStartMin,30);
  milestones.obstacle=ri(milestones.loose+8,Math.max(milestones.loose+9,55));
  milestones.board=ri(milestones.obstacle+12,Math.max(milestones.obstacle+13,95));
  milestones.two=ri(Math.max(CONFIG.twoMin,milestones.board+12),CONFIG.twoMax);

  buildLayers(0,70);
  chooseStartingBar();
  showMessage("ONE IN THE WELL.",1800);
  counter.textContent="LAYER 0";
}

function buildLayers(from,to){
  for(let layer=from;layer<=to;layer++){
    if(!layers.has(layer))createLayer(layer);
  }
}

function createLayer(layer){
  if(layers.has(layer))return;
  const count=ri(1,3);
  const arr=[];

  // Increasing density is gradual. Every layer still has 1-3 bars.
  const progression=clamp(layer/Math.max(1,milestones.two),0,1);
  looseChance=Math.min(CONFIG.looseMax,CONFIG.looseBase+progression*.235);
  obstacleChance=Math.min(CONFIG.obstacleMax,CONFIG.obstacleBase+progression*.135);
  boardChance=Math.min(CONFIG.boardMax,CONFIG.boardBase+progression*.095);

  const occupied=[];
  for(let i=0;i<count;i++){
    let angle=0;
    for(let tries=0;tries<20;tries++){
      angle=Math.random()*Math.PI*2;
      if(occupied.every(a=>Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a)))>.65))break;
    }
    occupied.push(angle);

    const id=`${layer}:${i}`;
    const radius=CONFIG.radius-.16;
    const group=new THREE.Group();
    group.position.set(Math.cos(angle)*radius,layer*CONFIG.layerHeight,Math.sin(angle)*radius);
    group.rotation.y=angle;

    const loose=Math.random()<looseChance;
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(CONFIG.barRadius,CONFIG.barRadius,CONFIG.barLength,6),loose?matLoose:matBar);
    mesh.rotation.z=Math.PI/2;
    mesh.userData={kind:"bar",id,layer,loose};
    group.add(mesh);
    barsGroup.add(group);

    const data={id,layer,angle,group,mesh,loose,detached:false,heldAt:0};
    bars.set(id,data);
    arr.push(data);
  }
  layers.set(layer,arr);

  // Obstacles are generated after the first safe stretch and can span layers.
  if(layer>=milestones.obstacle && Math.random()<obstacleChance) {
    const height=ri(1,Math.random()<.28?6:3);
    if(layer+height<=to)createObstacle(layer,height);
  }

  if(layer>=milestones.board && Math.random()<boardChance) {
    const height=ri(1,Math.random()<.22?4:2);
    createBoard(layer,height);
  }
}

function createObstacle(start,height){
  const id=`o${start}_${Math.random()}`;
  const angle=Math.random()*Math.PI*2;
  const width=Math.random()<.5?Math.PI/2:Math.PI;
  const radius=CONFIG.radius-.35;

  // A low-poly annular sector, like a quarter/half of the well wall.
  const shape=new THREE.Shape();
  const outer=radius,inner=.35;
  const steps=6;
  for(let i=0;i<=steps;i++){
    const a=angle-width/2+width*i/steps;
    shape.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);
  }
  for(let i=steps;i>=0;i--){
    const a=angle-width/2+width*i/steps;
    shape.lineTo(Math.cos(a)*inner,Math.sin(a)*inner);
  }
  shape.closePath();

  const geo=new THREE.ExtrudeGeometry(shape,{depth:height*CONFIG.layerHeight,bevelEnabled:false,steps:1});
  const mesh=new THREE.Mesh(geo,matObstacle);
  mesh.rotation.x=Math.PI/2;
  mesh.position.y=start*CONFIG.layerHeight-CONFIG.layerHeight*.5;
  mesh.userData={kind:"obstacle",id};
  obstaclesGroup.add(mesh);
  obstacles.set(id,{id,start,height,angle,width,mesh});
}

function createBoard(start,height){
  const id=`b${start}_${Math.random()}`;
  const angle=Math.random()*Math.PI*2;
  const radius=.05;
  const geo=new THREE.BoxGeometry(CONFIG.radius*2.15,height*CONFIG.layerHeight,.22);
  const mesh=new THREE.Mesh(geo,matWood);
  mesh.position.set(Math.cos(angle)*radius,start*CONFIG.layerHeight+height*CONFIG.layerHeight/2,Math.sin(angle)*radius);
  mesh.rotation.y=angle;
  mesh.userData={kind:"board",id};
  boardsGroup.add(mesh);
  boards.set(id,{id,start,height,mesh,removed:false,prying:false,finish:0});
}

function chooseStartingBar(){
  const first=layers.get(0)[0];
  movePlayerToBar(first);
}

function movePlayerToBar(bar){
  player.barId=bar.id;
  player.layer=bar.layer;
  player.x=bar.group.position.x;
  player.y=bar.group.position.y+1;
  player.z=bar.group.position.z;
}

function nextBars(){
  buildLayers(player.layer+1,player.layer+4);
  return layers.get(player.layer+1)||[];
}

function isBlocked(layer){
  for(const b of boards.values()){
    if(!b.removed && layer>=b.start && layer<b.start+b.height)return true;
  }
  return false;
}

function tapBar(bar){
  if(climbing||dead||!running)return;
  if(bar.layer!==player.layer+1)return;

  if(bar.loose && bar.detached)return;
  if(isBlocked(bar.layer)){
    const board=[...boards.values()].find(b=>!b.removed&&bar.layer>=b.start&&bar.layer<b.start+b.height);
    if(board){startPry(board);return}
  }

  bar.heldAt=performance.now();
  climbing=true;
  climb.start=performance.now();
  climb.from={x:player.x,y:camera.position.y,z:player.z};
  climb.to={x:bar.group.position.x,y:bar.group.position.y+1,z:bar.group.position.z};
  climb.duration=CONFIG.climbTime;
  player.barId=bar.id;
  play("grab");
}

function startPry(board){
  if(board.prying||board.removed)return;
  board.prying=true;
  board.finish=performance.now()+CONFIG.pryTime*1000;
  play("pry");
}

function updatePry(now){
  for(const b of boards.values()){
    if(!b.prying||b.removed)continue;
    const t=clamp(1-(b.finish-now)/(CONFIG.pryTime*1000),0,1);
    b.mesh.rotation.z=t*-.28;
    b.mesh.position.y-=Math.sin(t*Math.PI)*.002;
    if(t>=1){
      b.removed=true;b.prying=false;
      boardsGroup.remove(b.mesh);
      play("break");
    }
  }
}

function finishClimb(now){
  const bar=bars.get(player.barId);
  if(!bar){climbing=false;return}

  if(bar.loose){
    const held=(now-bar.heldAt)/1000;
    if(held>3){
      die("The loose bar gave way.");
      return;
    }
  }

  movePlayerToBar(bar);
  camera.position.set(player.x,player.y,player.z);
  climbing=false;
  counter.textContent=`LAYER ${player.layer}`;

  if(player.layer===milestones.two)showMessage("TWO IN THE WELL.",2300);
  if(player.layer>=milestones.two)maybeHorror();

  // A loose bar can be survived only if the climb itself finishes in time.
  // Once standing on it, it becomes stable enough for the next move.
  ensureFutureWorld();
}

function ensureFutureWorld(){
  buildLayers(player.layer+1,player.layer+75);
}

function maybeHorror(){
  if(creature.active)return;
  if(Math.random()<.019){
    startChase();
    return;
  }
  if(Math.random()<.035)play("ambient");
  if(Math.random()<.018){
    shake.amount=Math.max(shake.amount,.35);
    play("scare");
  }
}

function startChase(){
  chaseCount++;
  creature.active=true;
  creature.layer=Math.max(0,player.layer-ri(CONFIG.creatureStartDistanceMin,CONFIG.creatureStartDistanceMax));
  creature.infinite=chaseCount>=CONFIG.infiniteAfter && Math.random()<CONFIG.infiniteChance;
  creature.stepsLeft=creature.infinite?999999:ri(CONFIG.creatureBarsMin,CONFIG.creatureBarsMax);
  creature.speed=CONFIG.creatureStep/(hard?1.5:1);
  creature.nextStep=performance.now()+600;
  play("chase");
}

function updateCreature(now,dt){
  if(!creature.active){
    shake.amount=Math.max(0,shake.amount-dt*4);
    if(audio)audio.creature(0);
    return;
  }

  if(now>=creature.nextStep){
    creature.layer++;
    creature.stepsLeft--;
    const acceleration=creature.infinite?Math.min(2,1+(chaseCount-2)*.08+Math.max(0,player.layer-creature.layer)*.004):1;
    creature.nextStep=now+creature.speed*1000/acceleration;
    play("clang");
  }

  const distance=player.layer-creature.layer;
  if(distance<=0){die("Something reached your bar.");return}

  const closeness=clamp(1-distance/14,0,1);
  const intensity=Math.pow(closeness,2.3);
  shake.amount=Math.max(shake.amount,intensity);
  shake.time+=dt*(8+85*Math.pow(closeness,2.5));
  if(audio)audio.creature(intensity);

  if(!creature.infinite&&creature.stepsLeft<=0){
    creature.active=false;
    if(audio)audio.creature(0);
  }
}

function die(reason){
  if(dead)return;
  dead=true;running=false;
  if(audio)audio.creature(0);
  deathScreen.classList.remove("hidden");
  play("death");
}

function start(h){
  hard=h;
  console.log("Starting One in the Well:", hard ? "HARD" : "NORMAL");
  if(!audio)audio=new AudioEngine();
  audio.resume();
  startScreen.classList.add("hidden");
  deathScreen.classList.add("hidden");
  running=true;dead=false;
  resetRun();
}

function showMessage(text,time){
  message.textContent=text;
  message.classList.add("show");
  clearTimeout(showMessage.t);
  showMessage.t=setTimeout(()=>message.classList.remove("show"),time);
}

function down(e){
  if(!running||dead)return;
  pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
  moved=false;
  try{renderer.domElement.setPointerCapture(e.pointerId)}catch{}
}

function move(e){
  if(!pointer||e.pointerId!==pointer.id)return;
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  if(Math.abs(dx)+Math.abs(dy)>4)moved=true;
  yaw-=dx*.006;pitch-=dy*.005;
  pitch=clamp(pitch,-1.42,1.42);
  pointer.x=e.clientX;pointer.y=e.clientY;
  camera.rotation.order="YXZ";
  camera.rotation.y=yaw;camera.rotation.x=pitch;
}

function up(e){
  if(!pointer||e.pointerId!==pointer.id)return;
  if(!moved)handleTap(e.clientX,e.clientY);
  pointer=null;
}

function handleTap(x,y){
  const r=renderer.domElement.getBoundingClientRect();
  const v=new THREE.Vector2(((x-r.left)/r.width)*2-1,-((y-r.top)/r.height)*2+1);
  raycaster.setFromCamera(v,camera);

  const boardHits=raycaster.intersectObjects(boardsGroup.children,true);
  if(boardHits.length){
    const id=boardHits[0].object.userData.id;
    const b=boards.get(id);
    if(b&&!b.removed&&b.start<=player.layer+1&&player.layer+1<b.start+b.height){startPry(b);return}
  }

  const hits=raycaster.intersectObjects(barsGroup.children,true);
  if(!hits.length)return;
  const id=hits[0].object.userData.id;
  const b=bars.get(id);
  if(b)tapBar(b);
}

function applyShake(){
  camera.position.x=player.x;
  camera.position.y=climbing?camera.position.y:player.y;
  camera.position.z=player.z;

  camera.rotation.order="YXZ";
  camera.rotation.y=yaw;
  camera.rotation.x=pitch;

  if(shake.amount>0){
    const s=shake.amount;
    camera.rotation.y+=Math.sin(shake.time*1.73)*s*.16;
    camera.rotation.x+=Math.cos(shake.time*2.91)*s*.16;
    camera.rotation.z=Math.sin(shake.time*4.47)*s*.075;
    // At point-blank range the camera moves physically too.
    camera.position.x+=Math.sin(shake.time*5.1)*s*.18;
    camera.position.y+=Math.cos(shake.time*6.7)*s*.18;
    camera.position.z+=Math.sin(shake.time*8.3)*s*.18;
  }
}

function update(dt,now){
  if(!running||dead)return;

  if(climbing){
    const t=clamp((now-climb.start)/(climb.duration*1000),0,1);
    const q=smooth(t);
    camera.position.x=THREE.MathUtils.lerp(climb.from.x,climb.to.x,q);
    camera.position.y=THREE.MathUtils.lerp(climb.from.y,climb.to.y,q);
    camera.position.z=THREE.MathUtils.lerp(climb.from.z,climb.to.z,q);
    if(t>=1)finishClimb(now);
  }

  updatePry(now);
  updateCreature(now,dt);
  applyShake();
}

function loop(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  update(dt,now);
  renderer.render(scene,camera);
  requestAnimationFrame(loop);
}

function resize(){
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(Math.max(320,Math.floor(innerWidth/CONFIG.pixelScale)),Math.max(240,Math.floor(innerHeight/CONFIG.pixelScale)),false);
}

class AudioEngine{
  constructor(){
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();
    this.master=this.ctx.createGain();this.master.gain.value=.65;this.master.connect(this.ctx.destination);
    this.cg=this.ctx.createGain();this.cg.gain.value=0;this.cg.connect(this.master);
    this.osc=this.ctx.createOscillator();this.osc.type="sawtooth";this.osc.frequency.value=43;
    const f=this.ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=180;
    this.osc.connect(f);f.connect(this.cg);this.osc.start();
  }
  resume(){if(this.ctx.state==="suspended")this.ctx.resume()}
  tone(freq,dur,vol,type="sine"){
    this.resume();const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;
    o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0001,vol),t+.01);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02);
  }
  noise(dur,vol,cut=700){
    this.resume();const n=Math.floor(this.ctx.sampleRate*dur),b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
    const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain(),t=this.ctx.currentTime;
    s.buffer=b;f.type="lowpass";f.frequency.value=cut;g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0001,vol),t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(f);f.connect(g);g.connect(this.master);s.start(t);
  }
  creature(i){
    const t=this.ctx.currentTime;
    this.cg.gain.cancelScheduledValues(t);
    this.cg.gain.linearRampToValueAtTime(.003+Math.pow(i,1.65)*.3,t+.06);
    this.osc.frequency.setTargetAtTime(40+i*24,t,.06);
  }
}
function play(type){
  if(!audio)return;
  if(type==="grab")audio.tone(170,.08,.035,"triangle");
  if(type==="pry")audio.tone(75,.16,.035,"square");
  if(type==="break")audio.noise(.35,.11,650);
  if(type==="ambient")audio.tone(90+ri(0,80),.8,.035);
  if(type==="scare"){audio.noise(.5,.18,1100);audio.tone(38,.8,.12,"sawtooth")}
  if(type==="chase"){audio.noise(.65,.2,500);audio.tone(35,1,.1,"sawtooth")}
  if(type==="clang"){audio.tone(58,.25,.055,"square");audio.noise(.13,.05,850)}
  if(type==="death"){audio.noise(.8,.2,400);audio.tone(25,1.1,.15,"sawtooth")}
}

init();
