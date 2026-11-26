<?php
// ONE-TIME SETUP. Creates tables + your admin account, then deletes itself.
require __DIR__ . '/config.php';
ini_set('display_errors', '0');
function page($m){ echo '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;background:#070b16;color:#e8eefc;max-width:420px;margin:40px auto;padding:0 16px">'.$m; exit; }
try { $d = new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); }
catch (Throwable $e) { page('<h2>Database connection failed</h2><p>Check the 4 values in config.php.</p>'); }
try { if ($d->query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0) page('<h2>Already installed</h2><p>Delete install.php from your hosting now.</p>'); } catch (Throwable $e) {}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') page('<h2>CLICK ME setup</h2><form method=post><p>Admin username<br><input name=u required pattern="[A-Za-z0-9_]{4,30}" style="width:100%;padding:10px"></p><p>Admin password (12+ characters)<br><input name=p type=password required minlength=12 style="width:100%;padding:10px"></p><button style="padding:10px 20px">Install</button></form>');
$u = trim($_POST['u'] ?? ''); $p = $_POST['p'] ?? '';
if (!preg_match('/^[A-Za-z0-9_]{4,30}$/', $u) || strlen($p) < 12) page('<p>Invalid username or password too short.</p>');
$sql = [
'CREATE TABLE IF NOT EXISTS users(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(20) NOT NULL UNIQUE,email VARCHAR(120) NOT NULL UNIQUE,pw VARCHAR(255) NOT NULL,usd DECIMAL(12,2) NOT NULL DEFAULT 0,earned DECIMAL(12,2) NOT NULL DEFAULT 0,suspended TINYINT NOT NULL DEFAULT 0,last_bonus INT NOT NULL DEFAULT 0,created INT NOT NULL,ip VARCHAR(45)) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS admins(id INT AUTO_INCREMENT PRIMARY KEY,username VARCHAR(30) NOT NULL UNIQUE,pw VARCHAR(255) NOT NULL) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS ads(id INT AUTO_INCREMENT PRIMARY KEY,title VARCHAR(80) NOT NULL,reward DECIMAL(8,2) NOT NULL,secs INT NOT NULL DEFAULT 15,active TINYINT NOT NULL DEFAULT 1) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS tasks(id INT AUTO_INCREMENT PRIMARY KEY,title VARCHAR(80) NOT NULL,descr VARCHAR(300) NOT NULL,reward DECIMAL(8,2) NOT NULL,active TINYINT NOT NULL DEFAULT 1) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS task_subs(id INT AUTO_INCREMENT PRIMARY KEY,uid INT NOT NULL,tid INT NOT NULL,status VARCHAR(10) NOT NULL DEFAULT "pending",t INT NOT NULL,UNIQUE KEY ut(uid,tid)) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS tx(id INT AUTO_INCREMENT PRIMARY KEY,txid VARCHAR(20) NOT NULL UNIQUE,uid INT NOT NULL,type VARCHAR(12) NOT NULL,amt DECIMAL(12,2) NOT NULL,note VARCHAR(120),demo TINYINT NOT NULL DEFAULT 0,t INT NOT NULL,KEY ut(uid,t)) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS withdrawals(id INT AUTO_INCREMENT PRIMARY KEY,wid VARCHAR(20) NOT NULL UNIQUE,uid INT NOT NULL,usd DECIMAL(12,2) NOT NULL,cur CHAR(3) NOT NULL,rate DECIMAL(10,4) NOT NULL,payout DECIMAL(14,2) NOT NULL,last4 VARCHAR(4),details TEXT NOT NULL,status VARCHAR(12) NOT NULL DEFAULT "Pending",t INT NOT NULL,upd INT NOT NULL,KEY us(uid,status)) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS settings(k VARCHAR(20) PRIMARY KEY,v VARCHAR(60) NOT NULL) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS rates(id INT AUTO_INCREMENT PRIMARY KEY,rate DECIMAL(10,4) NOT NULL,note VARCHAR(60),t INT NOT NULL) ENGINE=InnoDB',
'CREATE TABLE IF NOT EXISTS attempts(id INT AUTO_INCREMENT PRIMARY KEY,k VARCHAR(80) NOT NULL,t INT NOT NULL,KEY kt(k,t)) ENGINE=InnoDB'];
foreach ($sql as $s) $d->exec($s);
foreach (['rate'=>'300','min'=>'200','bonus'=>'0.05','maxAds'=>'20','cool'=>'60','demo'=>'1','revenue'=>'0'] as $k=>$v) $d->prepare('INSERT IGNORE INTO settings VALUES(?,?)')->execute([$k,$v]);
if (!$d->query('SELECT COUNT(*) FROM ads')->fetchColumn()) { $d->exec("INSERT INTO ads(title,reward,secs) VALUES('Rewarded video - short',0.18,15),('Rewarded video - extended',0.28,30)"); }
if (!is_file(__DIR__.'/keyfile.php')) file_put_contents(__DIR__.'/keyfile.php', "<?php return '".bin2hex(random_bytes(32))."';\n");
$d->prepare('INSERT INTO admins(username,pw) VALUES(?,?)')->execute([$u, password_hash($p, PASSWORD_DEFAULT)]);
@unlink(__FILE__);
page('<h2>Installed ✔</h2><p>Admin account created. Open <b>your-site/#admin</b> to log in.</p><p>If install.php still exists in File Manager, <b>delete it now</b>.</p>');
