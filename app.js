/* CLICK ME – DEMO MODE front-end build.
   Data lives in this browser (localStorage). This is NOT secure for real money:
   production needs a server, database, ad provider and payment provider (see README notes in the page). */
const K='clickme_db_v1',$=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const def=()=>({users:[],tx:[],wd:[],subs:[],admin:null,
 tasks:[{id:'t1',title:'Complete your profile',desc:'Review your account details on the Profile page, then submit for approval.',reward:0.05,active:true}],
 ads:[{id:'a1',title:'Rewarded video – short',reward:0.18,secs:15,active:true},{id:'a2',title:'Rewarded video – extended',reward:0.28,secs:30,active:true}],
 set:{rate:300,rateNote:'Set by admin',min:200,demo:true,provider:false,bonus:0.05,maxAds:20,cool:60,revenue:0}});
let db=JSON.parse(localStorage.getItem(K)||'null')||def();
const save=()=>localStorage.setItem(K,JSON.stringify(db));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const mkSalt=()=>hex(crypto.getRandomValues(new Uint8Array(16)));
async function hp(pw,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:150000,hash:'SHA-256'},k,256))}
const usd=n=>'$'+(+n).toFixed(2), lkr=n=>'Rs '+(n*db.set.rate).toLocaleString('en-LK',{maximumFractionDigits:2});
const both=n=>usd(n)+' · '+lkr(n);
const dt=t=>new Date(t).toLocaleString();
const logo=`<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2f7bff"/><path d="M10 8l12 8-5 1.5L20 24l-3 1-3-6.5L10 22z" fill="#fff"/></svg>CLICK ME`;
const A=()=>$('#app');let page='dash',cur='USD',atab='users',q='',adT=null;

/* session */
const sid=()=>localStorage.getItem('cm_s')||sessionStorage.getItem('cm_s');
const me=()=>db.users.find(u=>u.id===sid());
const isAdmin=()=>sessionStorage.getItem('cm_a')==='1';
/* wallet maths (always computed server-side-style from records) */
const held=u=>db.wd.filter(w=>w.uid===u.id&&['Pending','Processing','Approved'].includes(w.status)).reduce((s,w)=>s+w.usd,0);
const avail=u=>Math.max(0,u.usd-held(u));
const start=()=>{const d=new Date();d.setHours(0,0,0,0);return +d};
const todayE=u=>db.tx.filter(t=>t.uid===u.id&&t.amt>0&&t.t>=start()).reduce((s,t)=>s+t.amt,0);
function credit(u,amt,type,note,demo){amt=Math.round(amt*100)/100;if(!(amt>0))return;u.usd=Math.round((u.usd+amt)*100)/100;u.earned=Math.round((u.earned+amt)*100)/100;db.tx.push({id:uid('TX-'),uid:u.id,type,amt,note,demo:!!demo,t:Date.now()});}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.i);toast.i=setTimeout(()=>t.classList.remove('on'),2800)}
function modal(h){$('#modal-body').innerHTML=h;$('#modal').classList.add('on')}
function closeM(){$('#modal').classList.remove('on');clearInterval(adT)}

/* legal */
const LEGAL={
terms:['Terms and Conditions',`<p><b>Eligibility.</b> You must be at least 18 years old (or the age of majority where you live). Where local law permits younger users, a parent or legal guardian must read and agree to these terms and supervise the account.</p><p>One account per person. Accounts that show fraud, automation or duplicate identities may be suspended and balances withheld.</p><p>Rewards are paid only from verified advertising revenue or approved tasks. Withdrawals require identity and payment verification through a supported payment provider.</p><p>These terms are a template; have them reviewed by a lawyer before launch.</p>`],
privacy:['Privacy Policy',`<p>We collect your username, email, activity and wallet records to run the service and prevent fraud. We never store card or bank numbers; payment details are entered only on the payment provider's secure form.</p><p>Passwords are stored as salted hashes. You can ask to export or delete your data. Advertising providers may process data under their own policies.</p><p>Template text; have it reviewed by a lawyer before launch.</p>`],
rules:['Reward Rules',`<ul style="margin-left:18px;color:#c9d4ee"><li>You are never paid for clicking ads or visiting advertiser sites. Ads are watched voluntarily.</li><li>A reward is credited only after the ad provider confirms the ad was completed.</li><li>Each confirmation can be used once. Ads have a cooldown and a daily limit.</li><li>Tasks are credited after an administrator verifies them.</li><li>The daily bonus can be claimed once every 24 hours.</li><li>Minimum withdrawal: $200 USD or its LKR equivalent.</li><li>Reward amounts are set by the admin and are only enabled when backed by real revenue.</li></ul>`]};
const legalLinks=['terms','privacy','rules'].map(k=>`<a href="#" data-a="legal" data-k="${k}">${LEGAL[k][0]}</a>`).join('');

/* ---------- auth ---------- */
function authView(mode){
 const reg=mode==='register';
 A().innerHTML=`<div class="auth"><div class="logo big">${logo}</div><p class="mut" style="text-align:center">Watch approved ads. Complete tasks. Earn rewards.</p>
 <div class="card"><h2>${reg?'Create account':'Welcome back'}</h2><form id="af" novalidate>
 ${reg?`<label>Username</label><input name="u" autocomplete="username" required><label>Email address</label><input name="e" type="email" autocomplete="email" required><label>Password</label><input name="p" type="password" autocomplete="new-password" required><label>Confirm password</label><input name="c" type="password" autocomplete="new-password" required>
 <div class="chk"><input type="checkbox" name="age"><span>I am 18 or older (or have a parent/guardian's agreement where the law allows).</span></div>
 <div class="chk"><input type="checkbox" name="tos"><span>I accept the <a href="#" data-a="legal" data-k="terms">Terms</a>, <a href="#" data-a="legal" data-k="privacy">Privacy Policy</a> and <a href="#" data-a="legal" data-k="rules">Reward Rules</a>.</span></div>`
 :`<label>Username or email</label><input name="u" autocomplete="username" required><label>Password</label><input name="p" type="password" autocomplete="current-password" required>
 <div class="chk"><input type="checkbox" name="rm"><span>Remember me</span></div><a href="#" data-a="forgot" class="sm">Forgot password?</a>`}
 <button class="btn">${reg?'Create account':'Log in'}</button></form>
 <p class="sm mut" style="margin-top:14px;text-align:center">${reg?'Already registered?':'New here?'} <a href="#" data-a="${reg?'tologin':'toreg'}">${reg?'Log in':'Create an account'}</a> · <a href="#admin">Admin</a></p></div>
 <footer>${legalLinks}</footer></div>`;
 $('#af').onsubmit=e=>{e.preventDefault();reg?doReg(new FormData(e.target)):doLogin(new FormData(e.target))};
}
async function doReg(f){
 const u=f.get('u').trim(),e=f.get('e').trim().toLowerCase(),p=f.get('p'),c=f.get('c');
 if(!/^[a-zA-Z0-9_]{3,20}$/.test(u))return toast('Username: 3–20 letters, numbers or _');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))return toast('Enter a valid email address');
 if(p.length<8||!/[a-zA-Z]/.test(p)||!/\d/.test(p))return toast('Password needs 8+ characters with a letter and a number');
 if(p!==c)return toast('Passwords do not match');
 if(!f.get('age'))return toast('You must confirm the age requirement');
 if(!f.get('tos'))return toast('Please accept the terms and rules');
 if(db.users.some(x=>x.username.toLowerCase()===u.toLowerCase()))return toast('That username is taken');
 if(db.users.some(x=>x.email===e))return toast('That email is already registered');
 const salt=mkSalt();
 db.users.push({id:uid('U'),username:u,email:e,salt,hash:await hp(p,salt),created:Date.now(),usd:0,earned:0,suspended:false,lastBonus:0,lastAd:{},tokens:[]});
 save();toast('Account created. Please log in.');authView('login');
}
async function doLogin(f){
 const id=f.get('u').trim().toLowerCase(),p=f.get('p'),L=JSON.parse(localStorage.getItem('cm_lock')||'{}'),l=L[id]||{n:0,until:0};
 if(l.until>Date.now())return toast(`Too many attempts. Try again in ${Math.ceil((l.until-Date.now())/1000)}s`);
 const u=db.users.find(x=>x.username.toLowerCase()===id||x.email===id);
 if(!u||await hp(p,u.salt)!==u.hash){l.n++;if(l.n>=5){l.until=Date.now()+60000;l.n=0}L[id]=l;localStorage.setItem('cm_lock',JSON.stringify(L));return toast('Wrong username/email or password')}
 if(u.suspended)return toast('This account is suspended. Contact support.');
 delete L[id];localStorage.setItem('cm_lock',JSON.stringify(L));
 (f.get('rm')?localStorage:sessionStorage).setItem('cm_s',u.id);route();
}

/* ---------- user shell ---------- */
const NAV=[['dash','Dashboard'],['earn','Earn'],['wallet','Wallet'],['withdraw','Withdraw'],['profile','Profile']];
function shell(u,inner){return `<header class="top"><a class="logo" href="#dash">${logo}</a><nav>${NAV.map(n=>`<a href="#${n[0]}" class="${page===n[0]?'on':''}">${n[1]}</a>`).join('')}</nav><div class="who"><span>${esc(u.username)}</span><button class="btn ghost sm" data-a="logout">Log out</button></div></header><main class="wrap">${db.set.demo?'<div class="banner">DEMO MODE – no advertising or payment provider is connected. Balances here are demo credits, not real money.</div>':''}${inner}</main><footer>${legalLinks}<br>© CLICK ME</footer>`}
const tag=s=>`<span class="tag ${{Completed:'ok',Approved:'ok',Rejected:'bad',Pending:'warn',Processing:'ac'}[s]||''}">${s}</span>`;
const txRows=l=>l.length?l.map(t=>`<div class="row"><div><b>${esc(t.note)}</b> ${t.demo?'<span class="tag warn">demo</span>':''}<div class="sm mut">${dt(t.t)} · ${t.id}</div></div><b class="${t.amt>0?'pos':'neg'}">${t.amt>0?'+':'−'}${both(Math.abs(t.amt))}</b></div>`).join(''):'<p class="mut">No transactions yet. Start on the Earn page.</p>';

function pDash(u){
 const mine=db.tx.filter(t=>t.uid===u.id).sort((a,b)=>b.t-a.t),ads=mine.filter(t=>t.type==='ad').length,pend=held(u),pct=Math.min(100,avail(u)/db.set.min*100);
 return `<h1>Welcome, ${esc(u.username)}</h1><p class="mut">Here is your account at a glance.</p>
 <div class="grid">${[['Total earnings (USD)',usd(u.earned)],['Total earnings (LKR)',lkr(u.earned)],["Today's earnings",usd(todayE(u))],['Completed ads',ads],['Available to withdraw',usd(avail(u))],['Pending withdrawals',usd(pend)]].map(s=>`<div class="card stat"><div class="l">${s[0]}</div><div class="v">${s[1]}</div></div>`).join('')}</div>
 <div class="card"><div class="row" style="border:0;padding:0"><b>Progress to minimum withdrawal</b><span class="mut sm">${usd(avail(u))} / ${usd(db.set.min)}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>
 <div class="card" style="margin-top:14px"><h2>Recent transactions</h2>${txRows(mine.slice(0,6))}</div>`;
}
function bonusLeft(u){return Math.max(0,u.lastBonus+864e5-Date.now())}
const cd=ms=>{const s=Math.ceil(ms/1000);return [s/3600|0,(s%3600)/60|0,s%60].map(x=>String(x).padStart(2,'0')).join(':')};
function pEarn(u){
 const todayAds=db.tx.filter(t=>t.uid===u.id&&t.type==='ad'&&t.t>=start()).length,left=bonusLeft(u);
 return `<h1>Earn rewards</h1><p class="mut">You are only paid for ads you choose to watch to the end. Never for clicking.</p>
 <h2 style="margin-top:20px">Watch ads <span class="tag">${todayAds}/${db.set.maxAds} today</span></h2>
 <div class="grid g2">${db.ads.filter(a=>a.active).map(a=>`<div class="card"><h3>${esc(a.title)}</h3><p class="mut sm">${a.secs}s · reward confirmed by the ad provider</p><div class="row" style="border:0"><b class="big-n" style="font-size:1.4rem">${usd(a.reward)}</b><button class="btn" data-a="ad" data-id="${a.id}">Watch ad</button></div></div>`).join('')||'<p class="mut">No ads available right now.</p>'}</div>
 <h2 style="margin-top:20px">Daily bonus</h2>
 <div class="card"><div class="row" style="border:0;padding:0"><div><b>${usd(db.set.bonus)}</b> every 24 hours<div class="sm mut">Next bonus: <span id="cd">${left?cd(left):'Ready'}</span></div></div><button class="btn" id="bonus" data-a="bonus" ${left?'disabled':''}>Claim bonus</button></div></div>
 <h2 style="margin-top:20px">Reward tasks</h2>
 <div class="card">${db.tasks.filter(t=>t.active).map(t=>{const s=db.subs.find(x=>x.uid===u.id&&x.tid===t.id);return `<div class="row"><div><b>${esc(t.title)}</b><div class="sm mut">${esc(t.desc)}</div></div><div>${usd(t.reward)} ${s?tag(s.status==='approved'?'Completed':s.status==='rejected'?'Rejected':'Pending'):`<button class="btn sm" data-a="task" data-id="${t.id}">Submit</button>`}</div></div>`}).join('')||'<p class="mut">No tasks yet.</p>'}</div>`;
}
function pWallet(u){
 const f=n=>cur==='USD'?usd(n):lkr(n),mine=db.tx.filter(t=>t.uid===u.id).sort((a,b)=>b.t-a.t);
 return `<h1>Wallet</h1><div class="row" style="border:0"><div class="cur"><button class="${cur==='USD'?'on':''}" data-a="cur" data-c="USD">USD</button><button class="${cur==='LKR'?'on':''}" data-a="cur" data-c="LKR">LKR</button></div></div>
 <div class="grid">${[['Total balance',u.usd],['Available balance',avail(u)],['Pending balance',held(u)]].map(s=>`<div class="card stat"><div class="l">${s[0]}</div><div class="v">${f(s[1])}</div></div>`).join('')}</div>
 <div class="card"><b>Exchange rate:</b> 1 USD = ${db.set.rate} LKR <span class="tag">${esc(db.set.rateNote)}</span><p class="sm mut">Rates are managed by the admin. Connect a verified exchange-rate API on the server for live rates.</p></div>
 <div class="card" style="margin-top:14px"><h2>Transaction history</h2>${txRows(mine)}</div>`;
}
function pWithdraw(u){
 const w=db.wd.filter(x=>x.uid===u.id).sort((a,b)=>b.t-a.t),minL=db.set.min*db.set.rate;
 return `<h1>Withdraw money</h1>
 ${db.set.provider?'':'<div class="banner">No payment provider is connected yet. Requests are saved for review, but no money can be paid out until a supported provider is set up and tested.</div>'}
 <div class="grid g2"><div class="card"><p>Available: <b>${both(avail(u))}</b></p><p class="sm mut">Minimum: ${usd(db.set.min)} (≈ Rs ${minL.toLocaleString()})</p>
 <form id="wf"><label>Currency</label><select name="c"><option>USD</option><option>LKR</option></select><label>Method</label><select name="m"><option>Bank Transfer</option></select><label>Amount</label><input name="a" type="number" step="0.01" min="0" required>
 <p class="sm mut" style="margin-top:10px">Bank details are never typed into this site. After approval you will enter them on the payment provider's secure form.</p><button class="btn" style="width:100%;margin-top:12px">Request withdrawal</button></form></div>
 <div class="card"><h2>Withdrawal history</h2>${w.map(x=>`<div class="row"><div><b>${x.cur==='USD'?usd(x.amount):'Rs '+x.amount.toLocaleString()}</b> ${tag(x.status)}<div class="sm mut">${dt(x.t)} · ${x.id}</div></div></div>`).join('')||'<p class="mut">No withdrawals yet.</p>'}</div></div>`;
}
function pProfile(u){
 return `<h1>Profile</h1><div class="grid g2"><div class="card"><div class="row"><span class="mut">Username</span><b>${esc(u.username)}</b></div><div class="row"><span class="mut">Email</span><b>${esc(u.email)}</b></div><div class="row"><span class="mut">Registered</span><b>${dt(u.created)}</b></div><div class="row"><span class="mut">Total earnings</span><b>${both(u.earned)}</b></div><div class="row"><span class="mut">Completed ads</span><b>${db.tx.filter(t=>t.uid===u.id&&t.type==='ad').length}</b></div></div>
 <div class="card"><h2>Change password</h2><form id="pf"><label>Current password</label><input name="o" type="password" required><label>New password</label><input name="n" type="password" required><label>Confirm new password</label><input name="c" type="password" required><button class="btn" style="margin-top:14px">Update password</button></form></div></div>
 <button class="btn bad" style="margin-top:16px" data-a="logout">Log out</button>`;
}
function userView(u){
 const P={dash:pDash,earn:pEarn,wallet:pWallet,withdraw:pWithdraw,profile:pProfile};
 A().innerHTML=shell(u,(P[page]||pDash)(u));
 const wf=$('#wf');if(wf)wf.onsubmit=e=>{e.preventDefault();reqWd(u,new FormData(wf))};
 const pf=$('#pf');if(pf)pf.onsubmit=async e=>{e.preventDefault();const f=new FormData(pf);
  if(await hp(f.get('o'),u.salt)!==u.hash)return toast('Current password is wrong');
  const n=f.get('n');if(n.length<8||!/[a-zA-Z]/.test(n)||!/\d/.test(n))return toast('New password needs 8+ characters with a letter and a number');
  if(n!==f.get('c'))return toast('Passwords do not match');u.salt=mkSalt();u.hash=await hp(n,u.salt);save();pf.reset();toast('Password updated')};
 clearInterval(userView.t);if($('#cd'))userView.t=setInterval(()=>{const l=bonusLeft(u),el=$('#cd');if(!el)return clearInterval(userView.t);el.textContent=l?cd(l):'Ready';$('#bonus').disabled=!!l},1000);
}
function reqWd(u,f){
 const c=f.get('c'),a=Math.round(parseFloat(f.get('a'))*100)/100;if(!(a>0))return toast('Enter an amount');
 const u$=c==='USD'?a:a/db.set.rate;
 if(u$<db.set.min-1e-9)return toast(`Minimum withdrawal is ${usd(db.set.min)} (Rs ${(db.set.min*db.set.rate).toLocaleString()})`);
 if(u$>avail(u)+1e-9)return toast('Amount is more than your available balance');
 db.wd.push({id:uid('WD-').toUpperCase(),uid:u.id,cur:c,amount:a,usd:u$,method:f.get('m'),status:'Pending',t:Date.now()});save();toast('Withdrawal requested');userView(u);
}
/* ad flow: a reward is only credited after the provider confirms; demo provider is clearly labelled */
const provider={async confirm(ad){if(db.set.demo)return{ok:true,demo:true,token:uid('demo_')};return{ok:false}}};
function watchAd(u,ad){
 if(u.suspended)return toast('Account suspended');
 if(!db.set.demo&&!db.set.provider)return toast('Ad provider not connected');
 if(db.tx.filter(t=>t.uid===u.id&&t.type==='ad'&&t.t>=start()).length>=db.set.maxAds)return toast('Daily ad limit reached');
 const w=(u.lastAd[ad.id]||0)+db.set.cool*1000-Date.now();if(w>0)return toast(`Wait ${Math.ceil(w/1000)}s before watching this ad again`);
 let s=ad.secs;modal(`<h2>${esc(ad.title)}</h2><p class="mut">DEMO ad player. Keep this window open to the end.</p><div class="big-n" id="adn">${s}</div><div class="bar"><i id="adb" style="width:0"></i></div><button class="btn ghost" style="margin-top:14px" data-a="close">Cancel</button>`);
 adT=setInterval(async()=>{s--;const n=$('#adn');if(!n)return clearInterval(adT);n.textContent=s;$('#adb').style.width=(100-s/ad.secs*100)+'%';
  if(s<=0){clearInterval(adT);const r=await provider.confirm(ad);
   if(!r.ok||u.tokens.includes(r.token)){closeM();return toast('Not confirmed – no reward credited')}
   u.tokens.push(r.token);u.lastAd[ad.id]=Date.now();credit(u,ad.reward,'ad','Watched: '+ad.title,r.demo);save();closeM();toast('Ad confirmed: '+usd(ad.reward)+' credited');userView(u)}},1000);
}

/* ---------- admin ---------- */
function adminView(){
 if(!db.admin)return A().innerHTML=`<div class="auth"><div class="logo big">${logo}</div><div class="card"><h2>Create admin account</h2><p class="sm mut">First-time setup. Choose a strong password.</p><form id="as"><label>Admin username</label><input name="u" required><label>Password (10+ chars)</label><input name="p" type="password" required><button class="btn">Create admin</button></form></div><p style="text-align:center;margin-top:12px"><a href="#login">← Back to site</a></p></div>`,
  $('#as').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),p=f.get('p');if(p.length<10)return toast('Use at least 10 characters');const salt=mkSalt();db.admin={u:f.get('u').trim(),salt,hash:await hp(p,salt)};save();sessionStorage.setItem('cm_a','1');adminView()};
 if(!isAdmin())return A().innerHTML=`<div class="auth"><div class="logo big">${logo}</div><div class="card"><h2>Admin login</h2><form id="al"><label>Username</label><input name="u" required><label>Password</label><input name="p" type="password" required><button class="btn">Log in</button></form></div><p style="text-align:center;margin-top:12px"><a href="#login">← Back to site</a></p></div>`,
  $('#al').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),l=JSON.parse(localStorage.getItem('cm_alock')||'{"n":0,"u":0}');
   if(l.u>Date.now())return toast('Locked. Try again later');
   if(f.get('u').trim()!==db.admin.u||await hp(f.get('p'),db.admin.salt)!==db.admin.hash){l.n++;if(l.n>=5){l.u=Date.now()+300000;l.n=0}localStorage.setItem('cm_alock',JSON.stringify(l));return toast('Invalid admin credentials')}
   localStorage.removeItem('cm_alock');sessionStorage.setItem('cm_a','1');adminView()};
 const T=[['users','Users'],['rewards','Rewards & ads'],['tasks','Tasks'],['wd','Withdrawals'],['tx','Transactions'],['set','Rates & settings'],['fin','Finance']];
 A().innerHTML=`<header class="top"><a class="logo" href="#admin">${logo}</a><span class="tag ac">Admin</span><div class="who" style="margin-left:auto"><a href="#login" class="btn ghost sm">Site</a><button class="btn ghost sm" data-a="alogout">Log out</button></div></header><main class="wrap"><h1>Admin dashboard</h1><div class="tabs">${T.map(t=>`<button class="${atab===t[0]?'on':''}" data-a="atab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="ab">${aTab()}</div></main>`;
 const sf=$('#sf');if(sf)sf.onsubmit=e=>{e.preventDefault();const f=new FormData(sf),s=db.set;s.rate=+f.get('rate')||s.rate;s.rateNote=f.get('note')||'Set by admin';s.min=+f.get('min')||200;s.bonus=+f.get('bonus')||0;s.maxAds=+f.get('max')||20;s.cool=+f.get('cool')||60;s.revenue=+f.get('rev')||0;s.demo=!!f.get('demo');s.provider=!!f.get('prov');save();toast('Settings saved');adminView()};
 const nt=$('#nt');if(nt)nt.onsubmit=e=>{e.preventDefault();const f=new FormData(nt);db.tasks.push({id:uid('t'),title:f.get('t').trim(),desc:f.get('d').trim(),reward:+f.get('r')||0,active:true});save();adminView()};
 const na=$('#na');if(na)na.onsubmit=e=>{e.preventDefault();const f=new FormData(na);db.ads.push({id:uid('a'),title:f.get('t').trim(),reward:+f.get('r')||0,secs:+f.get('s')||15,active:true});save();adminView()};
 const us=$('#us');if(us)us.oninput=()=>{q=us.value;const p=us.selectionStart;$('#ub').innerHTML=uRows();}
}
function uRows(){return db.users.filter(u=>u.username.toLowerCase().includes(q.toLowerCase())).map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td>${usd(u.earned)}</td><td>${usd(u.usd)}</td><td>${db.tx.filter(t=>t.uid===u.id&&t.type==='ad').length}</td><td>${u.suspended?'<span class="tag bad">Suspended</span>':'<span class="tag ok">Active</span>'}</td><td><button class="btn sm ghost" data-a="susp" data-id="${u.id}">${u.suspended?'Restore':'Suspend'}</button> <button class="btn sm ghost" data-a="rpw" data-id="${u.id}">Reset pw</button></td></tr>`).join('')||'<tr><td colspan=7 class="mut">No users found.</td></tr>'}
function aTab(){
 const un=id=>esc(db.users.find(u=>u.id===id)?.username||'?');
 if(atab==='users')return `<div class="card"><input id="us" placeholder="Search by username" value="${esc(q)}"><div class="tw" style="margin-top:12px"><table><tr><th>User</th><th>Email</th><th>Earned</th><th>Balance</th><th>Ads</th><th>Status</th><th></th></tr><tbody id="ub">${uRows()}</tbody></table></div></div>`;
 if(atab==='rewards')return `<div class="card"><h2>Advertisements</h2>${db.ads.map(a=>`<div class="row"><div><b>${esc(a.title)}</b> ${a.active?'':'<span class="tag">off</span>'}<div class="sm mut">${a.secs}s · ${usd(a.reward)}</div></div><div><button class="btn sm ghost" data-a="aed" data-id="${a.id}">Edit reward</button> <button class="btn sm ghost" data-a="atg" data-id="${a.id}">${a.active?'Disable':'Enable'}</button> <button class="btn sm bad" data-a="adel" data-id="${a.id}">Remove</button></div></div>`).join('')||'<p class="mut">None</p>'}
 <form id="na" style="margin-top:14px"><label>New ad title</label><input name="t" required><label>Reward (USD)</label><input name="r" type="number" step="0.01" required><label>Seconds</label><input name="s" type="number" value="15"><button class="btn" style="margin-top:12px">Add ad</button></form><p class="sm mut">Only enable rewards backed by real ad revenue.</p></div>`;
 if(atab==='tasks')return `<div class="card"><h2>Tasks</h2>${db.tasks.map(t=>`<div class="row"><div><b>${esc(t.title)}</b> ${t.active?'':'<span class="tag">off</span>'}<div class="sm mut">${esc(t.desc)} · ${usd(t.reward)}</div></div><div><button class="btn sm ghost" data-a="ted" data-id="${t.id}">Edit</button> <button class="btn sm bad" data-a="tdel" data-id="${t.id}">Remove</button></div></div>`).join('')||'<p class="mut">None</p>'}
 <form id="nt" style="margin-top:14px"><label>Title</label><input name="t" required><label>Description</label><input name="d" required><label>Reward (USD)</label><input name="r" type="number" step="0.01" required><button class="btn" style="margin-top:12px">Add task</button></form></div>
 <div class="card" style="margin-top:14px"><h2>Submissions to review</h2>${db.subs.filter(s=>s.status==='pending').map(s=>`<div class="row"><span>${un(s.uid)} – ${esc(db.tasks.find(t=>t.id===s.tid)?.title||'removed task')}</span><div><button class="btn sm ok" data-a="sok" data-id="${s.id}">Approve</button> <button class="btn sm bad" data-a="sno" data-id="${s.id}">Reject</button></div></div>`).join('')||'<p class="mut">Nothing waiting.</p>'}</div>`;
 if(atab==='wd')return `<div class="card"><h2>Withdrawal requests</h2>${[...db.wd].sort((a,b)=>b.t-a.t).map(w=>`<div class="row"><div><b>${un(w.uid)}</b> · ${w.cur==='USD'?usd(w.amount):'Rs '+w.amount.toLocaleString()} ${tag(w.status)}<div class="sm mut">${w.id} · ${dt(w.t)}</div></div><div>${['Pending','Processing','Approved'].includes(w.status)?`${w.status==='Pending'?`<button class="btn sm ghost" data-a="ws" data-s="Processing" data-id="${w.id}">Processing</button> `:''}${w.status!=='Approved'?`<button class="btn sm ok" data-a="ws" data-s="Approved" data-id="${w.id}">Approve</button> `:`<button class="btn sm" data-a="ws" data-s="Completed" data-id="${w.id}">Mark completed</button> `}<button class="btn sm bad" data-a="ws" data-s="Rejected" data-id="${w.id}">Reject</button>`:''}</div></div>`).join('')||'<p class="mut">No requests.</p>'}<p class="sm mut">Mark completed only after money was really sent through your payment provider.</p></div>`;
 if(atab==='tx')return `<div class="card"><div class="tw"><table><tr><th>ID</th><th>User</th><th>Type</th><th>Amount</th><th>Note</th><th>Date</th></tr>${[...db.tx].sort((a,b)=>b.t-a.t).slice(0,200).map(t=>`<tr><td>${t.id}</td><td>${un(t.uid)}</td><td>${t.type}${t.demo?' (demo)':''}</td><td class="${t.amt>0?'pos':'neg'}">${usd(t.amt)}</td><td>${esc(t.note)}</td><td>${dt(t.t)}</td></tr>`).join('')||'<tr><td colspan=6 class="mut">None yet.</td></tr>'}</table></div></div>`;
 if(atab==='set'){const s=db.set;return `<div class="card"><form id="sf"><label>USD → LKR rate</label><input name="rate" type="number" step="0.01" value="${s.rate}"><label>Rate source note</label><input name="note" value="${esc(s.rateNote)}"><label>Minimum withdrawal (USD)</label><input name="min" type="number" value="${s.min}"><label>Daily bonus (USD)</label><input name="bonus" type="number" step="0.01" value="${s.bonus}"><label>Max ads per user per day</label><input name="max" type="number" value="${s.maxAds}"><label>Ad cooldown (seconds)</label><input name="cool" type="number" value="${s.cool}"><label>Real ad revenue received (USD, from provider reports)</label><input name="rev" type="number" step="0.01" value="${s.revenue}">
 <div class="chk"><input type="checkbox" name="demo" ${s.demo?'checked':''}><span>Demo mode (demo ad provider; credits flagged as demo)</span></div><div class="chk"><input type="checkbox" name="prov" ${s.provider?'checked':''}><span>Payment provider connected and tested</span></div><button class="btn">Save settings</button></form></div>`}
 const exp=db.tx.filter(t=>t.amt>0).reduce((a,t)=>a+t.amt,0),paid=db.wd.filter(w=>w.status==='Completed').reduce((a,w)=>a+w.usd,0);
 return `<div class="grid">${[['Platform earnings (ad revenue entered)',usd(db.set.revenue)],['Rewards credited (expenses)',usd(exp)],['Withdrawals paid out',usd(paid)],['Net (earnings − rewards)',usd(db.set.revenue-exp)],['Users',db.users.length]].map(s=>`<div class="card stat"><div class="l">${s[0]}</div><div class="v">${s[1]}</div></div>`).join('')}</div>`;
}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=b.dataset.id,u=me();
 if(['legal','forgot','tologin','toreg'].includes(a))e.preventDefault();
 const rer=()=>location.hash.startsWith('#admin')?adminView():route();
 switch(a){
 case 'close':return closeM();
 case 'legal':return modal(`<h2>${LEGAL[b.dataset.k][0]}</h2>${LEGAL[b.dataset.k][1]}`);
 case 'forgot':return modal('<h2>Forgot password</h2><p>Password reset by email needs a server with an email service, which this demo build does not have. Contact the administrator, who can set a temporary password from Admin → Users.</p>');
 case 'tologin':return authView('login');case 'toreg':return authView('register');
 case 'logout':localStorage.removeItem('cm_s');sessionStorage.removeItem('cm_s');return route();
 case 'alogout':sessionStorage.removeItem('cm_a');return adminView();
 case 'cur':cur=b.dataset.c;return route();
 case 'ad':return watchAd(u,db.ads.find(x=>x.id===id));
 case 'bonus':if(bonusLeft(u))return toast('Bonus not ready yet');credit(u,db.set.bonus,'bonus','Daily bonus',db.set.demo);u.lastBonus=Date.now();save();toast('Daily bonus claimed');return route();
 case 'task':if(db.subs.some(s=>s.uid===u.id&&s.tid===id))return;db.subs.push({id:uid('S'),uid:u.id,tid:id,status:'pending'});save();toast('Submitted for admin review');return route();
 case 'atab':atab=b.dataset.t;return adminView();
 }
 if(!isAdmin())return;
 const s=db.set;
 if(a==='susp'){const x=db.users.find(x=>x.id===id);x.suspended=!x.suspended}
 else if(a==='rpw'){const x=db.users.find(x=>x.id===id),t='Tmp'+Math.random().toString(36).slice(2,8)+'9';x.salt=mkSalt();x.hash=await hp(t,x.salt);save();return modal(`<h2>Temporary password</h2><p>Give this to ${esc(x.username)} privately: <b>${t}</b></p>`)}
 else if(a==='aed'){const x=db.ads.find(x=>x.id===id),v=parseFloat(prompt('New reward (USD)',x.reward));if(v>=0)x.reward=v}
 else if(a==='atg'){const x=db.ads.find(x=>x.id===id);x.active=!x.active}
 else if(a==='adel'){if(confirm('Remove this ad?'))db.ads=db.ads.filter(x=>x.id!==id)}
 else if(a==='ted'){const x=db.tasks.find(x=>x.id===id),t=prompt('Title',x.title),d=prompt('Description',x.desc),r=parseFloat(prompt('Reward (USD)',x.reward));if(t)x.title=t;if(d)x.desc=d;if(r>=0)x.reward=r}
 else if(a==='tdel'){if(confirm('Remove this task?'))db.tasks=db.tasks.filter(x=>x.id!==id)}
 else if(a==='sok'||a==='sno'){const x=db.subs.find(x=>x.id===id);if(x.status!=='pending')return;if(a==='sok'){const t=db.tasks.find(t=>t.id===x.tid),usr=db.users.find(u=>u.id===x.uid);if(t&&usr)credit(usr,t.reward,'task','Task: '+t.title,s.demo);x.status='approved'}else x.status='rejected'}
 else if(a==='ws'){const w=db.wd.find(x=>x.id===id),usr=db.users.find(u=>u.id===w.uid);
  if(!['Pending','Processing','Approved'].includes(w.status))return;
  if(b.dataset.s==='Completed'){if(usr.usd<w.usd)return toast('User balance too low');usr.usd=Math.round((usr.usd-w.usd)*100)/100;db.tx.push({id:uid('TX-'),uid:usr.id,type:'withdraw',amt:-w.usd,note:'Withdrawal '+w.id,demo:false,t:Date.now()})}
  w.status=b.dataset.s}
 else return;
 save();rer();
});
function route(){
 clearInterval(userView.t);
 const h=location.hash.slice(1)||'';
 if(h==='admin')return adminView();
 const u=me();
 if(!u){if(h==='register')return authView('register');return authView('login')}
 page=['dash','earn','wallet','withdraw','profile'].includes(h)?h:'dash';userView(u);window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);
if(!window.crypto||!crypto.subtle){document.body.innerHTML='<p style="padding:30px;color:#fff">This browser blocks secure hashing here. Open the site via https:// or http://localhost.</p>'}else route();
