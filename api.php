<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
ini_set('display_errors', '0'); ini_set('session.gc_maxlifetime', '1209600'); ini_set('session.use_strict_mode', '1');
header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff'); header('X-Frame-Options: DENY');
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_name('cm_sid');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$https,'httponly'=>true,'samesite'=>'Strict']);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));

function out($d){ echo json_encode($d); exit; }
function fail(string $m, int $c = 400){ http_response_code($c); out(['err'=>$m]); }
function db(): PDO { static $p; if (!$p) $p = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]); return $p; }
set_exception_handler(function($e){ try{ if(db()->inTransaction()) db()->rollBack(); }catch(Throwable $x){} error_log($e->getMessage()); fail('Server error, try again', 500); });
function q(string $sql, array $a = []){ $s = db()->prepare($sql); $s->execute($a); return $s; }
function body(): array { static $b; if ($b === null) { $r = file_get_contents('php://input'); $b = $r ? json_decode($r, true) : []; if (!is_array($b)) $b = []; } return $b; }
function S(string $k, $d = ''){ $v = body()[$k] ?? $d; return is_string($v) ? trim($v) : $v; }
function cfg(): array { static $c; if ($c === null) { $c = []; foreach (q('SELECT k,v FROM settings') as $r) $c[$r['k']] = $r['v']; } return $c; }
function ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '0', 0, 45); }
function throttle(string $k, int $max, int $win){ $n = (int)q('SELECT COUNT(*) FROM attempts WHERE k=? AND t>?', [$k, time()-$win])->fetchColumn(); if ($n >= $max) fail('Too many attempts. Wait a few minutes.', 429); q('INSERT INTO attempts(k,t) VALUES(?,?)', [$k, time()]); }
function tid(): string { return 'TX-'.strtoupper(bin2hex(random_bytes(5))); }
function enc(string $s): string { $iv = random_bytes(12); $c = openssl_encrypt($s, 'aes-256-gcm', hex2bin(ENC_KEY), OPENSSL_RAW_DATA, $iv, $tag); return base64_encode($iv.$tag.$c); }
function dec(string $s): array { $b = base64_decode($s); $r = openssl_decrypt(substr($b,28), 'aes-256-gcm', hex2bin(ENC_KEY), OPENSSL_RAW_DATA, substr($b,0,12), substr($b,12,16)); return $r ? (json_decode($r, true) ?: []) : []; }
function user(): array { if (empty($_SESSION['uid'])) fail('Please log in', 401); $u = q('SELECT * FROM users WHERE id=?', [$_SESSION['uid']])->fetch(); if (!$u || $u['suspended']) { $_SESSION = []; fail('Account unavailable', 403); } return $u; }
function admin(): int { if (empty($_SESSION['admin']) || time() - ($_SESSION['at'] ?? 0) > 1800) { unset($_SESSION['admin']); fail('Admin login required', 401); } $_SESSION['at'] = time(); return (int)$_SESSION['admin']; }
function credit(int $uid, float $amt, string $type, string $note, bool $earn = true){ $d = cfg()['demo'] ?? '1'; q('UPDATE users SET usd=usd+?, earned=earned+? WHERE id=?', [$amt, $earn ? $amt : 0, $uid]); q('INSERT INTO tx(txid,uid,type,amt,note,demo,t) VALUES(?,?,?,?,?,?,?)', [tid(), $uid, $type, $amt, $note, $earn ? (int)$d : 0, time()]); }
function pwok(string $p): bool { return strlen($p) >= 8 && preg_match('/[A-Za-z]/', $p) && preg_match('/\d/', $p); }
function login_ok(array $u){ session_regenerate_id(true); $_SESSION['uid'] = (int)$u['id']; $_SESSION['csrf'] = bin2hex(random_bytes(16)); }

$a = $_GET['a'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF'] ?? '')) fail('Session expired. Refresh the page.', 403);
  $o = $_SERVER['HTTP_ORIGIN'] ?? ''; if ($o && parse_url($o, PHP_URL_HOST) !== explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]) fail('Bad origin', 403);
}
$pub = fn() => ['rate'=>(float)cfg()['rate'], 'min'=>(float)cfg()['min'], 'bonus'=>(float)cfg()['bonus'], 'maxAds'=>(int)cfg()['maxAds'], 'demo'=>(int)cfg()['demo']];

switch ($a) {
case 'init':
  out(['csrf'=>$_SESSION['csrf'], 'user'=>!empty($_SESSION['uid']), 'admin'=>!empty($_SESSION['admin']) && time()-($_SESSION['at']??0) <= 1800, 'set'=>$pub()]);

case 'register':
  throttle('reg:'.ip(), 5, 3600);
  $un = S('u'); $em = strtolower(S('e')); $p = (string)S('p');
  if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $un)) fail('Username: 3-20 letters, numbers or _');
  if (!filter_var($em, FILTER_VALIDATE_EMAIL) || strlen($em) > 120) fail('Invalid email');
  if (!pwok($p)) fail('Password needs 8+ characters with a letter and a number');
  if ($p !== S('c')) fail('Passwords do not match');
  if (!S('age')) fail('You must confirm the age requirement and accept the terms');
  try { q('INSERT INTO users(username,email,pw,created,ip) VALUES(?,?,?,?,?)', [$un, $em, password_hash($p, PASSWORD_DEFAULT), time(), ip()]); }
  catch (PDOException $e) { fail('Username or email already in use'); }
  login_ok(q('SELECT * FROM users WHERE email=?', [$em])->fetch()); out(['ok'=>1]);

case 'login':
  $id = strtolower(S('u')); throttle('lg:'.ip(), 15, 600); throttle('lu:'.$id, 6, 600);
  $u = q('SELECT * FROM users WHERE LOWER(username)=? OR email=?', [$id, $id])->fetch();
  if (!$u || !password_verify((string)S('p'), $u['pw'])) fail('Wrong username/email or password');
  if ($u['suspended']) fail('This account is suspended', 403);
  login_ok($u);
  if (S('rm')) setcookie(session_name(), session_id(), ['expires'=>time()+1209600,'path'=>'/','secure'=>$https,'httponly'=>true,'samesite'=>'Strict']);
  out(['ok'=>1]);

case 'logout': unset($_SESSION['uid']); session_regenerate_id(true); out(['ok'=>1]);

case 'u_state':
  $u = user(); $c = cfg(); $uid = (int)$u['id']; $day = strtotime('today');
  $pend = (float)q('SELECT COALESCE(SUM(usd),0) FROM withdrawals WHERE uid=? AND status IN("Pending","Processing","Approved")', [$uid])->fetchColumn();
  $tx = q('SELECT txid id,type,amt,note,demo,t FROM tx WHERE uid=? ORDER BY id DESC LIMIT 100', [$uid])->fetchAll();
  $wds = q('SELECT wid id,usd,cur,payout,status,last4,t FROM withdrawals WHERE uid=? ORDER BY id DESC LIMIT 50', [$uid])->fetchAll();
  out(['u'=>['username'=>$u['username'],'email'=>$u['email'],'created'=>(int)$u['created'],'usd'=>(float)$u['usd'],'earned'=>(float)$u['earned'],'pending'=>$pend,
    'adsDone'=>(int)q('SELECT COUNT(*) FROM tx WHERE uid=? AND type="ad"', [$uid])->fetchColumn(),
    'today'=>(float)q('SELECT COALESCE(SUM(amt),0) FROM tx WHERE uid=? AND amt>0 AND t>=?', [$uid, $day])->fetchColumn(),
    'todayAds'=>(int)q('SELECT COUNT(*) FROM tx WHERE uid=? AND type="ad" AND t>=?', [$uid, $day])->fetchColumn(),
    'bonusLeft'=>max(0, (int)$u['last_bonus'] + 86400 - time())],
    'tx'=>$tx, 'wds'=>$wds, 'ads'=>q('SELECT id,title,reward,secs FROM ads WHERE active=1')->fetchAll(),
    'tasks'=>q('SELECT t.id,t.title,t.descr,t.reward,s.status st FROM tasks t LEFT JOIN task_subs s ON s.tid=t.id AND s.uid=? WHERE t.active=1', [$uid])->fetchAll(), 'set'=>$pub()]);

case 'ad_start':
  $u = user(); $c = cfg(); $ad = q('SELECT * FROM ads WHERE id=? AND active=1', [(int)S('id')])->fetch(); if (!$ad) fail('Ad not available');
  $day = strtotime('today');
  if ((int)q('SELECT COUNT(*) FROM tx WHERE uid=? AND type="ad" AND t>=?', [$u['id'], $day])->fetchColumn() >= (int)$c['maxAds']) fail('Daily ad limit reached');
  $last = (int)q('SELECT COALESCE(MAX(t),0) FROM tx WHERE uid=? AND type="ad"', [$u['id']])->fetchColumn();
  if (time() - $last < (int)$c['cool']) fail('Please wait '.((int)$c['cool'] - (time()-$last)).'s before the next ad');
  $_SESSION['ad'] = ['id'=>(int)$ad['id'], 't'=>time()]; out(['secs'=>(int)$ad['secs']]);

case 'ad_claim': // NOTE: when a real ad provider is connected, verify its server-to-server confirmation here instead of the timer.
  $u = user(); $s = $_SESSION['ad'] ?? null; unset($_SESSION['ad']); if (!$s) fail('No ad in progress');
  $ad = q('SELECT * FROM ads WHERE id=? AND active=1', [$s['id']])->fetch(); if (!$ad) fail('Ad not available');
  if (time() - $s['t'] < (int)$ad['secs']) fail('Ad not completed');
  db()->beginTransaction(); q('SELECT id FROM users WHERE id=? FOR UPDATE', [$u['id']]);
  if (time() - (int)q('SELECT COALESCE(MAX(t),0) FROM tx WHERE uid=? AND type="ad"', [$u['id']])->fetchColumn() < (int)cfg()['cool']) { db()->rollBack(); fail('Too fast'); }
  credit((int)$u['id'], (float)$ad['reward'], 'ad', 'Rewarded ad: '.$ad['title']); db()->commit(); out(['ok'=>1]);

case 'bonus':
  $u = user(); db()->beginTransaction(); $l = (int)q('SELECT last_bonus FROM users WHERE id=? FOR UPDATE', [$u['id']])->fetchColumn();
  if (time() - $l < 86400) { db()->rollBack(); fail('Bonus not ready yet'); }
  q('UPDATE users SET last_bonus=? WHERE id=?', [time(), $u['id']]); credit((int)$u['id'], (float)cfg()['bonus'], 'bonus', 'Daily bonus'); db()->commit(); out(['ok'=>1]);

case 'task_submit':
  $u = user(); if (!q('SELECT id FROM tasks WHERE id=? AND active=1', [(int)S('id')])->fetch()) fail('Task not found');
  try { q('INSERT INTO task_subs(uid,tid,t) VALUES(?,?,?)', [$u['id'], (int)S('id'), time()]); } catch (PDOException $e) { fail('Already submitted'); } out(['ok'=>1]);

case 'wd_create':
  $u = user(); $c = cfg(); throttle('wd:'.$u['id'], 5, 86400);
  $amt = round((float)S('amt'), 2); $cur = S('cur'); $bank = mb_substr((string)S('bank'), 0, 60); $nm = mb_substr((string)S('name'), 0, 80); $ac = preg_replace('/\s+/', '', (string)S('acct'));
  if (!in_array($cur, ['USD','LKR'], true)) fail('Choose USD or LKR');
  if ($amt < (float)$c['min']) fail('Minimum withdrawal is $'.number_format((float)$c['min'], 2).' USD');
  if (strlen($bank) < 2 || strlen($nm) < 2 || !preg_match('/^[A-Za-z0-9\-]{6,34}$/', $ac)) fail('Enter valid bank name, account holder name and account number');
  db()->beginTransaction(); $bal = (float)q('SELECT usd FROM users WHERE id=? FOR UPDATE', [$u['id']])->fetchColumn();
  if ($amt > $bal) { db()->rollBack(); fail('Amount is more than your available balance'); }
  $rate = (float)$c['rate']; $pay = $cur === 'LKR' ? round($amt * $rate, 2) : $amt; $wid = 'WD-'.strtoupper(bin2hex(random_bytes(5)));
  q('UPDATE users SET usd=usd-? WHERE id=?', [$amt, $u['id']]);
  q('INSERT INTO withdrawals(wid,uid,usd,cur,rate,payout,last4,details,t,upd) VALUES(?,?,?,?,?,?,?,?,?,?)', [$wid, $u['id'], $amt, $cur, $rate, $pay, substr($ac, -4), enc(json_encode(['bank'=>$bank,'name'=>$nm,'acct'=>$ac])), time(), time()]);
  q('INSERT INTO tx(txid,uid,type,amt,note,demo,t) VALUES(?,?,?,?,?,0,?)', [tid(), $u['id'], 'withdraw', -$amt, 'Withdrawal request '.$wid, time()]); db()->commit(); out(['id'=>$wid]);

case 'pw_change':
  $u = user(); if (!password_verify((string)S('o'), $u['pw'])) fail('Current password is wrong');
  if (!pwok((string)S('n'))) fail('New password needs 8+ characters with a letter and a number'); if (S('n') !== S('c')) fail('Passwords do not match');
  q('UPDATE users SET pw=? WHERE id=?', [password_hash((string)S('n'), PASSWORD_DEFAULT), $u['id']]); session_regenerate_id(true); out(['ok'=>1]);

/* ---------------- ADMIN ---------------- */
case 'a_login':
  throttle('al:'.ip(), 5, 900); $r = q('SELECT * FROM admins WHERE username=?', [S('u')])->fetch();
  if (!$r || !password_verify((string)S('p'), $r['pw'])) fail('Invalid admin credentials');
  session_regenerate_id(true); $_SESSION['admin'] = (int)$r['id']; $_SESSION['at'] = time(); $_SESSION['csrf'] = bin2hex(random_bytes(16)); out(['ok'=>1]);
case 'a_logout': unset($_SESSION['admin']); session_regenerate_id(true); out(['ok'=>1]);

case 'a_state':
  admin(); $w = q('SELECT w.*, u.username FROM withdrawals w JOIN users u ON u.id=w.uid ORDER BY w.id DESC LIMIT 200')->fetchAll();
  foreach ($w as &$x) { $x['d'] = dec($x['details']); unset($x['details']); } unset($x);
  out(['stats'=>['users'=>(int)q('SELECT COUNT(*) FROM users')->fetchColumn(), 'earned'=>(float)q('SELECT COALESCE(SUM(earned),0) FROM users')->fetchColumn(),
      'paid'=>(float)q('SELECT COALESCE(SUM(usd),0) FROM withdrawals WHERE status="Completed"')->fetchColumn(), 'pending'=>(float)q('SELECT COALESCE(SUM(usd),0) FROM withdrawals WHERE status IN("Pending","Processing","Approved")')->fetchColumn(), 'revenue'=>(float)cfg()['revenue']],
    'users'=>q('SELECT u.id,username,email,created,usd,earned,suspended,(SELECT COUNT(*) FROM tx WHERE uid=u.id AND type="ad") ads FROM users u ORDER BY id DESC LIMIT 500')->fetchAll(),
    'wds'=>$w, 'tx'=>q('SELECT t.txid,t.type,t.amt,t.note,t.demo,t.t,u.username FROM tx t JOIN users u ON u.id=t.uid ORDER BY t.id DESC LIMIT 200')->fetchAll(),
    'ads'=>q('SELECT * FROM ads ORDER BY id')->fetchAll(), 'tasks'=>q('SELECT * FROM tasks ORDER BY id')->fetchAll(),
    'subs'=>q('SELECT s.id,s.t,u.username,k.title,k.reward FROM task_subs s JOIN users u ON u.id=s.uid JOIN tasks k ON k.id=s.tid WHERE s.status="pending" ORDER BY s.id')->fetchAll(),
    'cfg'=>cfg(), 'rates'=>q('SELECT rate,note,t FROM rates ORDER BY id DESC LIMIT 10')->fetchAll()]);

case 'a_wd_set':
  admin(); $to = S('s'); $ok = ['Pending'=>['Processing','Approved','Rejected'], 'Processing'=>['Approved','Completed','Rejected'], 'Approved'=>['Completed','Rejected']];
  db()->beginTransaction(); $w = q('SELECT * FROM withdrawals WHERE wid=? FOR UPDATE', [S('id')])->fetch();
  if (!$w || !in_array($to, $ok[$w['status']] ?? [], true)) { db()->rollBack(); fail('Invalid status change'); }
  if ($to === 'Rejected') { q('SELECT id FROM users WHERE id=? FOR UPDATE', [$w['uid']]); credit((int)$w['uid'], (float)$w['usd'], 'refund', 'Refund '.$w['wid'].' (rejected)', false); }
  q('UPDATE withdrawals SET status=?, upd=? WHERE id=?', [$to, time(), $w['id']]); db()->commit(); out(['ok'=>1]);

case 'a_sub_set':
  admin(); db()->beginTransaction(); $s = q('SELECT s.*,k.reward,k.title FROM task_subs s JOIN tasks k ON k.id=s.tid WHERE s.id=? AND s.status="pending" FOR UPDATE', [(int)S('id')])->fetch();
  if (!$s) { db()->rollBack(); fail('Not found'); } $ap = S('ok') ? 1 : 0;
  q('UPDATE task_subs SET status=? WHERE id=?', [$ap ? 'approved' : 'rejected', $s['id']]); if ($ap) credit((int)$s['uid'], (float)$s['reward'], 'task', 'Task: '.$s['title']); db()->commit(); out(['ok'=>1]);

case 'a_user':
  admin(); $id = (int)S('id');
  if (S('do') === 'suspend') { q('UPDATE users SET suspended=1-suspended WHERE id=?', [$id]); out(['ok'=>1]); }
  if (S('do') === 'reset') { $t = 'Tmp'.bin2hex(random_bytes(4)).'9'; q('UPDATE users SET pw=? WHERE id=?', [password_hash($t, PASSWORD_DEFAULT), $id]); out(['tmp'=>$t]); }
  fail('Bad request');

case 'a_ad_save':
  admin(); $t = mb_substr((string)S('title'), 0, 80); $r = round((float)S('reward'), 2); $s = max(5, min(120, (int)S('secs'))); if ($t === '' || $r < 0 || $r > 100) fail('Invalid ad');
  if ($id = (int)S('id')) q('UPDATE ads SET title=?,reward=?,secs=?,active=? WHERE id=?', [$t, $r, $s, S('active') ? 1 : 0, $id]); else q('INSERT INTO ads(title,reward,secs) VALUES(?,?,?)', [$t, $r, $s]); out(['ok'=>1]);
case 'a_ad_del': admin(); q('DELETE FROM ads WHERE id=?', [(int)S('id')]); out(['ok'=>1]);
case 'a_task_save':
  admin(); $t = mb_substr((string)S('title'), 0, 80); $d = mb_substr((string)S('descr'), 0, 300); $r = round((float)S('reward'), 2); if ($t === '' || $r < 0 || $r > 100) fail('Invalid task');
  if ($id = (int)S('id')) q('UPDATE tasks SET title=?,descr=?,reward=?,active=? WHERE id=?', [$t, $d, $r, S('active') ? 1 : 0, $id]); else q('INSERT INTO tasks(title,descr,reward) VALUES(?,?,?)', [$t, $d, $r]); out(['ok'=>1]);
case 'a_task_del': admin(); q('DELETE FROM tasks WHERE id=?', [(int)S('id')]); out(['ok'=>1]);

case 'a_settings':
  admin(); $rate = (float)S('rate'); if ($rate <= 0 || $rate > 100000) fail('Invalid rate');
  $v = ['rate'=>$rate, 'min'=>max(1, (float)S('min')), 'bonus'=>max(0, (float)S('bonus')), 'maxAds'=>max(1, (int)S('maxAds')), 'cool'=>max(0, (int)S('cool')), 'demo'=>S('demo') ? 1 : 0, 'revenue'=>max(0, (float)S('revenue'))];
  if ($rate != (float)cfg()['rate']) q('INSERT INTO rates(rate,note,t) VALUES(?,?,?)', [$rate, mb_substr((string)S('note'), 0, 60), time()]);
  foreach ($v as $k => $x) q('REPLACE INTO settings VALUES(?,?)', [$k, (string)$x]); out(['ok'=>1]);

case 'a_pw':
  $id = admin(); $r = q('SELECT * FROM admins WHERE id=?', [$id])->fetch(); if (!password_verify((string)S('o'), $r['pw'])) fail('Current password is wrong'); if (strlen((string)S('n')) < 12) fail('Use 12+ characters');
  q('UPDATE admins SET pw=? WHERE id=?', [password_hash((string)S('n'), PASSWORD_DEFAULT), $id]); out(['ok'=>1]);

default: fail('Not found', 404);
}
