<?php
// ====== EDIT THESE 4 LINES (InfinityFree: Control Panel > MySQL Databases) ======
const DB_HOST = 'sqlXXX.infinityfree.com';
const DB_NAME = 'if0_XXXXXXXX_clickme';
const DB_USER = 'if0_XXXXXXXX';
const DB_PASS = 'YOUR_DB_PASSWORD';
// ================================================================================
// Encryption key for bank details is generated automatically by install.php (keyfile.php)
$k = @include __DIR__ . '/keyfile.php';
define('ENC_KEY', is_string($k) ? $k : str_repeat('0', 64));
date_default_timezone_set('Asia/Colombo');
