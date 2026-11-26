'use strict';
/* CLICK ME – front-end. All data lives on the server (PHP + MySQL). Nothing sensitive is stored in the browser. */
const $=(s,r=document)=>r.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let CSRF='',IN=false,ADM=false,pub={rate:300,min:200,demo:1,bonus:0,maxAds:20},D=null,AD=null,page='dash',cur='USD',atab='users',sq='',tm=null;
const usd=n=>'$'+(+n).toFixed(2),lkr=n=>'Rs '+(n*pub.rate).toLocaleString('en-LK',{maximumFractionDigits:2}),both=n=>usd(n)+' · '+lkr(n),dt=t=>new Date(t*1000).toLocaleString();
const logo=`<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2f7bff"/><path d="M10 8l12 8-5 1.5L20 24l-3 1-3-6.5L10 22z" fill="#fff"/></svg>CLICK ME`;
const A=()=>$('#app');
const AD_DOM='@clickme-rewards.net';let sb;
function mkClient(){sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{storage:localStorage.getItem('cm_rm')==='1'?localStorage:sessionStorage,persistSession:true,autoRefreshToken:true}})}
const pwok=p=>p.length>=8&&/[A-Za-z]/.test(p)&&/\d/.test(p);
async function authEmail(id){id=id.trim().toLowerCase();const {data}=await sb.rpc('api_resolve',{p:{id}});return data||id+AD_DOM}
async function api(a,d){d=d||{};
 if(a==='register'){if(!/^[A-Za-z0-9_]{3,20}$/.test(d.u))throw new Error('Username: 3-20 letters, numbers or _');if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.e))throw new Error('Invalid email');if(!pwok(d.p))throw new Error('Password needs 8+ characters with a letter and a number');if(d.p!==d.c)throw new Error('Passwords do not match');if(!d.age)throw new Error('You must confirm the age requirement and accept the terms');
  const {data,error}=await sb.auth.signUp({email:d.u.toLowerCase()+AD_DOM,password:d.p,options:{data:{username:d.u,email:d.e.toLowerCase(),age:'true'}}});
  if(error)throw new Error(/already|Database error|registered/i.test(error.message)?'Username or email already in use':error.message);
  if(!data.session)throw new Error('Setup: turn OFF "Confirm email" in Supabase > Authentication > Providers > Email');return {ok:1}}
 if(a==='login'||a==='a_login'){if(d.rm)localStorage.setItem('cm_rm','1');else localStorage.removeItem('cm_rm');mkClient();
  const {error}=await sb.auth.signInWithPassword({email:await authEmail(d.u),password:d.p});if(error)throw new Error(a==='a_login'?'Invalid admin credentials':'Wrong username/email or password');
  if(a==='a_login'&&!(await sb.rpc('api_init',{p:{}})).data?.admin){await sb.auth.signOut();throw new Error('Invalid admin credentials')}return {ok:1}}
 if(a==='logout'||a==='a_logout'){await sb.auth.signOut();localStorage.removeItem('cm_rm');mkClient();return {ok:1}}
 if(a==='pw_change'||a==='a_pw'){const n=a==='a_pw'?d.n:d.n;if(a==='pw_change'){if(!pwok(n))throw new Error('New password needs 8+ characters with a letter and a number');if(n!==d.c)throw new Error('Passwords do not match')}else if(n.length<12)throw new Error('Use 12+ characters');
  const {data:{user}}=await sb.auth.getUser();const {error:e1}=await sb.auth.signInWithPassword({email:user.email,password:d.o});if(e1)throw new Error('Current password is wrong');
  const {error}=await sb.auth.updateUser({password:n});if(error)throw new Error(error.message);return {ok:1}}
 const {data,error}=await sb.rpc('api_'+a,{p:d});if(error)throw new Error(error.message);return data}
const act=async(a,d)=>{try{return await api(a,d)}catch(e){toast(e.message);return null}};
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.i);toast.i=setTimeout(()=>t.classList.remove('on'),3000)}
function modal(h){$('#modal-body').innerHTML=h;$('#modal').classList.add('on')}
function closeM(){$('#modal').classList.remove('on');clearInterval(AD)}
const LEGAL={
terms:['Terms and Conditions',`<p><b>Eligibility.</b> You must be at least 18 years old (or the age of majority where you live). Where local law permits younger users, a parent or legal guardian must read and agree to these terms and supervise the account.</p><p>One account per person. Accounts that show fraud, automation or duplicate identities may be suspended and balances withheld.</p><p>Rewards are paid only from verified advertising revenue or approved tasks. Withdrawals are reviewed manually by the administrator and may be delayed or refused if fraud is suspected.</p><p>These terms are a template; have them reviewed by a lawyer before launch.</p>`],
privacy:['Privacy Policy',`<p>We collect your username, email, activity and wallet records to run the service and prevent fraud. Bank details you submit for a withdrawal are encrypted on our server and are visible only to the administrator who pays you; they are never shown to other users.</p><p>Passwords are stored as salted hashes. You can ask to export or delete your data. Advertising providers may process data under their own policies.</p><p>Template text; have it reviewed by a lawyer before launch.</p>`],
rules:['Reward Rules',`<ul style="margin-left:18px;color:#c9d4ee"><li>You are never paid for clicking ads or visiting advertiser sites. Ads are watched voluntarily.</li><li>A reward is credited only after the ad provider confirms the ad was completed.</li><li>Each confirmation can be used once. Ads have a cooldown and a daily limit.</li><li>Tasks are credited after an administrator verifies them.</li><li>The daily bonus can be claimed once every 24 hours.</li><li>Minimum withdrawal: $200 USD or its LKR equivalent.</li><li>Reward amounts are set by the admin and are only enabled when backed by real revenue.</li></ul>`]};
const legalLinks=['terms','privacy','rules'].map(k=>`<a href="#" data-a="legal" data-k="${k}">${LEGAL[k][0]}</a>`).join(' · ');
const tag=s=>`<span class="tag ${{Completed:'ok',Approved:'ok',Rejected:'bad',Pending:'warn',Processing:'ac'}[s]||''}">${esc(s)}</span>`;
const NAV=[['dash','Dashboard'],['earn','Earn'],['wallet','Wallet'],['withdraw','Withdraw'],['profile','Profile']];
const banner=()=>pub.demo?'<div class="banner">DEMO MODE – no advertising or payment provider is connected yet. Rewards are test credits, not real revenue.</div>':'';
function shell(inner){const u=D.u;return `<header class="top"><a class="logo" href="#dash">${logo}</a><nav>${NAV.map(n=>`<a href="#${n[0]}" class="${page===n[0]?'on':''}">${n[1]}</a>`).join('')}</nav><div class="who"><span>${esc(u.username)}</span><button class="btn ghost sm" data-a="logout">Log out</button></div></header><main class="wrap">${banner()}${inner}</main><footer>${legalLinks}<br>© CLICK ME</footer>`}
const txRows=l=>l.length?l.map(t=>`<div class="row"><div><b>${esc(t.note)}</b> ${+t.demo?'<span class="tag warn">demo</span>':''}<div class="sm mut">${dt(t.t)} · ${esc(t.id||t.txid)}</div></div><b class="${t.amt>0?'pos':'neg'}">${t.amt>0?'+':'−'}${both(Math.abs(t.amt))}</b></div>`).join(''):'<p class="mut">No transactions yet.</p>';
const stat=s=>`<div class="card stat"><div class="l">${s[0]}</div><div class="v">${s[1]}</div></div>`;
const cd=ms=>{const s=Math.ceil(ms/1000);return [s/3600|0,(s%3600)/60|0,s%60].map(x=>String(x).padStart(2,'0')).join(':')};

/* ---------- auth ---------- */
function authView(mode){const reg=mode==='register';
 A().innerHTML=`<div class="auth"><div class="logo big">${logo}</div><p class="mut" style="text-align:center">Watch approved ads. Complete tasks. Earn rewards.</p><div class="card"><h2>${reg?'Create account':'Log in'}</h2><form id="af">
 ${reg?`<label>Username</label><input name="u" autocomplete="username" required maxlength="20"><label>Email address</label><input name="e" type="email" autocomplete="email" required><label>Password</label><input name="p" type="password" autocomplete="new-password" required><label>Confirm password</label><input name="c" type="password" autocomplete="new-password" required><div class="chk"><input type="checkbox" name="age" required><span class="sm">I am 18+ (or have a parent/guardian's permission where required) and accept the <a href="#" data-a="legal" data-k="terms">Terms</a>, <a href="#" data-a="legal" data-k="privacy">Privacy Policy</a> and <a href="#" data-a="legal" data-k="rules">Reward Rules</a>.</span></div>`
 :`<label>Username or email</label><input name="u" autocomplete="username" required><label>Password</label><input name="p" type="password" autocomplete="current-password" required><div class="chk"><input type="checkbox" name="rm"><span>Remember me</span></div><a href="#" data-a="forgot" class="sm">Forgot password?</a>`}
 <button class="btn" style="width:100%;margin-top:14px">${reg?'Register':'Log in'}</button></form>
 <p class="sm mut" style="margin-top:14px;text-align:center">${reg?'Already registered?':'New here?'} <a href="#${reg?'login':'register'}">${reg?'Log in':'Create an account'}</a></p></div><p class="sm mut" style="text-align:center">${legalLinks}</p></div>`;
 $('#af').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));f.age=!!f.age;f.rm=!!f.rm;const r=await act(reg?'register':'login',f);if(r){await boot();location.hash='#dash';route()}}}
function adminAuth(){A().innerHTML=`<div class="auth"><div class="logo big">${logo}</div><div class="card"><h2>Admin login</h2><form id="al"><label>Username</label><input name="u" autocomplete="username" required><label>Password</label><input name="p" type="password" autocomplete="current-password" required><button class="btn" style="width:100%;margin-top:14px">Log in</button></form></div><p style="text-align:center;margin-top:12px"><a href="#login">← Back to site</a></p></div>`;
 $('#al').onsubmit=async e=>{e.preventDefault();const r=await act('a_login',Object.fromEntries(new FormData(e.target)));if(r){await boot();adminView()}}}

/* ---------- user pages ---------- */
async function load(){D=await api('u_state');pub=D.set}
function pDash(){const u=D.u,pct=Math.min(100,u.usd/pub.min*100);
 return `<h1>Welcome, ${esc(u.username)}</h1><p class="mut">Here is your account at a glance.</p><div class="grid">${[['Total earnings (USD)',usd(u.earned)],['Total earnings (LKR)',lkr(u.earned)],["Today's earnings",usd(u.today)],['Completed ads',u.adsDone],['Available to withdraw',usd(u.usd)],['Pending withdrawals',usd(u.pending)]].map(stat).join('')}</div>
 <div class="card"><div class="row" style="border:0;padding:0"><b>Progress to minimum withdrawal</b><span class="mut sm">${usd(u.usd)} / ${usd(pub.min)}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>
 <div class="card" style="margin-top:14px"><h2>Recent transactions</h2>${txRows(D.tx.slice(0,6))}</div>`}
function pEarn(){const u=D.u,left=u.bonusLeft;
 return `<h1>Earn rewards</h1><p class="mut">You are only paid for ads you choose to watch to the end. Never for clicking.</p>
 <h2 style="margin-top:20px">Watch ads <span class="tag">${u.todayAds}/${pub.maxAds} today</span></h2><div class="grid g2">${D.ads.map(a=>`<div class="card"><h3>${esc(a.title)}</h3><p class="mut sm">${a.secs}s · watch to the end</p><div class="row" style="border:0"><b class="big-n" style="font-size:1.4rem">${usd(a.reward)}</b><button class="btn" data-a="ad" data-id="${a.id}">Watch ad</button></div></div>`).join('')||'<p class="mut">No ads available right now.</p>'}</div>
 <h2 style="margin-top:20px">Daily bonus</h2><div class="card"><div class="row" style="border:0;padding:0"><div><b>${usd(pub.bonus)}</b> every 24 hours<div class="sm mut">Next bonus: <span id="cd">${left?cd(left*1000):'Ready'}</span></div></div><button class="btn" id="bonus" data-a="bonus" ${left?'disabled':''}>Claim bonus</button></div></div>
 <h2 style="margin-top:20px">Reward tasks</h2><div class="card">${D.tasks.map(t=>`<div class="row"><div><b>${esc(t.title)}</b><div class="sm mut">${esc(t.descr)}</div></div><div>${usd(t.reward)} ${t.st?tag(t.st==='approved'?'Completed':t.st==='rejected'?'Rejected':'Pending'):`<button class="btn sm" data-a="task" data-id="${t.id}">Submit</button>`}</div></div>`).join('')||'<p class="mut">No tasks yet.</p>'}</div>`}
function pWallet(){const u=D.u,f=n=>cur==='USD'?usd(n):lkr(n);
 return `<h1>Wallet</h1><div class="row" style="border:0"><div class="cur"><button class="${cur==='USD'?'on':''}" data-a="cur" data-c="USD">USD</button><button class="${cur==='LKR'?'on':''}" data-a="cur" data-c="LKR">LKR</button></div></div>
 <div class="grid">${[['Total balance',u.usd+u.pending],['Available balance',u.usd],['Pending balance',u.pending]].map(s=>stat([s[0],f(s[1])])).join('')}</div>
 <div class="card"><b>Exchange rate:</b> 1 USD = ${pub.rate} LKR <span class="tag">Set by admin</span></div><div class="card" style="margin-top:14px"><h2>Transaction history</h2>${txRows(D.tx)}</div>`}
function pWithdraw(){const u=D.u;
 return `<h1>Withdraw money</h1><div class="grid g2"><div class="card"><h2>Request withdrawal</h2><p class="mut sm">Available: <b>${both(u.usd)}</b><br>Minimum: <b>${usd(pub.min)}</b> (${lkr(pub.min)}). Bank Transfer only. Paid manually by the admin after review.</p>
 <form id="wf"><label>Currency to receive</label><select name="cur"><option>USD</option><option>LKR</option></select><label>Amount (USD)</label><input name="amt" type="number" step="0.01" min="${pub.min}" required><label>Bank name</label><input name="bank" required maxlength="60"><label>Account holder name</label><input name="name" required maxlength="80"><label>Account number / IBAN</label><input name="acct" required maxlength="34" autocomplete="off">
 <p class="sm mut">Bank details are encrypted on the server. The amount is held while the request is reviewed and returned to you if it is rejected.</p><button class="btn" style="width:100%">Submit request</button></form></div>
 <div class="card"><h2>Withdrawal history</h2>${D.wds.map(w=>`<div class="row"><div><b>${usd(w.usd)}</b> → ${w.cur==='LKR'?'Rs '+(+w.payout).toLocaleString('en-LK'):usd(w.payout)} ${tag(w.status)}<div class="sm mut">${esc(w.id)} · acct ••••${esc(w.last4)} · ${dt(w.t)}</div></div></div>`).join('')||'<p class="mut">No withdrawals yet.</p>'}</div></div>`}
function pProfile(){const u=D.u;
 return `<h1>Profile</h1><div class="grid g2"><div class="card"><h2>Account</h2>${[['Username',esc(u.username)],['Email',esc(u.email)],['Registered',new Date(u.created*1000).toLocaleDateString()],['Total earnings',both(u.earned)],['Completed ads',u.adsDone]].map(r=>`<div class="row"><span class="mut">${r[0]}</span><b>${r[1]}</b></div>`).join('')}<button class="btn ghost" style="margin-top:14px" data-a="logout">Log out</button></div>
 <div class="card"><h2>Change password</h2><form id="pf"><label>Current password</label><input name="o" type="password" required><label>New password</label><input name="n" type="password" required><label>Confirm new password</label><input name="c" type="password" required><button class="btn" style="margin-top:14px">Update password</button></form></div></div>`}
const PAGES={dash:pDash,earn:pEarn,wallet:pWallet,withdraw:pWithdraw,profile:pProfile};
function wire(){const wf=$('#wf');if(wf)wf.onsubmit=async e=>{e.preventDefault();const r=await act('wd_create',Object.fromEntries(new FormData(wf)));if(r){toast('Request submitted: '+r.id);await load();render()}};
 const pf=$('#pf');if(pf)pf.onsubmit=async e=>{e.preventDefault();if(await act('pw_change',Object.fromEntries(new FormData(pf)))){pf.reset();toast('Password updated')}};
 clearInterval(tm);if(page==='earn'&&D.u.bonusLeft>0){let l=D.u.bonusLeft;tm=setInterval(()=>{l--;const c=$('#cd');if(!c)return clearInterval(tm);if(l<=0){c.textContent='Ready';const b=$('#bonus');if(b)b.disabled=false;clearInterval(tm)}else c.textContent=cd(l*1000)},1000)}}
function render(){A().innerHTML=shell((PAGES[page]||pDash)());wire()}

/* ---------- admin ---------- */
const AT=[['users','Users'],['wd','Withdrawals'],['subs','Task reviews'],['tx','Transactions'],['ads','Ads'],['tasks','Tasks'],['set','Rates & settings']];
async function adminView(){
 let S;try{S=await api('a_state')}catch(e){ADM=false;return adminAuth()}
 const st=S.stats;window.AS=S;
 const body={
 users:()=>`<input id="sq" placeholder="Search username…" value="${esc(sq)}" style="margin-bottom:10px">${S.users.filter(u=>u.username.toLowerCase().includes(sq.toLowerCase())).map(u=>`<div class="row"><div><b>${esc(u.username)}</b> ${u.suspended==1?'<span class="tag bad">suspended</span>':''}<div class="sm mut">${esc(u.email)} · joined ${new Date(u.created*1000).toLocaleDateString()} · ${u.ads} ads · earned ${usd(u.earned)} · balance ${usd(u.usd)}</div></div><div><button class="btn ghost sm" data-a="usus" data-id="${u.id}">${u.suspended==1?'Unsuspend':'Suspend'}</button> <button class="btn ghost sm" data-a="urst" data-id="${u.id}">Reset password</button></div></div>`).join('')||'<p class="mut">No users.</p>'}`,
 wd:()=>S.wds.map(w=>`<div class="row"><div><b>${esc(w.wid)}</b> ${tag(w.status)} · ${esc(w.username)}<div class="sm mut">${usd(w.usd)} → ${w.cur==='LKR'?'Rs '+(+w.payout).toLocaleString('en-LK'):usd(w.payout)} (rate ${+w.rate}) · ${dt(w.t)}<br>Bank: ${esc(w.d.bank)} · ${esc(w.d.name)} · <b>${esc(w.d.acct)}</b></div></div><div>${({Pending:['Processing','Approved','Rejected'],Processing:['Approved','Completed','Rejected'],Approved:['Completed','Rejected']}[w.status]||[]).map(s=>`<button class="btn ${s==='Rejected'?'ghost':''} sm" data-a="wset" data-id="${w.wid}" data-s="${s}">${s==='Completed'?'Mark paid':s}</button>`).join(' ')}</div></div>`).join('')||'<p class="mut">No withdrawal requests.</p>',
 subs:()=>S.subs.map(s=>`<div class="row"><div><b>${esc(s.title)}</b> · ${esc(s.username)}<div class="sm mut">${usd(s.reward)} · ${dt(s.t)}</div></div><div><button class="btn sm" data-a="sub" data-id="${s.id}" data-ok="1">Approve</button> <button class="btn ghost sm" data-a="sub" data-id="${s.id}" data-ok="0">Reject</button></div></div>`).join('')||'<p class="mut">Nothing to review.</p>',
 tx:()=>txRows(S.tx.map(t=>({...t,note:t.username+' · '+t.note}))),
 ads:()=>`<form id="adf" class="grid"><input name="title" placeholder="Ad title" required><input name="reward" type="number" step="0.01" placeholder="Reward USD" required><input name="secs" type="number" placeholder="Seconds (5-120)" value="15"><button class="btn">Add ad</button></form>${S.ads.map(a=>`<div class="row"><div><b>${esc(a.title)}</b> ${a.active==1?'':'<span class="tag">off</span>'}<div class="sm mut">${usd(a.reward)} · ${a.secs}s</div></div><div><button class="btn ghost sm" data-a="adt" data-id="${a.id}">${a.active==1?'Disable':'Enable'}</button> <button class="btn ghost sm" data-a="addel" data-id="${a.id}">Delete</button></div></div>`).join('')}`,
 tasks:()=>`<form id="tkf" class="grid"><input name="title" placeholder="Task title" required><input name="descr" placeholder="Description" required><input name="reward" type="number" step="0.01" placeholder="Reward USD" required><button class="btn">Add task</button></form>${S.tasks.map(t=>`<div class="row"><div><b>${esc(t.title)}</b> ${t.active==1?'':'<span class="tag">off</span>'}<div class="sm mut">${esc(t.descr)} · ${usd(t.reward)}</div></div><div><button class="btn ghost sm" data-a="tkt" data-id="${t.id}">${t.active==1?'Disable':'Enable'}</button> <button class="btn ghost sm" data-a="tkdel" data-id="${t.id}">Delete</button></div></div>`).join('')}`,
 set:()=>{const c=S.cfg;return `<form id="sf" class="grid"><div><label>USD→LKR rate</label><input name="rate" type="number" step="0.01" value="${esc(c.rate)}"></div><div><label>Rate source note</label><input name="note" placeholder="e.g. CBSL ${new Date().toLocaleDateString()}"></div><div><label>Minimum withdrawal (USD)</label><input name="min" type="number" value="${esc(c.min)}"></div><div><label>Daily bonus (USD)</label><input name="bonus" type="number" step="0.01" value="${esc(c.bonus)}"></div><div><label>Max ads / user / day</label><input name="maxAds" type="number" value="${esc(c.maxAds)}"></div><div><label>Cooldown between ads (s)</label><input name="cool" type="number" value="${esc(c.cool)}"></div><div><label>Ad revenue received (USD, for your records)</label><input name="revenue" type="number" step="0.01" value="${esc(c.revenue)}"></div><div class="chk"><input type="checkbox" name="demo" ${c.demo==1?'checked':''}><span>Show DEMO MODE banner (turn off only after a real ad + payment provider is connected)</span></div><button class="btn">Save settings</button></form>
  <div class="card" style="margin-top:14px"><h2>Rate history</h2>${S.rates.map(r=>`<div class="row"><span>1 USD = ${+r.rate} LKR <span class="mut sm">${esc(r.note||'')}</span></span><span class="sm mut">${dt(r.t)}</span></div>`).join('')||'<p class="mut">No changes yet.</p>'}</div>
  <div class="card" style="margin-top:14px"><h2>Change admin password</h2><form id="apf"><input name="o" type="password" placeholder="Current password" required><input name="n" type="password" placeholder="New password (12+ chars)" required><button class="btn">Update</button></form></div>`}};
 A().innerHTML=`<header class="top"><a class="logo" href="#admin">${logo}</a><span class="tag ac">Admin</span><div class="who" style="margin-left:auto"><a href="#login" class="btn ghost sm">Site</a><button class="btn ghost sm" data-a="alogout">Log out</button></div></header><main class="wrap"><h1>Admin dashboard</h1>
 <div class="grid">${[['Registered users',st.users],['Total rewards credited',usd(st.earned)],['Total paid out (expenses)',usd(st.paid)],['Pending withdrawals',usd(st.pending)],['Ad revenue (recorded)',usd(st.revenue)],['Revenue − rewards',usd(st.revenue-st.earned)]].map(stat).join('')}</div>
 <div class="tabs" style="margin-top:14px">${AT.map(t=>`<button class="${atab===t[0]?'on':''}" data-a="atab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div class="card" id="ab">${body[atab]()}</div></main>`;
 const sqe=$('#sq');if(sqe)sqe.oninput=()=>{sq=sqe.value;adminView().then(()=>{const e=$('#sq');e.focus();e.setSelectionRange(sq.length,sq.length)})};
 const F=(id,fn)=>{const f=$(id);if(f)f.onsubmit=async e=>{e.preventDefault();if(await fn(Object.fromEntries(new FormData(f)),f)){toast('Saved');adminView()}}};
 F('#adf',d=>act('a_ad_save',d));F('#tkf',d=>act('a_task_save',d));F('#apf',(d,f)=>act('a_pw',d).then(r=>{if(r)f.reset();return r}));
 F('#sf',d=>act('a_settings',{...d,demo:!!d.demo}))}

/* ---------- events ---------- */
document.addEventListener('click',async e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=b.dataset.id;
 if(a!=='legal'&&b.tagName==='A'&&b.getAttribute('href')==='#')e.preventDefault();
 const done=async r=>{if(r){await load();render()}};
 switch(a){
 case 'close':return closeM();
 case 'legal':e.preventDefault();return modal(`<h2>${LEGAL[b.dataset.k][0]}</h2>${LEGAL[b.dataset.k][1]}`);
 case 'forgot':e.preventDefault();return modal('<h2>Forgot password</h2><p>Email reset is not available. Contact the administrator, who can set a temporary password for you. Change it right after you log in.</p>');
 case 'logout':await act('logout',{});IN=false;D=null;await boot();location.hash='#login';return route();
 case 'alogout':await act('a_logout',{});ADM=false;await boot();location.hash='#login';return route();
 case 'cur':cur=b.dataset.c;return render();
 case 'bonus':return done(await act('bonus',{}).then(r=>{if(r)toast('Daily bonus added');return r}));
 case 'task':return done(await act('task_submit',{id}).then(r=>{if(r)toast('Submitted for admin review');return r}));
 case 'ad':{const r=await act('ad_start',{id});if(!r)return;let s=r.secs;modal(`<h2>Rewarded ad</h2><p class="mut sm">Ad provider not connected yet: this is a timer placeholder. Keep this window open until the timer ends.</p><div class="big-n" id="ct" style="text-align:center;font-size:2.4rem">${s}</div><button class="btn" id="claim" style="width:100%" disabled>Claim reward</button>`);
  AD=setInterval(()=>{s--;const c=$('#ct');if(!c)return clearInterval(AD);c.textContent=Math.max(0,s);if(s<=0){clearInterval(AD);$('#claim').disabled=false;$('#claim').onclick=async()=>{$('#claim').disabled=true;const x=await act('ad_claim',{});closeM();if(x){toast('Reward credited');await load();render()}}}},1000);return}
 case 'atab':atab=b.dataset.t;return adminView();
 case 'usus':await act('a_user',{id,do:'suspend'});return adminView();
 case 'urst':{if(!confirm('Reset this user\'s password?'))return;const r=await act('a_user',{id,do:'reset'});if(r)modal(`<h2>Temporary password</h2><p>Give this to the user privately and ask them to change it:<br><b>${esc(r.tmp)}</b></p>`);return}
 case 'wset':if(b.dataset.s==='Rejected'&&!confirm('Reject and refund this withdrawal?'))return;await act('a_wd_set',{id,s:b.dataset.s});return adminView();
 case 'sub':await act('a_sub_set',{id,ok:b.dataset.ok==='1'});return adminView();
 case 'adt':{const x=AS.ads.find(x=>x.id==id);await act('a_ad_save',{id,title:x.title,reward:x.reward,secs:x.secs,active:x.active!=1});return adminView()}
 case 'addel':if(confirm('Delete this ad?')){await act('a_ad_del',{id});adminView()}return;
 case 'tkt':{const x=AS.tasks.find(x=>x.id==id);await act('a_task_save',{id,title:x.title,descr:x.descr,reward:x.reward,active:x.active!=1});return adminView()}
 case 'tkdel':if(confirm('Delete this task?')){await act('a_task_del',{id});adminView()}return}});
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeM()});
async function boot(){const j=await api('init');CSRF=j.csrf;IN=j.user;ADM=j.admin;pub=j.set;if(IN)await load().catch(()=>{IN=false})}
async function route(){const h=location.hash.slice(1)||'';
 if(h==='admin')return ADM?adminView():adminAuth();
 if(!IN)return authView(h==='register'?'register':'login');
 page=PAGES[h]?h:'dash';render()}
window.addEventListener('hashchange',async()=>{if(IN&&location.hash!=='#admin'){try{await load()}catch(e){}}route()});
if(!/^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL)||SUPABASE_KEY.startsWith('PASTE'))A().innerHTML='<p style="padding:30px;color:#fff"><b>Setup needed:</b> open config.js and paste your Supabase Project URL and anon key.</p>';
else{mkClient();boot().then(route).catch(()=>{A().innerHTML='<p style="padding:30px;color:#fff">Cannot reach the database. Check config.js and that schema.sql was run in Supabase.</p>'})}
