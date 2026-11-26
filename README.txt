CLICK ME - setup on InfinityFree
1. Control Panel > MySQL Databases: create a database. Copy host, name, user, password.
2. Edit config.php (4 lines) with those values.
3. File Manager > htdocs: upload ALL files (index.html, style.css, app.js, api.php, config.php, install.php, .htaccess).
4. Open yoursite/install.php, choose your admin username + a strong password (12+). It creates the tables, then deletes itself (delete it manually if it is still there).
5. Admin login: yoursite/#admin
6. Enable the free SSL certificate in InfinityFree so the site runs on https://.
